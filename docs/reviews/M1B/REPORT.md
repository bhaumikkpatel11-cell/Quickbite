# QuickBite Milestone M1B: Database Verification Report

## 1. Milestone Objective and Scope
The objective of this phase of **Milestone M1B** is to perform real PostgreSQL database verification against Neon serverless PostgreSQL, establishing:
- Distinct Neon branches for testing and application workloads.
- Strict pre-migration schema isolation via disposable schemas (`test_qb_<uuid>`) and search path scoping.
- Real database integration testing proving idempotency, concurrency safety, and application table protection.
- Application schema migration execution and idempotency demonstration.
- Local application end-to-end verification (`/livez`, `/readyz` caching, authenticated tick receipt recording, duplicate handling).

**Scope Boundaries**:
- **In Scope (Completed)**: Real Neon PostgreSQL integration, direct test connection, pooled application connection, disposable schema isolation, database migration `001_create_scheduler_runs.sql`, schema inspection, migration idempotency, and local Express server health & tick webhook verification.
- **Out of Scope (Deferred to Hosting Phase)**: Deploying the Express monolith to Render free web service, deploying the Cloudflare Worker scheduler, and accumulating the 3-day multi-day tick log evidence.

---

## 2. Implemented & Verified Behavior

### A. Database Endpoints & Connection Modes
- **Distinct Host Endpoints**: `TEST_DATABASE_URL` connects to a distinct Neon host endpoint from `DATABASE_URL`, confirmed via host endpoint inspection. Note: different endpoint IDs do not by themselves establish branch-level separation without management API verification; disposable schema isolation is enforced to guarantee multi-tenant data safety.
- **Connection Modes**:
  - `TEST_DATABASE_URL` uses a direct (non-pooled) connection, required for DDL migrations, schema creation, and session-level search path scoping.
  - `DATABASE_URL` uses transaction pooling (`-pooler` suffix), optimal for serverless web applications.
- **TLS Enforcement**: Both connections enforce strict TLS certificate validation (`{ rejectUnauthorized: true }`). Insecure SSL settings (`disable`, `no-verify`) are rejected.

### B. Multi-Layered Schema Isolation (Tasks 2 & 3)
- For every integration test execution, a unique disposable schema `test_qb_<uuid>` is generated.
- **Pre-Migration Isolation Gate**: Before writing migrations or data, the test suite queries `SELECT current_schema()` on **both** `testPool` and application `getPool()`. Both pools are verified to resolve strictly to `test_qb_<uuid>`. If either pool resolves to `public` or another schema, execution halts immediately before any write.
- **Application Table Protection**: Verified that `public.scheduler_runs` contained zero test records.
- **Schema Disposal**: On test completion, `afterAll` drops the disposable schema cascade and verifies it is absent from `information_schema.schemata`.

### C. Real PostgreSQL Integration Test Results (Task 4)
- **Logical Idempotency**: Repeated identical ticks (`job_name`, `scheduled_for`) create exactly one receipt in `scheduler_runs`, returning `duplicate: false` on initial delivery and `duplicate: true` on retry.
- **Concurrency Safety**: Two simultaneous POST requests with identical payload produce one `duplicate: false` and one `duplicate: true` flag, resulting in exactly one row in `scheduler_runs`.
- **Pool Management**: All connection pools (`testPool`, `adminPool`, and `getPool()`) close reliably in `afterAll`.

### D. Application Migration Execution & Idempotency (Tasks 5 & 6)
- Migration `001_create_scheduler_runs.sql` was applied to the Neon application branch via `npm run migrate`.
- Direct query against `information_schema` confirmed table existence (`scheduler_runs`, `schema_migrations`), all columns, primary key, and the logical invocation unique constraint `(job_name, scheduled_for)`.
- Re-running `npm run migrate` resulted in `Applied 0 new migration(s)`, proving complete idempotency.

### E. Local Application End-to-End Verification (Task 7)
- `GET /livez`: Returns 200 OK without accessing PostgreSQL.
- `GET /readyz`: Returns 200 OK connected to Neon. Probe 1 resulted in cache miss (`X-Cache: MISS`); probe 2 within 30s returned cached result (`X-Cache: HIT`).
- `POST /internal/tick`: Authenticated webhook rejected missing/invalid credentials (401) and recorded receipt on valid credentials (200 with `duplicate: false` on attempt 1; `duplicate: true` on attempt 2).

---

## 3. Files Created or Changed
- **Evidence & Review Documentation**:
  - `docs/evidence/M1B_DATABASE.md` (Detailed database evidence log)
  - `docs/reviews/M1B/REPORT.md`, `docs/reviews/M1B/VERIFICATION.md`, `docs/reviews/M1B/NEXT_STEPS.md`
  - `docs/BACKLOG.md` (Updated M1B status)
  - `docs/HANDOFF.md` (Updated verified results and next steps)
- **Integration Test Suite**:
  - `server/tests/db.integration.test.ts` (Pre-migration isolation gate, separate branch verification, application table protection, schema cleanup confirmation, bounded timeouts)
- **Packaging Script**:
  - `scripts/package-review.mjs` (Added support for M1B database review packaging and evidence inclusion)

---

## 4. Test Summary
- **Typecheck**: 0 errors across server, web, and worker.
- **Build**: Vite frontend and Express server compile cleanly.
- **Full Test Suite**: **67 passed**, **0 failed**, **0 skipped** (39 server tests across 5 files, 28 worker tests across 1 file).
