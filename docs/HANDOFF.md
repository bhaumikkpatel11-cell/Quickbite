# QuickBite: Handoff

Last updated: 15 Nov 2026. Read `PROJECT.md`, `BUSINESS_RULES.md` (v2.1), `ARCHITECTURE.md` and `BACKLOG.md` first. They are authoritative. Do not restart requirements discovery.

## 1. Approved design

**Product (see `BUSINESS_RULES.md`)**
- Business timezone IST. Deadlines: menu lock and selection fixing 18:00 on D-1, reminder 22:00, cutoff 23:00, delivery 13:00 on D, recovery deadline 10:00 on D (configurable assumption, not a guarantee).
- Default inclusion, per-customer-and-date skips, server-enforced cutoff.
- Append-only credit ledger. Cutoff consumes one credit per Included meal. Returns go to the original subscription. No transfers, refunds or expiry.
- No purchase is allowed while any subscription balance is positive. One selected subscription per customer, explicit selection, no automatic fallback.
- First-ever-purchase exception and repeat-purchase timing restriction retained. The first eligible date is shown before mock checkout and recomputed at payment.
- Service results become final only at or after cutoff. Previews and reminders never store "no service".
- Equal-timestamp ledger entries are ordered by (effective time, sequence). A last-credit consumption cannot invalidate its own meal, and existing results are recognised before re-evaluation.
- Recovery uses a decision instant read after locks are held. Before 10:00 finalize late. At or after 10:00 cancel as missed processing. Finalized meals are never cancelled by a late retry.
- Delivery corrections, Delivered final, no regression to Pending for a disabled provider's in-progress meals.
- Ratings: Delivered meals only, one per meal, no deadline, average per plan.
- Reports: one per meal, window 13:00:00 on D up to before 00:00:00 on D+2.
- In-app: one durable record per event. Email: best-effort, bounded retries, duplicates possible, delivery never guaranteed. Reminder emails expire at cutoff.

**Architecture (see `ARCHITECTURE.md`)**
- Modular monolith with database-backed jobs and a transactional outbox.
- React + Vite + TypeScript. Node.js + Express + TypeScript, `pg`, Zod. PostgreSQL on Neon. Server sessions with secure cookies.
- Fixed lock order: provider, customer, subscription, meal. Unique constraints supplement locking.
- Outbox with claim tokens, leases, bounded retries and expiry. No transaction held open during email calls.
- `/livez` without database access. `/readyz` with a cached database check. No periodic database polling.
- Render free web service, Cloudflare cron plus startup and request-triggered recovery, Brevo as the first email candidate.
- Injectable clock for automated tests only. No production clock override.

## 2. Implemented work

- **M0 Setup**: Initialized empty Git repository (`git init`). Preserved all documents and `.agents/skills/frontend-design/`. Configured `AGENTS.md`, `GEMINI.md`, `.gitignore`, and installed official `superpowers` plugin (v7.0.2). Corrected setup doc links to repository-relative paths and clarified that Docker is not required for the MVP. Tracked `package-lock.json` and added `.env.example`.
- **M1A Local Application Skeleton & Scheduler Spike**:
  - **Workspaces & Project Structure**: npm workspace root (`package.json`) linking `server/`, `web/`, and `worker/`.
  - **Server (`server/`)**: Express modular monolith with TypeScript.
    - `GET /livez`: Process liveness endpoint, zero database access.
    - `GET /readyz`: Bounded database connectivity check, cached for 30s to prevent thrashing and keep Neon compute sleeping when idle, sanitized error responses.
    - `POST /internal/tick`: Authenticated scheduler webhook using `crypto.timingSafeEqual` against `TICK_SECRET`, payload validation with Zod (`job_name`, `scheduled_for`), idempotent receipt recording in `scheduler_runs` via `ON CONFLICT (job_name, scheduled_for) DO NOTHING`, returns status `'recorded'`. Does not complete business meal jobs.
    - `server/src/middleware/spa.ts`: Static serving of `web/dist` with SPA client navigation fallback, explicitly guarding `/api/*`, `/internal/*`, `/livez`, `/readyz` from falling back to HTML 200.
    - Database client pool in `server/src/db/pool.ts` with bounded timeouts (connect: 5s, query: 5s, idle: 10s, max: 5) and versioned migration runner in `server/src/db/migrate.ts`.
  - **Database Migration (`server/migrations/`)**:
    - `001_create_scheduler_runs.sql`: Creates `scheduler_runs` with unique constraint `(job_name, scheduled_for)` and status `'recorded'`.
  - **Cloudflare Worker (`worker/`)**:
    - `worker/src/index.ts` with `wrangler.jsonc` configuring the 5 authoritative UTC cron schedules:
      - `30 16 * * *` (22:00 IST): `reminder`
      - `30 17 * * *` (23:00 IST): `cutoff`
      - `40 17 * * *` (23:10 IST): `cutoff_retry`
      - `30 3 * * *` (09:00 IST): `recovery`
      - `20 4 * * *` (09:50 IST): `recovery_retry` (final recovery before 10:00 IST)
    - Maps cron expression to job name, preserves exact `scheduled_for` ISO timestamp across retries, enforces bounded request timeout (default 90s), 1 retry on 5xx/network errors, no retry on 4xx validation/auth errors, never logs secrets.
  - **Frontend (`web/`)**:
    - React + Vite + TypeScript responsive placeholder with visible demo banner (`DEMO MODE — Solo M.Tech Project (Asia/Kolkata timezone). ₹0 free tier deployment. Mock payments only.`). Checks `/livez` once on mount. Does not poll `/readyz`.
- **Review Package & Packaging Script**:
  - Packaging script: `scripts/package-review.mjs` and guide `docs/REVIEW_PROCESS.md`.
  - Full milestone review package generated at `review-packages/QuickBite_M1A_Review.zip`.
  - Detailed review reports recorded under `docs/reviews/M1A/` ([REPORT.md](docs/reviews/M1A/REPORT.md), [VERIFICATION.md](docs/reviews/M1A/VERIFICATION.md), [FILE_MANIFEST.md](docs/reviews/M1A/FILE_MANIFEST.md), [NEXT_STEPS.md](docs/reviews/M1A/NEXT_STEPS.md)).
- **M1A Instructor Review Repairs (Completed R1–R8 - see `docs/reviews/M1A/REPAIR_PROGRESS.md`)**:
  - **R1 (Fixed)**: Removed unauthenticated `/trigger` endpoint in `worker/src/index.ts`. Added regression test proving `/trigger` returns 404 and prevents outbound dispatch.
  - **R2 (Fixed)**: Replaced `process.cwd()` with stable repo-root resolution via `import.meta.url` in `server/src/config.ts`. Verified workspace loading and precedence of externally supplied environment variables.
  - **R3 (Fixed)**: Hardened `worker/src/index.ts` with strict deployment configuration validation, 90s bounded timeout protection across response-body reading, strict receipt validation (`status === 'recorded'`, matching job and ISO timestamp), and redirect error handling.
  - **R4 (Fixed)**: In `server/tests/db.integration.test.ts`, removed `DATABASE_URL` fallback, required explicit `TEST_DATABASE_URL` distinct from app DB, corrected cleanup to target exact test keys, and ensured both test and app pools are closed. Real DB tests remain explicitly BLOCKED when `TEST_DATABASE_URL` is unset.
  - **R5 (Fixed)**: Configured PostgreSQL `statement_timeout` and `query_timeout` in pool, added timeout timer cleanup in `/readyz`, added in-flight request deduplication for concurrent uncached probes, kept `/livez` DB-free, and clarified docs on compute suspension.
  - **R6 (Fixed)**: Removed `rejectUnauthorized: false` in `server/src/db/pool.ts`. Applied strict TLS certificate verification (`{ rejectUnauthorized: true }`) for remote/Neon connections.
  - **R7 (Fixed)**: Guarded both bare `/api` and `/internal` namespace roots and descendants against SPA fallback in `server/src/middleware/spa.ts`. Added centralized sanitized JSON error handler in `server/src/app.ts` handling malformed JSON (400), oversized payloads (413), and unexpected errors.
  - **R8 (Fixed)**: Omitted manifest self-hash, implemented line-by-line secret scanner, enforced forward-slash entry paths in ZIP archives, added post-creation archive internal hash verification, and generated companion SHA-256 checksums in `scripts/package-review.mjs`.
- **M1A Follow-Up Review Repairs (Completed F1–F4 - see `docs/reviews/M1A/INSTRUCTOR_REVIEW_V2.md`)**:
  - **F1 (Fixed)**: Decoupled `server/tests/config.test.ts` into an OS temporary workspace fixture (`os.tmpdir()/qb-fixture-workspace-*`), preventing tests from modifying or deleting the root `.env`. Supported `loadLocalFallback: false` during test execution.
  - **F2 (Fixed)**: Replaced raw URL string inequality with `checkDatabaseTargetsIdentical` (checking parsed host, port, and database name) in `server/tests/db.integration.test.ts`. Enforced per-run disposable schemas (`test_qb_<uuid>`) via search path and robust `try ... finally` pool closing. Retained explicit BLOCKED skip when `TEST_DATABASE_URL` is unconfigured.
  - **F3 (Fixed)**: Hardened connection string TLS parsing in `server/src/db/pool.ts`. Hostnames are strictly classified (`localhost`, `127.0.0.1`, `::1`); remote connections reject insecure `sslmode` (`disable`, `no-verify`, `allow`, `prefer`), strip conflicting query parameters, and enforce `ssl: { rejectUnauthorized: true }`. Offline `pg.Client` parameter inspection tests added to `server/tests/health.test.ts`.
  - **F4 (Fixed)**: Implemented `validateWorkerConfig(env)` in `worker/src/index.ts`. Requires `APP_URL` to be a pure origin (no path, query, fragment, credentials), enforces HTTPS for remote deployments while permitting HTTP for localhost, validates `TICK_TIMEOUT_MS` as a positive integer `[1, 120000]` ms (default 90,000 ms), causes zero outbound fetches on invalid config, and hardens receipt parsing against non-object responses (`null`, arrays, primitives). Added 14 unit tests in `worker/tests/worker.test.ts`.
- **M1B Database Verification (Completed - see `docs/evidence/M1B_DATABASE.md`)**:
  - **Separate Test Branch & Direct Connection**: Verified that `TEST_DATABASE_URL` targets a separate Neon branch host with a direct connection (non-pooler), while `DATABASE_URL` uses transaction pooling (`-pooler`).
  - **Pre-Migration Isolation Gate**: Verified that both `testPool` and application `getPool()` resolve `current_schema()` strictly to the dynamically generated `test_qb_<uuid>` disposable schema before running migrations or writing records.
  - **Real PostgreSQL Integration Tests**: 4/4 passing tests in `server/tests/db.integration.test.ts`. Verified logical idempotency (repeated ticks create one receipt), concurrency safety (simultaneous ticks produce one row and one duplicate flag), application table protection (`public.scheduler_runs` untouched), and clean disposal of test schemas.
  - **Application Migration & Idempotency**: Applied `001_create_scheduler_runs.sql` to Neon application database via `npm run migrate`. Verified table existence, columns, primary key, and unique constraint directly against `information_schema`. Re-ran migration and verified idempotency (`Applied 0 new migration(s)`).
  - **Local Application Verification**: Started local Express server against real Neon database. Verified `/livez` 200 without DB queries; `/readyz` 200 with 30s cache (`MISS` on probe 1, `HIT` on probe 2); `/internal/tick` 401 on invalid/missing auth; and 200 on valid token recording receipt (`duplicate: false` then `duplicate: true`).
- **Render Deployment Preparation & Local Git Commit**:
  - **Node 24 Pinning**: Pinned Node major version to 24 for deployment via `package.json` engines range (`>=24.0.0 <25.0.0`), `.node-version` (`24`), and `.nvmrc` (`24`).
  - **Evidence Wording Corrections**: Refined documentation in `docs/evidence/M1B_DATABASE.md`, `server/tests/db.integration.test.ts`, and M1B review reports to clarify that `.gitignore` reduces accidental commits rather than eliminating all secret leakage risks, and differentiated Neon compute endpoint IDs (`ep-...`) from verified branches, highlighting disposable schema isolation (`test_qb_<uuid>`).
  - **Platform PORT & SPA Serving**: Verified Express server binds to the platform-provided `PORT` (`PORT=3847`) and verified production static serving of the compiled React SPA (`web/dist`) with DEMO banner HTML fallback.
  - **Render Deployment Guide**: Authored `docs/DEPLOY_RENDER.md` covering service type (Web Service), runtime (Node), root directory (`.`), build command (`npm ci --include=dev && npm run build`), start command (`npm start`), instance (Free), health check strictly `/livez`, environment variables (`NODE_ENV=production`, `DATABASE_URL`, `TICK_SECRET`), explicitly omitting `TEST_DATABASE_URL` and forbidding client-side secrets.
  - **Git Hygiene & Ignore Verification**: Verified `.gitignore` ignores `.env` via `git check-ignore -v .env` and verified `.env` is untracked via `git ls-files -- .env`. Staged all 61 reviewed project files, excluding build artifacts, dependencies, review packages, and secrets.
  - **Local Commit**: Created initial local Git commit on `master` containing all 61 reviewed project files.
- **Render Production Deployment Verification (Completed - see `docs/evidence/M1B_RENDER.md`)**:
  - Live deployment verified at `https://quickbite-2q20.onrender.com`.
  - **SPA & Assets**: Verified `GET /` serves compiled React SPA (200 OK, 654 bytes) and both Vite assets (`/assets/index-X299OTM8.js` and `/assets/index-Dj4Y14mn.css`) load cleanly with 200 OK.
  - **Liveness**: Verified `GET /livez` responds with 200 OK (`{"status":"ok"}`); confirmed Render platform health check is configured strictly to `/livez`. (Note: zero database access on `/livez` is established by architectural design and unit tests in `server/tests/health.test.ts`, rather than HTTP response inspection alone).
  - **Database Readiness & Cache**: Verified `GET /readyz` responds with 200 OK (`{"status":"ready"}`). Probe 1 executed a real Neon DB check (`cached: false`), and probe 2 verified 30s in-memory caching (`cached: true`).
  - **Authentication Guardrails**: Verified `POST /internal/tick` rejects unauthenticated requests (401) and invalid bearer tokens (401). (Note: constant-time comparison is established by unit test verification of `crypto.timingSafeEqual` in `server/tests/tick.test.ts`, rather than HTTP response inspection alone).
  - **Receipt Recording & Idempotency**: Privately authenticated test tick with valid `TICK_SECRET` using test timestamp `2026-11-15T14:15:00.000Z` and job `'cutoff'`. Initial delivery recorded receipt (`receipt_id: 3`, `duplicate: false`); repeated delivery safely returned `duplicate: true` with identical `receipt_id: 3`. Explicitly documented that this manual HTTP verification does not claim or prove cron execution.
- **Cloudflare Scheduler Deployment & Verification (Completed - see `docs/evidence/M1B_CLOUDFLARE.md` & `docs/evidence/M1B_SCHEDULER_OBSERVATION.md`)**:
  - **Tooling & Configuration**: Installed project-local `wrangler@4.162.0` in `worker/package.json`. Configured `APP_URL=https://quickbite-2q20.onrender.com` in `worker/wrangler.jsonc`.
  - **Cron Schedule Preservation**: Preserved all 5 authoritative UTC cron schedules (`reminder`, `cutoff`, `cutoff_retry`, `recovery`, `recovery_retry`) and their job mappings in `worker/src/index.ts`.
  - **Production Deployment**: Deployed `quickbite-scheduler` to Cloudflare Workers Free plan. Active Version ID: `dc1e806c-9c6b-41fe-b67c-031965e80550` (deployed 15 Nov 2026, 20:23:38 IST). Live URL: `https://quickbite-scheduler.bhaumik-quickbite.workers.dev`.
  - **Configuration & Secret Verification**: Verified via `wrangler versions view` and `wrangler secret list` that `TICK_SECRET` is bound as `secret_text` (zero secret values logged or committed) and `APP_URL` is bound as environment variable.
  - **Endpoint Guardrails**: Verified `GET /` returns 200 OK (`{"service":"quickbite-scheduler-worker","status":"healthy",...}`); verified public `/trigger` returns 404 Not Found on both GET and POST.
  - **Observation Protocol**: Authored `docs/evidence/M1B_SCHEDULER_OBSERVATION.md` establishing the 3-day observation protocol, distinguishing manual baseline entries from automated cron events, precluding false cold-start attribution without platform instrumentation, and specifying Neon compute scale-to-zero observation procedures. Real cron entries marked pending. Successful deployment is explicitly not treated as proof of scheduled delivery.

## 3. Verified results

- **Automated Tests**:
  - `server` unit & integration tests (`npm --workspace=server run test`): 39 passed, 0 failed, 0 skipped.
    - `tests/config.test.ts`: 3 tests passing (proves repo-root resolution, workspace loading, external env var precedence, isolated from real `.env`).
    - `tests/health.test.ts`: 11 tests passing (proves `/livez` makes zero DB calls; `/readyz` caching for 30s; in-flight probe deduplication; error sanitization; pool statement/query timeouts; TLS verification and `pg.Client` SSL parameter enforcement for remote and localhost).
    - `tests/tick.test.ts`: 12 tests passing (proves safe secret comparison; missing, malformed, invalid secrets; payload validation for all 5 allowed jobs; duplicate tick idempotency; status `'recorded'`).
    - `tests/spa.test.ts`: 9 tests passing (proves bare `/api`, bare `/internal`, and subpaths return 404 JSON; malformed JSON returns 400 JSON; oversized body returns 413 JSON; client navigation serves DEMO banner HTML).
    - `tests/db.integration.test.ts`: 4 tests passing (Real Neon PostgreSQL on separate test branch with disposable schema isolation; pre-migration isolation gate; duplicate tick idempotency; concurrent delivery protection; application table isolation; schema cleanup).
  - `worker` unit tests (`npm --workspace=worker run test`): 28 tests passing (proves schedule mapping for the 5 UTC cron triggers; rejects unknown crons; preserves `scheduled_for` across retries; retries on 500; halts on 400/401 without retry; fails safely when config missing; timeout aborts on initial fetch and stalled body; rejects HTML 200, malformed JSON, and mismatched receipts; verifies removal of public `/trigger`; verifies `validateWorkerConfig` for HTTPS, origin-only, credentials rejection, bounded timeouts, zero outbound fetches on invalid config, and non-object receipt hardening).
  - Total automated test suite (`npm test`): **67 passed, 0 failed, 0 skipped**.
- **TypeScript Typecheck**:
  - `npm run typecheck` (`tsc --noEmit` across server, web, worker): 0 errors.
- **Production Build**:
  - `npm run build`: both `web` (Vite) and `server` (tsc) compile cleanly to `dist/`.
- **Platform PORT Binding & SPA Serving Verification**:
  - Verified local server bound to platform `PORT=3847`. `GET /` returned HTTP 200 serving compiled React SPA `index.html` (654 bytes, containing `<div id="root">`); `GET /livez` returned HTTP 200 `{ status: 'ok' }`.
- **Render Production Deployment Verification**:
  - Deployment URL: `https://quickbite-2q20.onrender.com`.
  - `GET /`: 200 OK (654 bytes HTML with `<div id="root"></div>` and Demo Mode banner).
  - Static Assets: `/assets/index-X299OTM8.js` (146,761 bytes, 200 OK), `/assets/index-Dj4Y14mn.css` (2,227 bytes, 200 OK).
  - `GET /livez`: 200 OK (`{"status":"ok"}`).
  - `GET /readyz`: 200 OK (`{"status":"ready"}`), probe 1 `cached: false`, probe 2 `cached: true` (30s TTL cache confirmed).
  - `POST /internal/tick`: 401 Unauthorized without auth; 401 Unauthorized with invalid token.
  - `POST /internal/tick`: 200 OK on valid token (`receipt_id: 3`, `duplicate: false` on first call; identical `receipt_id: 3`, `duplicate: true` on second call).
- **Cloudflare Scheduler Deployment & Verification**:
  - Worker URL: `https://quickbite-scheduler.bhaumik-quickbite.workers.dev`.
  - Deployment Version: `dc1e806c-9c6b-41fe-b67c-031965e80550`.
  - Handlers active: `scheduled`, `fetch`.
  - Verified bindings: `TICK_SECRET` (secret_text, value never displayed), `env.APP_URL` (`https://quickbite-2q20.onrender.com`).
  - `GET /`: 200 OK (`{"service":"quickbite-scheduler-worker","status":"healthy","registered_crons":[...]}`).
  - `POST /trigger` and `GET /trigger`: 404 Not Found (`{"error":"Not Found"}`).
  - All 5 cron triggers registered on Cloudflare Workers Free plan: `30 16 * * *` (22:00 IST), `30 17 * * *` (23:00 IST), `40 17 * * *` (23:10 IST), `30 3 * * *` (09:00 IST), `20 4 * * *` (09:50 IST).
- **Node 24 Pinning**:
  - `package.json`: `"engines": { "node": ">=24.0.0 <25.0.0" }`.
  - `.node-version`: `24`.
  - `.nvmrc`: `24`.
- **Git Hygiene**:
  - `git check-ignore -v .env` confirmed `.env` ignored (`.gitignore:7:.env`).
  - `git ls-files -- .env` confirmed `.env` is untracked (empty output).
  - Staged file list contains 0 `.env` files, 0 dependencies (`node_modules`), 0 build outputs (`dist`), and 0 review packages (`review-packages`).
- **Review Packages**:
  - M1A Review v3: `review-packages/QuickBite_M1A_Review_v3.zip` (148,476 bytes) with `.sha256`.
  - M1B Database Review: `review-packages/QuickBite_M1B_Database_Review.zip` with companion `.sha256`.

## 4. Unresolved external dependencies

| Dependency | What is unknown | Resolved by |
|---|---|---|
| Render account and free deployment | Resolved: Web service deployed on free tier, `/livez` health check operational, zero card charge confirmed | M1B (Render phase - Done) |
| Cloudflare account and Worker cron | Resolved: Worker deployed on free tier, 5 cron triggers registered, zero card charge confirmed | M1B (Cloudflare phase - Done) |
| Neon compute scale-to-zero observation | Empirically measuring compute suspension during idle intervals between ticks over multiple days | M1B (scheduler observation phase - In Progress) |
| Brevo real recipient delivery | Whether single-sender sending works for arbitrary recipients, spam placement, deliverability from the sender address | M2 |
| Antigravity skills folder | Resolved: `.agents/skills/` is scanned and loaded | M0 (Done) |
| GitHub CI | Whether free CI is available for the chosen repository settings | M0 |
| Free-tier terms | They can change before the demo | M9 re-check |

**Decision rule:** if a spike fails, work stops and alternatives are presented for decision. Email is never replaced by simulation silently. The ₹0 deployment is provisionally feasible and not proven.

## 5. Open items

- Whether providers should see individual rating comments is not specified by the approved brief and is not planned for the MVP.
- Whether the 10:00 recovery deadline should be tuned later. It is a configuration value.

## 6. Next task

Render production deployment and Cloudflare Worker scheduler deployment are verified live with all 5 cron triggers active.
Next: proceed with **3-Day Multi-Day Scheduler Evidence & Neon Scale-to-Zero Observation**:
1. Collect the first scheduled-run evidence tonight at **22:00 IST (16:30 UTC)** on **15 Nov 2026** for the `reminder` cron trigger:
   - Stream Cloudflare invocation logs via `npx wrangler tail --config worker/wrangler.jsonc`.
   - Query `scheduler_runs` on Neon directly to verify the receipt record (`job_name = 'reminder'`, `status = 'recorded'`, `trigger_source = 'cron'`).
   - Populate Day 1 row in `docs/evidence/M1B_SCHEDULER_OBSERVATION.md`.
2. Observe scheduled executions for Day 1 `cutoff` (23:00 IST) and `cutoff_retry` (23:10 IST).
3. Check Neon Console compute metrics during the ~9h 50m idle interval between 23:10 IST and 09:00 IST to confirm scale-to-zero compute suspension.
4. Observe morning `recovery` (09:00 IST) and `recovery_retry` (09:50 IST) on 16 Nov 2026.
5. Continue through Day 2 and Day 3.
Do not declare Milestone M1 complete until 3 consecutive days of automated cron evidence are logged.

## 7. How to resume in a new conversation

1. Provide the five documents.
2. State the current milestone and any evidence collected under "Verified results".
3. Update sections 2 and 3 of this file only when work is actually implemented and verified. Keep "Implemented" and "Verified" distinct.
