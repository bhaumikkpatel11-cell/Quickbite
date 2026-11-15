# QuickBite Milestone M1B: Verification Evidence (Database Phase)

## 1. Execution Environment
- **Date & Time**: 2026-11-15 16:25:20 IST (UTC+05:30, Asia/Kolkata)
- **Operating System**: Windows (Microsoft Windows [Version 10.0.19045])
- **Node.js**: `v24.18.0`
- **npm**: `11.16.0`
- **Git**: `2.37.1.windows.1`
- **Database Engine**: Neon Serverless PostgreSQL (`aws-us-east-2`)
- **Direct Test Host**: `ep-quiet-cloud-bej10eqm.c-9.us-east-2.aws.neon.tech` (non-pooler)
- **Application Pool Host**: Distinct endpoint with `-pooler` suffix

---

## 2. Test Execution Summary

| Test Suite File | Layer / Component | Test Kind | Passed | Failed | Skipped | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `server/tests/config.test.ts` | Root `.env` Discovery, Precedence & Fixture Isolation | Unit (Temp Workspace) | 3 | 0 | 0 | PASSED |
| `server/tests/health.test.ts` | Process (`/livez`), Readiness (`/readyz`), TLS & pg.Client SSL | Unit (Mock DB) | 11 | 0 | 0 | PASSED |
| `server/tests/tick.test.ts` | Scheduler Webhook Auth & Validation | Unit (Mock DB) | 12 | 0 | 0 | PASSED |
| `server/tests/spa.test.ts` | SPA Fallback, Root Namespace Guards & Error Handling | Unit (Express) | 9 | 0 | 0 | PASSED |
| `server/tests/db.integration.test.ts` | Real PostgreSQL Neon Integration with Disposable Schema Isolation | Integration (Real Neon DB) | 4 | 0 | 0 | **PASSED** |
| `worker/tests/worker.test.ts` | Cron Mapping, Timeouts, Config Validation & Receipt Hardening | Unit (Mock Fetch) | 28 | 0 | 0 | PASSED |
| **Total Across Workspaces** | — | — | **67** | **0** | **0** | **ALL PASSED** |

---

## 3. Real Database Integration Checks Performed

| Check | Target / Environment | Result | Status |
| :--- | :--- | :--- | :---: |
| **Distinct Endpoint Confirmation** | Neon test endpoint vs application endpoint | Distinct endpoint IDs, direct connection on test; disposable schema isolation enforced | **VERIFIED** |
| **Pre-Migration Isolation Gate** | `testPool` and `getPool()` query `current_schema()` | Both resolved to `test_qb_<uuid>` | **VERIFIED** |
| **Idempotency: Repeated Ticks** | Real Neon table in disposable schema | Single receipt recorded, `duplicate: true` on retry | **VERIFIED** |
| **Idempotency: Concurrent Ticks** | Real Neon table in disposable schema | Two concurrent requests yield 1 row, 1 duplicate flag | **VERIFIED** |
| **Application Table Protection** | `public.scheduler_runs` table check | Zero test rows leaked into application table | **VERIFIED** |
| **Disposable Schema Removal** | `DROP SCHEMA IF EXISTS ... CASCADE` | Confirmed schema absent from `information_schema.schemata` | **VERIFIED** |
| **Application Migration** | `npm run migrate` on application branch | Applied `001_create_scheduler_runs.sql` (1 new) | **VERIFIED** |
| **Migration Idempotency** | Rerun `npm run migrate` | Applied 0 new migrations | **VERIFIED** |
| **Local App `/livez`** | Express local HTTP server | HTTP 200 OK without database query | **VERIFIED** |
| **Local App `/readyz` Caching** | Express local HTTP server + Neon DB | Probe 1: 200 `X-Cache: MISS`; Probe 2: 200 `X-Cache: HIT` | **VERIFIED** |
| **Local App `/internal/tick`** | Express local HTTP server + Neon DB | 401 on invalid auth; 200 recorded; 200 duplicate | **VERIFIED** |

---

## 4. Explicit Record of Checks NOT Run
1. **Render Cloud Web Service Deployment**: Express server was verified locally against real Neon; deployment to Render cloud platform is scheduled for the hosting phase of M1B.
2. **Cloudflare Cloud Worker Deployment**: Cloudflare Worker scheduler was verified locally via Vitest mock runtime; live deployment via Wrangler is scheduled for the hosting phase of M1B.
3. **Multi-Day Scheduled Tick Evidence**: The 3 consecutive days of live cron trigger evidence in `docs/evidence/` will accumulate once Render and Cloudflare are deployed.
4. **Automated Browser Playwright Suite**: Browser smoke testing is scheduled for subsequent milestones.
