# QuickBite Milestone M1A Review Report (v3 Post-Repair)

## 1. Milestone Objective and Scope
The goal of **Milestone M1A (Local Application Skeleton & Scheduler Spike)** is to establish the local multi-package workspace, develop the minimal Express modular monolith, implement the Cloudflare Worker scheduler spike, and set up database migration tooling.

**Scope Boundaries**:
- **In Scope**: Local project skeleton (React frontend, Express server, Cloudflare Worker, SQL migrations), process health (`/livez`), cached database readiness (`/readyz`), authenticated scheduler tick webhook (`/internal/tick`), Cloudflare 5 UTC cron triggers with retry logic, SPA client routing guards, and automated test suites.
- **Completed Initial Repairs (R1–R8)**:
  - Removed unauthenticated `/trigger` route.
  - Fixed root `.env` loading and precedence.
  - Added 90s bounded timeouts, body stream timeout protection, and strict receipt verification in Worker.
  - Enforced strict database test isolation and cleanup.
  - Configured statement/query timeouts and in-flight probe deduplication.
  - Removed insecure TLS `rejectUnauthorized: false`.
  - Guarded bare `/api` and `/internal` namespace roots; added centralized JSON error handlers (400, 413, 500).
  - Omitted manifest self-hash, enforced forward slashes in ZIP entries, and added post-archive hash verification.
- **Completed Follow-Up Repairs (F1–F4 from `INSTRUCTOR_REVIEW_V2.md`)**:
  - **F1**: Fully decoupled `server/tests/config.test.ts` from the root `.env` using OS temporary workspace fixtures (`os.tmpdir()/qb-fixture-workspace-*`), preventing any risk of overwriting or deleting real project environment files.
  - **F2**: Hardened database test isolation in `server/tests/db.integration.test.ts` by checking parsed endpoints (`checkDatabaseTargetsIdentical`) and enforcing per-run disposable schemas (`test_qb_<uuid>`) via search path; retained explicit BLOCKED skip when `TEST_DATABASE_URL` is unconfigured.
  - **F3**: Hardened database TLS in `server/src/db/pool.ts` by parsing connection strings, rejecting insecure `sslmode` values (`disable`, `no-verify`, `allow`, `prefer`), stripping conflicting URL query parameters, and enforcing `{ rejectUnauthorized: true }` on remote hosts while permitting plain localhost. Added tests inspecting `pg.Client` effective `connectionParameters.ssl`.
  - **F4**: Hardened Worker configuration in `worker/src/index.ts` via `validateWorkerConfig`: validated `APP_URL` as pure origin (no path, query, fragment, credentials), enforced HTTPS for remote deployments, validated `TICK_TIMEOUT_MS` as bounded positive integer `[1, 120000]` ms (default 90,000 ms), verified zero outbound fetches on invalid config, and hardened receipt parsing against non-object JSON (`null`, array, primitive).
- **Strictly Out of Scope**: Account creation (Neon, Render, Cloudflare), cloud deployment, business features (authentication, customer signup, plans, menus, subscription selection, meal processing, payment mocking).

---

## 2. Implemented Behavior
- **Server Process Liveness (`GET /livez`)**: Returns `200 OK` with process uptime. Operates entirely in-memory with zero database access. Used exclusively by platform health pingers.
- **Database Readiness (`GET /readyz`)**: Executes a bounded database connectivity query (`SELECT 1`). Statement and query timeouts are enforced via PostgreSQL and node-pg client configs. Concurrent uncached readiness checks are deduplicated in-flight to prevent query bursts. Results are cached for 30 seconds to mitigate thrashing. Documentation explicitly notes that readiness caching reduces queries but does not guarantee Neon compute suspension if polled by external monitors.
- **Scheduler Webhook (`POST /internal/tick`)**:
  - Authenticated via constant-time buffer comparison (`crypto.timingSafeEqual`) against `TICK_SECRET`. Handles missing, malformed, or different-length tokens safely without throwing exceptions or logging secrets.
  - Validates payload with Zod against the 5 allowed job kinds (`reminder`, `cutoff`, `cutoff_retry`, `recovery`, `recovery_retry`) and requires a valid ISO 8601 UTC timestamp.
  - The client timestamp identifies the invocation identity only; the server clock is never overridden.
  - Idempotent receipt recording via `INSERT INTO scheduler_runs ... ON CONFLICT (job_name, scheduled_for) DO NOTHING`. Returns `status: "recorded"` (and `duplicate: true` on repeated calls). Receipt recording is strictly distinguished from business-job completion.
- **SPA Routing Guard & JSON Error Handling**: Production Express static file handler serves `web/dist/index.html` for frontend client routes while explicitly isolating both the roots and subpaths of `/api`, `/internal`, `/livez`, and `/readyz` so unknown API endpoints return 404 JSON rather than HTML pages. Centralized error handling catches malformed JSON (400), oversized bodies (413), and unexpected server errors (500) with sanitized JSON responses.
- **Cloudflare Worker Scheduler**: Maps 5 authoritative UTC cron triggers to internal job kinds, preserves invocation timestamp identity across attempts, strictly validates origin `APP_URL` and bounded timeout, keeps abort protection active through response-body streaming, validates that receipt responses are non-null objects matching requested job and ISO timestamp, retries transient errors (5xx/network drops) once, and halts immediately on 4xx client errors or unexpected redirects (`redirect: 'error'`). Unauthenticated public `/trigger` route is completely removed.
- **Frontend Placeholder**: Responsive React + Vite application displaying the mandatory DEMO MODE banner and process health status without polling `/readyz`.

---

## 3. Files Created or Changed
- **Setup & Rules**: `AGENTS.md`, `GEMINI.md`, `.gitignore`, `.env.example`
- **Root Workspace**: `package.json`, `package-lock.json`, `scripts/package-review.mjs`
- **Server Package (`server/`)**:
  - Config & Core: `server/package.json`, `server/tsconfig.json`, `server/src/config.ts`, `server/src/app.ts`, `server/src/index.ts`
  - Database: `server/src/db/pool.ts`, `server/src/db/migrate.ts`, `server/migrations/001_create_scheduler_runs.sql`
  - Routes & Middleware: `server/src/routes/health.ts`, `server/src/routes/tick.ts`, `server/src/middleware/auth.ts`, `server/src/middleware/spa.ts`
  - Tests: `server/tests/config.test.ts`, `server/tests/health.test.ts`, `server/tests/tick.test.ts`, `server/tests/spa.test.ts`, `server/tests/db.integration.test.ts`
- **Frontend Package (`web/`)**:
  - `web/package.json`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/App.css`
- **Worker Package (`worker/`)**:
  - `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.jsonc`, `worker/src/index.ts`, `worker/tests/worker.test.ts`
- **Documentation & Review**:
  - `docs/PROJECT.md`, `docs/BUSINESS_RULES.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/HANDOFF.md`, `docs/REVIEW_PROCESS.md`
  - `docs/reviews/M1A/REPORT.md`, `docs/reviews/M1A/VERIFICATION.md`, `docs/reviews/M1A/FILE_MANIFEST.md`, `docs/reviews/M1A/NEXT_STEPS.md`, `docs/reviews/M1A/INSTRUCTOR_REVIEW.md`, `docs/reviews/M1A/INSTRUCTOR_REVIEW_V2.md`, `docs/reviews/M1A/REPAIR_PROGRESS.md`

---

## 4. Distinction Between Implemented, Tested, and Deployed

| Layer / Feature | Implemented | Tested Locally | Deployed to Cloud | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Workspace Scaffold & Scripts** | YES | YES | NO | npm workspaces (`server`, `web`, `worker`) compile and pass typecheck. |
| **`GET /livez`** | YES | YES | NO | Verified zero DB access via unit test spy. |
| **`GET /readyz` & Caching** | YES | YES | NO | Verified 30s in-memory caching, in-flight deduplication, and sanitized error responses. |
| **`POST /internal/tick` Auth** | YES | YES | NO | Verified constant-time comparison, invalid/malformed token rejection. |
| **`POST /internal/tick` Validation** | YES | YES | NO | Verified 5 allowed jobs, ISO timestamp check, status `'recorded'`. |
| **Database Migrations** | YES | NO (Mocked) | NO | Migration script and SQL ready; real DB execution pending test database. |
| **Real PostgreSQL Deduplication** | YES | BLOCKED | NO | Integration test written with per-test schema isolation; skipped due to lack of DB. |
| **Worker Cron Mapping & Retries** | YES | YES | NO | Verified 5 UTC cron mappings, identity preservation, bounded timeout, zero outbound fetches on invalid config, and receipt verification. |
| **Production SPA Static Serving** | YES | YES | NO | Verified Vite production build, bare `/api` and `/internal` isolation, and JSON error handling. |
| **Cloud Hosting (Render / Cloudflare)** | NO | NO | NO | Deferred to Milestone M1B per project plan. |

---

## 5. Known Defects and Limitations
1. **Real Database Integration Blocked Locally**: PostgreSQL integration tests are currently marked BLOCKED because an isolated PostgreSQL database was not configured (`TEST_DATABASE_URL` is empty).
2. **Cold Start Latency vs Worker Timeout**: Addressed in R3/F4 by configuring a default 90-second timeout with body streaming protection and 1 retry. Real cold-start latency will be validated during M1B deployment.
3. **In-Memory Readiness Cache Scope**: The 30-second cache on `/readyz` is held in server memory. If the process spins down or restarts, the cache resets immediately.

---

## 6. Pending Decisions and External Dependencies
- **Render Free Tier Card Requirement**: Whether registering and deploying the Render free web service requires entering a credit card.
- **Cloudflare Worker Card Requirement**: Whether Cloudflare account signup or cron trigger provisioning requires a credit card.
- **Neon Compute Suspension**: Whether Neon connection pooling settings effectively allow compute to scale to zero when only `/livez` is polled.
