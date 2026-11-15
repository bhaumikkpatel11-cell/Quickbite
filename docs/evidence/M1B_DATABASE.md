# QuickBite Milestone M1B: Database Verification Evidence

**Date & Time**: 2026-11-15 16:25:20 IST (UTC+05:30, Asia/Kolkata)  
**Target Database**: Neon Serverless PostgreSQL (`aws-us-east-2`)  
**Scope**: M1B Database Verification (Separate Test Branch, Disposable Schema Isolation, Application Migration & Idempotency, Local End-to-End Health & Scheduler Webhook Verification)

---

## 1. Environment & Configuration Check (Task 1)

### A. Git Exclusion Verification
```powershell
git check-ignore -v .env
```
**Output**:
```
.gitignore:7:.env	.env
```
**Status**: **VERIFIED**. The repository-root `.env` is ignored by Git (`.gitignore:7:.env`), which reduces the risk of accidental commits; it does not eliminate all secret leakage risks (e.g. via force-adds, CI misconfigurations, or command logging), so ongoing vigilance, automated secret scanning, and pre-commit verification remain mandatory.

### B. Configuration Presence Check (Sanitized)
All three required environment variables are confirmed present with valid non-placeholder values:
- `DATABASE_URL`: Configured (Neon PostgreSQL connection string over TLS with connection pooling)
- `TEST_DATABASE_URL`: Configured (Neon PostgreSQL direct connection string over TLS to separate test target)
- `TICK_SECRET`: Configured (64-character high-entropy cryptographic secret)

*Note: In accordance with project security instructions, no credentials, connection strings, or secret tokens are logged.*

---

## 2. Distinct Endpoint IDs & Connection Mode Inspection (Task 2)

A dedicated diagnostic inspected the parsed URLs of `DATABASE_URL` and `TEST_DATABASE_URL`:
- **Endpoint ID Distinction**: `TEST_DATABASE_URL` and `DATABASE_URL` point to distinct Neon host endpoint IDs (`ep-...`). While distinct endpoint hostnames confirm that the network connection targets are separate, hostname text inspection alone does not establish branch-level separation or query the Neon management plane. Therefore, disposable-schema isolation (`test_qb_<uuid>`) is strictly retained and enforced to guarantee complete data safety regardless of branch topology.
- **Connection Mode**:
  - `DATABASE_URL`: Uses a transaction-pooled endpoint (`-pooler` suffix in hostname), optimal for stateless web service instances.
  - `TEST_DATABASE_URL`: Uses a direct connection endpoint (no `-pooler` suffix in hostname), essential for DDL migrations, schema isolation, and session-level search path scoping.
- **Disposable-Schema Isolation**: Retained dynamically generated schema naming (`test_qb_<uuid>`) per test run to provide cryptographic schema-level isolation.

---

## 3. Pre-Migration Isolation Gate (Task 3)

Before running migrations or writing test records, the integration test suite executed a mandatory pre-migration isolation check:
- Created disposable schema: `CREATE SCHEMA "test_qb_<uuid>"` via admin pool.
- Scoped connection options via `options=-c search_path=test_qb_<uuid>`.
- Queried `SELECT current_schema()` on **both** the test pool and the application `getPool()`.
- **Pre-Migration Gate Result**:
  - `testPool.current_schema`: `test_qb_<uuid>`
  - `appPool.current_schema`: `test_qb_<uuid>`
- Because both pools resolved strictly to the disposable schema (and not `public`), the gate passed and migrations proceeded safely inside the disposable test schema.

---

## 4. Real PostgreSQL Integration Test Results (Task 4)

**Command**:
```powershell
npx vitest run server/tests/db.integration.test.ts
```
**Output**:
```
 RUN  v2.1.9 E:/project/QuickBite

stdout | server/tests/db.integration.test.ts > PostgreSQL Scheduler Runs Integration (Real DB)
[Integration DB] Distinct host endpoint detected: host=ep-quiet-cloud-bej10eqm.c-9.us-east-2.aws.neon.tech

stdout | server/tests/db.integration.test.ts > PostgreSQL Scheduler Runs Integration (Real DB)
Applying migration: 001_create_scheduler_runs.sql...

stdout | server/tests/db.integration.test.ts > PostgreSQL Scheduler Runs Integration (Real DB)
Applied migration: 001_create_scheduler_runs.sql

stdout | server/tests/db.integration.test.ts > PostgreSQL Scheduler Runs Integration (Real DB)
[Integration DB] Successfully dropped disposable test schema "test_qb_ef203b3d_656c_45a8_a5ec_892f68f0cf3d"

 ✓ server/tests/db.integration.test.ts (4 tests) 25278ms
   ✓ PostgreSQL Scheduler Runs Integration (Real DB) > guarantees logical idempotency: repeated ticks produce one row and return duplicate=true 1805ms
   ✓ PostgreSQL Scheduler Runs Integration (Real DB) > handles concurrent tick delivery safely with unique constraint and transaction isolation 4668ms
   ✓ PostgreSQL Scheduler Runs Integration (Real DB) > verifies that application tables outside the disposable test schema remain completely untouched (Task 4) 3522ms
   ✓ PostgreSQL Scheduler Runs Integration (Real DB) > confirms the test-owned disposable schema exists and is isolated during the test run (Task 4) 643ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

**Verification Details**:
- **Repeated Identical Ticks**: First delivery recorded row (`status: 'recorded'`, `duplicate: false`). Repeated delivery returned `duplicate: true`, leaving exactly 1 row in `scheduler_runs`.
- **Concurrent Identical Ticks**: Two simultaneous POST requests with identical payload produced one `duplicate: false` and one `duplicate: true`, resulting in exactly 1 row in `scheduler_runs`.
- **Application Tables Untouched**: Verified that `public.scheduler_runs` contained zero test records.
- **Disposable Schema Cleanup**: Verified `DROP SCHEMA IF EXISTS ... CASCADE` removed `test_qb_<uuid>`. Confirmed schema no longer exists in `information_schema.schemata`.
- **Reliable Pool Closure**: Both `testPool`, `adminPool`, and `getPool()` closed cleanly in `afterAll`.

---

## 5. Application Branch Migration & Idempotency (Tasks 5 & 6)

### A. Initial Migration Execution (Task 5)
**Command**:
```powershell
npm run migrate
```
**Output**:
```
> quickbite@0.1.0 migrate
> npm --workspace=server run migrate

> @quickbite/server@0.1.0 migrate
> tsx src/db/migrate.ts

Applying migration: 001_create_scheduler_runs.sql...
Applied migration: 001_create_scheduler_runs.sql
Migrations complete. Applied 1 new migration(s).
```

### B. Direct Database Schema Verification (Task 5)
Direct query against `information_schema` on `DATABASE_URL` confirmed tables, columns, constraints, and migration tracking records:
- **Tables Found**: `['public.scheduler_runs', 'public.schema_migrations']`
- **`scheduler_runs` Columns**:
  - `id` (`integer`, NOT NULL, Primary Key)
  - `job_name` (`character varying`, NOT NULL)
  - `scheduled_for` (`timestamp with time zone`, NOT NULL)
  - `executed_at` (`timestamp with time zone`, NOT NULL)
  - `status` (`character varying`, NOT NULL)
  - `trigger_source` (`character varying`, NOT NULL)
  - `details` (`jsonb`)
  - `created_at` (`timestamp with time zone`, NOT NULL)
- **Constraints Confirmed**:
  - `scheduler_runs_pkey` (Primary Key on `id`)
  - `uq_scheduler_runs_job_scheduled` (Unique constraint on `(job_name, scheduled_for)`)
- **Recorded Migrations**: `['001_create_scheduler_runs.sql']`

### C. Migration Idempotency Check (Task 6)
**Command**:
```powershell
npm run migrate
```
**Output**:
```
> quickbite@0.1.0 migrate
> npm --workspace=server run migrate

> @quickbite/server@0.1.0 migrate
> tsx src/db/migrate.ts

Migrations complete. Applied 0 new migration(s).
```
**Status**: **VERIFIED**. Running migrations a second time applies 0 new migrations and causes no schema conflicts.

---

## 6. Local Application Health & Scheduler Verification (Task 7)

Tested live Express HTTP server listening locally with real database connection against `DATABASE_URL`:

| Endpoint | Method | Headers / Auth | Expected Result | Actual Result | Status |
| :--- | :---: | :--- | :--- | :--- | :---: |
| `/livez` | GET | None | 200 OK, zero DB queries | `200 { status: 'ok', uptime: 0.32s }` | **PASSED** |
| `/readyz` (Probe 1) | GET | None | 200 OK, real DB check, cache miss | `200 MISS { status: 'ready', cached: false }` | **PASSED** |
| `/readyz` (Probe 2) | GET | None | 200 OK, 30s cached result | `200 HIT { status: 'ready', cached: true }` | **PASSED** |
| `/internal/tick` | POST | Missing Authorization | 401 Unauthorized | `401 Unauthorized` | **PASSED** |
| `/internal/tick` | POST | Invalid Bearer Token | 401 Unauthorized | `401 Unauthorized` | **PASSED** |
| `/internal/tick` | POST | Valid Token (Attempt 1) | 200 OK, `duplicate: false` | `200 { status: 'recorded', receipt_id: 1, duplicate: false }` | **PASSED** |
| `/internal/tick` | POST | Valid Token (Attempt 2) | 200 OK, `duplicate: true` | `200 { status: 'recorded', receipt_id: 1, duplicate: true }` | **PASSED** |

Server and database pools closed cleanly after execution.

---

## 7. Full Automated Test Suite Results (Task 8)

### A. TypeScript Typecheck
**Command**: `npm run typecheck`  
**Result**: **0 errors** across `server`, `web`, and `worker`.

### B. Production Build
**Command**: `npm run build`  
**Result**: **0 errors**. Vite client bundle (146.77 kB) and Express server compile cleanly to `dist/`.

### C. Test Suite Breakdown
**Command**: `npm test`  
**Result**: **67 passed**, **0 failed**, **0 skipped** across 6 test files.

| Workspace | Test File | Description | Passed | Failed | Skipped | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `server` | `tests/config.test.ts` | Root `.env` Discovery, Precedence & Fixture Isolation | 3 | 0 | 0 | PASSED |
| `server` | `tests/health.test.ts` | `/livez` zero DB, `/readyz` caching, deduplication & TLS | 11 | 0 | 0 | PASSED |
| `server` | `tests/tick.test.ts` | Tick Authentication, Token Sanitization & Payload Validation | 12 | 0 | 0 | PASSED |
| `server` | `tests/spa.test.ts` | Production SPA Routing, Namespace Isolation & JSON Error Handling | 9 | 0 | 0 | PASSED |
| `server` | `tests/db.integration.test.ts` | Real PostgreSQL Neon Integration with Disposable Schema Isolation | 4 | 0 | 0 | **PASSED** |
| `worker` | `tests/worker.test.ts` | Cloudflare Cron Schedules, Timeouts, Config Validation & Receipt Hardening | 28 | 0 | 0 | PASSED |
| **Total** | — | **Full Monorepo Test Suite** | **67** | **0** | **0** | **ALL PASSED** |

---

## 8. Remaining Blockers for Complete Milestone M1

The database connectivity, schema migration, idempotency, and local authenticated tick recording slice of M1B is fully verified. The remaining requirements to complete Milestone M1 are:
1. **Cloudflare Worker Deployment**: Deploy `quickbite-scheduler` Worker via Wrangler with the 5 cron triggers and set `TICK_SECRET`.
2. **Render Web Service Deployment**: Deploy the Express modular monolith to Render free web service; configure platform health check to use `/livez` strictly.
3. **Multi-Day Scheduled Tick Evidence**: Accumulate at least 3 consecutive days of live cron triggers in `docs/evidence/` recording arrival times, cold-start latency, retry occurrences, and observing Neon compute scale-to-zero suspension during idle intervals.
