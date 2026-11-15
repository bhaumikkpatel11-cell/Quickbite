# QuickBite Milestone M1A: Instructor Review & Repair Checklist

Date: 15 Nov 2026
Target Milestone: M1A (Local Application Skeleton & Scheduler Spike)

## Review Items

### R1 — Remove unauthenticated scheduler access
**File**: `worker/src/index.ts`

The public `POST /trigger` route calls `dispatchTick` using the Worker's private secret, allowing unauthenticated callers to generate authenticated backend requests.

- Remove this public trigger endpoint. Use local scheduled-event testing or actual cron execution for verification.
- Add a regression test proving public `/trigger` requests cannot cause outbound dispatch.

---

### R2 — Fix root .env loading
**File**: `server/src/config.ts`

Both `dotenv` calls currently resolve against `process.cwd()`. npm workspace scripts run inside `server/`, so the documented repository-root `.env` is not loaded.

- Resolve the root environment file using a stable path that works for source and compiled execution. Preserve externally supplied environment-variable precedence.
- Test configuration loading through the documented workspace commands using temporary, non-secret sentinel values. Do not commit actual `.env` files.

---

### R3 — Fix Worker timeouts and success validation
**File**: `worker/src/index.ts`

Current problems:
- Two ten-second attempts can finish before the hosting service wakes.
- Any HTTP 2xx counts as success, even HTML or invalid JSON.
- The timeout is cleared before reading the response body.
- Missing `APP_URL` silently defaults to localhost.

Required changes:
- Require valid deployment configuration.
- Use a configurable, bounded timeout suitable for the expected cold start; a 90-second attempt is a starting point to validate during deployment.
- Keep timeout protection active through response-body reading.
- Validate the receipt response: status must be "recorded", and job name and scheduled timestamp must match the request.
- Preserve invocation identity on retries.
- Do not retry authentication or validation failures.
- Fail closed on unexpected redirects.

Add tests using fake timers/mocked fetch for timeout, stalled body, HTML 200, malformed JSON, mismatched receipt and retry identity. Do not make tests wait a real minute.

---

### R4 — Make database tests explicitly isolated
**File**: `server/tests/db.integration.test.ts`

- Remove the fallback that uses `DATABASE_URL` when its text contains "test". That does not prove isolation.
- Require explicit `TEST_DATABASE_URL` and safeguards against targeting the application database.
- Use an isolated schema/database or uniquely owned test records. Fix cleanup: current cleanup searches for `test_%` jobs, but inserted jobs are `cutoff` and `cutoff_retry`.
- Close both the test pool and application pool.
- If no isolated database is configured, keep integration tests BLOCKED. Do not replace them with mocks and claim database verification.

---

### R5 — Apply real database query bounds
**Files**: `server/src/db/pool.ts` and `server/src/routes/health.ts`

- `dbQueryTimeoutMs` is declared but not applied to the pool. The readiness `Promise.race` bounds the HTTP wait without cancelling the underlying database query.
- Configure appropriate statement/query timeouts and connection handling. Clear timeout handles and prevent concurrent uncached readiness requests from launching redundant queries.
- Keep `/livez` database-free.
- Correct documentation: readiness caching reduces queries but does not guarantee that the database suspends.

---

### R6 — Remove insecure TLS fallback
**File**: `server/src/db/pool.ts`

- Remove `rejectUnauthorized:false` for remote database connections.
- Use certificate verification and ensure connection-string SSL parameters do not conflict with explicit options. Consult the selected driver/provider documentation when implementing this.
- Do not log connection strings or credentials. Document any local-development exception separately.

---

### R7 — Fix API namespace and error handling
**Files**: `server/src/middleware/spa.ts` and `server/src/app.ts`

- The SPA guard excludes `/api/` and `/internal/` descendants but misses bare `/api` and `/internal`, which can return HTML 200.
- Exclude both namespace roots and descendants.
- Add sanitized JSON error handling for malformed JSON, oversized requests and unexpected errors, with appropriate HTTP statuses.
- Test these cases while preserving frontend navigation and static assets.

---

### R8 — Fix review-package integrity
**File**: `scripts/package-review.mjs`

- The manifest hashes itself before appending its own entry, so the packaged self-hash is incorrect.
- Omit the manifest self-hash. Optionally generate an archive checksum separately. Verify packaged file hashes after creating the archive.
- Improve secret inspection:
  - Check both `postgres://` and `postgresql://` connection strings.
  - Do not exempt an entire file because it contains "localhost", "mock" or a placeholder.
  - Check common credential/private-key patterns.
  - Retain explicit inclusion rules and manual inspection.
  - State scanner limitations; do not claim perfect detection.
- Use forward slashes in ZIP entry paths for portability.
