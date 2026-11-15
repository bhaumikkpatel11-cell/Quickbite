# QuickBite Milestone M1A Repair Progress

Tracked progress for instructor review items:
- Initial Review: **R1–R8** (addressed in Review v2)
- Follow-Up Review: **F1–F4** (addressed in Review v3 from `INSTRUCTOR_REVIEW_V2.md`)

> **Note on Test Count History**: Earlier progress logs recorded interim counts (7, 14, 25, 32, and 46 tests) at intermediate development checkpoints. The authoritative verified test suite count for the complete M1A milestone is now **63 passed tests (35 server, 28 worker)** and **1 skipped test** (PostgreSQL integration suite explicitly BLOCKED when `TEST_DATABASE_URL` is unconfigured).

---

## Summary of Review Items

| Item | Title | Status | Files Changed | Verification Evidence | Next Action |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **R1** | Remove unauthenticated scheduler access | fixed | `worker/src/index.ts`, `worker/tests/worker.test.ts` | Unit test: `proves public POST /trigger is removed and cannot trigger outbound dispatch` passes | Completed |
| **R2** | Fix root .env loading | fixed | `server/src/config.ts`, `server/tests/config.test.ts` | Unit tests: root .env discovery & external env var precedence verified | Completed |
| **R3** | Fix Worker timeouts and success validation | fixed | `worker/src/index.ts`, `worker/tests/worker.test.ts` | Config requirements, 90s timeout capability, stalled body timeout, receipt schema/job/timestamp matching, redirect rejection verified | Completed |
| **R4** | Make database tests explicitly isolated | fixed | `server/tests/db.integration.test.ts` | Disallowed DATABASE_URL fallback; requires explicit TEST_DATABASE_URL distinct from app DB; closes pools in `afterAll`; explicitly BLOCKED when unset | Completed |
| **R5** | Apply real database query bounds | fixed | `server/src/db/pool.ts`, `server/src/routes/health.ts`, `server/tests/health.test.ts` | Statement & query timeouts configured in pool; timer cleared in finally; in-flight deduplication verified (1 query for 3 concurrent requests); docs updated | Completed |
| **R6** | Remove insecure TLS fallback | fixed | `server/src/db/pool.ts`, `server/tests/health.test.ts` | Removed `rejectUnauthorized: false`; enforced `{ rejectUnauthorized: true }` on remote/Neon connections | Completed |
| **R7** | Fix API namespace and error handling | fixed | `server/src/middleware/spa.ts`, `server/src/app.ts`, `server/tests/spa.test.ts` | Excluded bare `/api` and `/internal` namespace roots; added JSON error handling for malformed JSON (400) and oversized payload (413); 9/9 tests pass in `spa.test.ts` | Completed |
| **R8** | Fix review-package integrity | fixed | `scripts/package-review.mjs`, `docs/reviews/M1A/FILE_MANIFEST.md` | Omitted manifest self-hash; implemented line-by-line secret scanner; enforced forward slashes in ZIP; post-creation archive hash verification passed | Completed |
| **F1** | Configuration tests destroy root .env | fixed | `server/src/config.ts`, `server/tests/config.test.ts` | Tests decoupled into OS tempdir disposable workspace fixture (`qb-fixture-workspace-*`); root `.env` is never written or deleted; 3/3 tests pass | Completed |
| **F2** | Database isolation beyond URL text inequality | fixed | `server/tests/db.integration.test.ts` | Parsed target endpoint check (`checkDatabaseTargetsIdentical`), per-run disposable schemas (`test_qb_<uuid>`) via search_path, `try ... finally` pool closing; retained explicit BLOCKED skip | Completed |
| **F3** | Connection-string TLS settings override options | fixed | `server/src/db/pool.ts`, `server/tests/health.test.ts` | Strict hostname parsing, explicit rejection of insecure `sslmode`, stripped conflicting query params, enforced `rejectUnauthorized: true` on remote; verified via offline `pg.Client` connectionParameters tests (11/11 tests pass in `health.test.ts`) | Completed |
| **F4** | Worker configuration & receipt hardening | fixed | `worker/src/index.ts`, `worker/tests/worker.test.ts` | Implemented `validateWorkerConfig`: origin-only `APP_URL`, remote HTTPS enforcement, `TICK_TIMEOUT_MS` bounded integer validation `[1, 120000]`, default 90s, receipt JSON null/array hardening; 14 new tests added (28/28 worker tests pass) | Completed |

---

## Detailed Item Log

### R1: Remove unauthenticated scheduler access
- **Status**: fixed
- **Changes**: Removed public `/trigger` route from `worker/src/index.ts`. Only scheduled cron events invoke `dispatchTick`. Public `worker.fetch()` returns 404 Not Found for `/trigger`.
- **Evidence**: Regression test `proves public POST /trigger is removed and cannot trigger outbound dispatch` verifies 404 response and zero outbound fetch calls.

### R2: Fix root .env loading
- **Status**: fixed
- **Changes**: Updated `server/src/config.ts` to locate repository root traversing up from `import.meta.url` looking for workspace `package.json`. Implemented `loadEnv()` and mutable getters/setters syncing with `process.env`. Precedence of externally set variables is preserved.
- **Evidence**: `server/tests/config.test.ts` verifies repo root resolution, root `.env` loading, and that externally supplied env vars override file values.

### R3: Fix Worker timeouts and success validation
- **Status**: fixed
- **Changes**:
  - Removed silent `APP_URL` default to localhost; fails safely when either `APP_URL` or `TICK_SECRET` is missing.
  - Made timeout configurable via `env.TICK_TIMEOUT_MS` (default 90,000 ms to support hosting cold start).
  - Maintained abort signal protection through response-body reading (`response.text()`).
  - Added strict receipt validation: status must equal `'recorded'`, `job_name` must match requested, and `scheduled_for` timestamp must match requested ISO timestamp.
  - Enforced `redirect: 'error'` to fail closed on unexpected redirects.
- **Evidence**: `worker/tests/worker.test.ts` verifies timeout aborts, body stream timeout, HTML 200 rejection, malformed JSON rejection, receipt status/job/timestamp mismatch rejections, and retry identity preservation.

### R4: Make database tests explicitly isolated
- **Status**: fixed
- **Changes**:
  - Removed insecure fallback to `DATABASE_URL` containing `"test"`.
  - Added safeguard ensuring `TEST_DATABASE_URL` is configured and not identical to `DATABASE_URL`.
  - Updated record cleanup to target exact test timestamps and jobs (`cutoff` at `2026-11-15T23:00:00.000Z`, `cutoff_retry` at `2026-11-15T23:10:00.000Z`).
  - Added `closePool()` alongside `testPool.end()` in `afterAll`.
  - Maintained `it.skip` with explicit BLOCKED note when `TEST_DATABASE_URL` is unset, without replacing real DB tests with mocks.
- **Evidence**: `npm test` cleanly reports `db.integration.test.ts` as skipped/BLOCKED when `TEST_DATABASE_URL` is empty.

### R5: Apply real database query bounds
- **Status**: fixed
- **Changes**:
  - In `server/src/db/pool.ts`, configured `statement_timeout` and `query_timeout` matching `config.dbQueryTimeoutMs`.
  - In `server/src/routes/health.ts`, ensured `clearTimeout(timeoutHandle)` is invoked in a `finally` block to prevent timer leaks.
  - Implemented in-flight promise deduplication (`inFlightCheck`) so concurrent uncached `/readyz` probes share a single database check rather than spawning redundant queries.
  - Updated architectural comments to document that readiness caching reduces queries but does not guarantee Neon compute suspension if polled periodically by external monitors.
  - Kept `/livez` completely database-free.
- **Evidence**: `server/tests/health.test.ts` verifies in-flight deduplication (3 concurrent calls produce 1 query), pool config timeouts, and `/livez` DB-free guarantee.

### R6: Remove insecure TLS fallback
- **Status**: fixed
- **Changes**:
  - Removed `rejectUnauthorized: false` from `server/src/db/pool.ts`.
  - Enforced `{ rejectUnauthorized: true }` for remote Neon/production connections with standard Web PKI certificates.
  - Preserved `undefined` SSL for local development databases without logging credentials.
- **Evidence**: `server/tests/health.test.ts` verifies that `createPoolConfig` applies `{ rejectUnauthorized: true }` for remote Neon connections and never sets `rejectUnauthorized: false`.

### R7: Fix API namespace and error handling
- **Status**: fixed
- **Changes**:
  - In `server/src/middleware/spa.ts`, implemented `isApiOrHealthPath` to guard both bare namespace roots (`/api`, `/internal`, `/livez`, `/readyz`) and their subpaths against SPA HTML fallback.
  - In `server/src/app.ts`, added centralized JSON error handler catching `SyntaxError` (400 `Malformed JSON payload`), `entity.too.large` (413 `Payload exceeds size limit`), other 4xx client errors, and sanitized 500 internal errors without leaking HTML or stack traces.
- **Evidence**: `server/tests/spa.test.ts` (9 tests passed) verifies that bare `/api` and `/internal` return 404 JSON, malformed JSON returns 400 JSON, oversized body returns 413 JSON, and frontend navigation routes serve HTML.

### R8: Fix review-package integrity
- **Status**: fixed
- **Changes**:
  - In `scripts/package-review.mjs`, omitted the manifest self-hash to preserve cryptographic accuracy.
  - Implemented line-by-line secret scanner evaluating connection strings (`postgres://` and `postgresql://`), private keys, and token patterns without exempting entire files based on isolated placeholders.
  - Added explicit notice stating scanner limitations and necessity of manual inspection.
  - Enforced portable forward-slash entry paths (`.Replace('\\', '/')`) inside generated ZIP files.
  - Added post-creation archive internal verification confirming SHA-256 hashes of every indexed file directly inside the created ZIP archive.
  - Generated companion `.sha256` checksum file for the archive.
  - Included `INSTRUCTOR_REVIEW.md`, `INSTRUCTOR_REVIEW_V2.md`, and `REPAIR_PROGRESS.md` in explicit package inclusions.
- **Evidence**: Generated ZIP passes 100% hash verification against extracted entries and matches all SHA-256 manifest records.

---

## Follow-Up Item Log (INSTRUCTOR_REVIEW_V2.md)

### F1: Configuration tests destroy root .env
- **Status**: fixed
- **Changes**:
  - In `server/src/config.ts`, added `loadLocalFallback: boolean` (default `true` for runtime, injectable as `false` for isolated testing) to prevent accidental reading of ambient `.env` files during test execution.
  - In `server/tests/config.test.ts`, completely decoupled tests from the repository root. Tests create an isolated OS temporary directory (`os.tmpdir()/qb-fixture-workspace-*`) containing a mock workspace `package.json`, exercising root discovery and `.env` parsing without writing, reading, or deleting the real project `.env`.
  - All test artifacts are cleaned up safely in temporary directories owned exclusively by the test suite.
- **Evidence**: `server/tests/config.test.ts` (3 tests passed) verifies root discovery, `.env` parsing, and external environment variable precedence. The repository root `.env` was never created, modified, or deleted during test runs.

### F2: URL text inequality does not establish database isolation
- **Status**: fixed
- **Changes**:
  - In `server/tests/db.integration.test.ts`, replaced simplistic string inequality with `checkDatabaseTargetsIdentical(url1, url2)` checking parsed hostname, port, and database name.
  - Enforced per-run disposable schemas: every test run generates a unique schema `test_qb_<uuid>`, executes migrations and queries scoped to that schema via `options=-c search_path=...`, and drops the schema cascade on cleanup.
  - Wrapped cleanup in `try ... finally` ensuring both `testPool.end()` and `closePool()` are called reliably even if test assertions or cleanup queries fail.
  - Kept the suite explicitly BLOCKED via `it.skip` when `TEST_DATABASE_URL` is unconfigured.
- **Evidence**: Real database tests remain clearly marked as skipped/BLOCKED when `TEST_DATABASE_URL` is empty, avoiding false claims of test completion.

### F3: Connection-string TLS settings override explicit options
- **Status**: fixed
- **Changes**:
  - In `server/src/db/pool.ts`, implemented `isLocalHost(hostname)` parsing URL hostnames (`localhost`, `127.0.0.1`, `[::1]`, `::1`).
  - For remote hosts: parsed the connection string URL, explicitly rejected insecure TLS settings (`sslmode=disable`, `sslmode=no-verify`, `sslmode=allow`, `sslmode=prefer`) with a descriptive error, stripped `sslmode` and `ssl` from `parsed.searchParams` so `pg-connection-string` cannot override explicit options, and applied `ssl: { rejectUnauthorized: true }`.
  - For localhost development: permitted plain unencrypted connections (`ssl: undefined`).
  - Added 3 offline unit tests in `server/tests/health.test.ts` instantiating `new pg.Client(poolConfig)` with mock URLs and checking `client.connectionParameters.ssl` directly, verifying that remote connections enforce `{ rejectUnauthorized: true }`, reject `no-verify` and `disable`, and allow localhost.
- **Evidence**: `server/tests/health.test.ts` (11 tests passed) confirms effective `connectionParameters.ssl` without making any real network connections.

### F4: Worker configuration & receipt hardening
- **Status**: fixed
- **Changes**:
  - In `worker/src/index.ts`, implemented `validateWorkerConfig(env)` executed before any network dispatch:
    - `APP_URL`: validated as a pure origin with no embedded credentials (`username`, `password`), no query (`search`), no fragment (`hash`), and no path (`pathname === '' || pathname === '/'`). Enforced HTTPS protocol for remote hosts; permitted HTTP only for localhost (`localhost`, `127.0.0.1`, `[::1]`).
    - `TICK_SECRET`: required non-empty string.
    - `TICK_TIMEOUT_MS`: validated as a finite positive integer string within `[1, 120000]` ms (`MIN_TICK_TIMEOUT_MS` = 1, `MAX_TICK_TIMEOUT_MS` = 120,000 ms, compatible with Cloudflare Worker invocation budget). Unset value defaults to `90000` ms (`DEFAULT_TICK_TIMEOUT_MS`).
    - Invalid configurations return `{ success: false, attempts: 0, message: ... }` with **zero outbound fetch calls**.
  - In response parsing: verified that parsed receipt JSON is a non-null, non-array object (`typeof data === 'object' && data !== null && !Array.isArray(data)`) before accessing properties, ensuring `null`, array, and primitive responses fail cleanly as invalid receipts without throwing unhandled exceptions.
  - In `worker/tests/worker.test.ts`, added 14 new tests covering `validateWorkerConfig`, invalid `APP_URL`, invalid `TICK_TIMEOUT_MS` bounds, zero outbound fetches on invalid config, and non-object receipt JSON hardening.
- **Evidence**: `worker/tests/worker.test.ts` (28 tests passed) confirms all validation and hardening rules.
