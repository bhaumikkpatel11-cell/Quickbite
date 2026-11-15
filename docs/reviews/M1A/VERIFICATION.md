# QuickBite Milestone M1A Verification Evidence (v3 Post-Repair)

## 1. Execution Environment
- **Date & Time**: 2026-11-15 15:33:10 IST (UTC+05:30, Asia/Kolkata)
- **Operating System**: Windows (Microsoft Windows [Version 10.0.19045])
- **Node.js**: `v24.18.0`
- **npm**: `11.16.0`
- **Git**: `2.37.1.windows.1`
- **Antigravity CLI (`agy`)**: `1.5.9` (`C:\Users\91955\.gemini\bin\agy.exe`)

---

## 2. Test Execution Summary

| Test Suite File | Layer / Component | Test Kind | Passed | Failed | Skipped | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `server/tests/config.test.ts` | Root `.env` Discovery, Precedence & Fixture Isolation (R2, F1) | Unit (Temp Workspace) | 3 | 0 | 0 | PASSED |
| `server/tests/health.test.ts` | Process (`/livez`), Readiness (`/readyz`), TLS & pg.Client SSL (R5, R6, F3) | Unit (Mock DB) | 11 | 0 | 0 | PASSED |
| `server/tests/tick.test.ts` | Scheduler Webhook Auth & Validation (R3) | Unit (Mock DB) | 12 | 0 | 0 | PASSED |
| `server/tests/spa.test.ts` | SPA Fallback, Root Namespace Guards & Error Handling (R7) | Unit (Express) | 9 | 0 | 0 | PASSED |
| `server/tests/db.integration.test.ts` | Real Database Isolation & Schema Scoping (R4, F2) | Integration (Real PostgreSQL) | 0 | 0 | 1 | **BLOCKED** |
| `worker/tests/worker.test.ts` | Cron Mapping, Timeouts, Config Validation & Receipt Hardening (R1, R3, F4) | Unit (Mock Fetch) | 28 | 0 | 0 | PASSED |
| **Total Across Workspaces** | — | — | **63** | **0** | **1** | **PASSED** |

### Mock vs Real Database Breakdown
- **Mocks Used**:
  - `server/tests/health.test.ts`: Uses `vi.spyOn(poolModule, 'getPool')` and mock query promises to verify zero DB calls on `/livez`, 30-second in-memory caching, in-flight query deduplication (R5), sanitized error responses, and pool TLS verification configuration with `pg.Client` parameter inspection (R6, F3).
  - `server/tests/tick.test.ts`: Uses mock pool query returns to test constant-time secret comparison, request validation, and simulated duplicate tick responses (`ON CONFLICT`).
  - `worker/tests/worker.test.ts`: Uses mock `Response` and mock `fetch` to simulate transient 500 errors, network timeouts, stalled response streams, malformed JSON, non-object JSON receipts (`null`, array, primitive), and zero outbound fetches on invalid configuration (F4).
- **Real Database Used**:
  - `server/tests/db.integration.test.ts`: Requires a real isolated PostgreSQL database via `TEST_DATABASE_URL` (with parsed endpoint distinction and per-test disposable schema isolation `test_qb_<uuid>`).
  - **Result**: **BLOCKED / SKIPPED**. `TEST_DATABASE_URL` was not configured in the local environment. In strict adherence to project guidelines (R4, F2), real database behavior was NOT claimed to be verified with mocks.

---

## 3. Exact Verification Commands and Output

### A. TypeScript Typecheck
**Command**:
```powershell
npm run typecheck
```
**Exit Code**: `0`
**Sanitized Output**:
```
> quickbite@0.1.0 typecheck
> npm --workspace=server run typecheck && npm --workspace=web run typecheck && npm --workspace=worker run typecheck

> @quickbite/server@0.1.0 typecheck
> tsc --noEmit

> @quickbite/web@0.1.0 typecheck
> tsc --noEmit

> @quickbite/worker@0.1.0 typecheck
> tsc --noEmit
```

### B. Production Build
**Command**:
```powershell
npm run build
```
**Exit Code**: `0`
**Sanitized Output**:
```
> quickbite@0.1.0 build
> npm --workspace=web run build && npm --workspace=server run build

> @quickbite/web@0.1.0 build
> tsc && vite build

vite v6.4.6 building for production...
transforming...
✓ 27 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.66 kB │ gzip:  0.43 kB
dist/assets/index-Dj4Y14mn.css    2.23 kB │ gzip:  0.87 kB
dist/assets/index-X299OTM8.js   146.77 kB │ gzip: 47.43 kB
✓ built in 762ms

> @quickbite/server@0.1.0 build
> tsc
```

### C. Automated Test Suites
**Command**:
```powershell
npm test
```
**Exit Code**: `0`
**Sanitized Output**:
```
> quickbite@0.1.0 test
> npm --workspace=server run test && npm --workspace=worker run test

> @quickbite/server@0.1.0 test
> vitest run

 RUN  v2.1.9 E:/project/QuickBite/server

 ✓ tests/config.test.ts (3 tests) 17ms
stderr | tests/tick.test.ts > POST /internal/tick (Authentication & Validation) > Authentication Guardrails > returns 500 when server TICK_SECRET configuration is missing
Tick authentication failed: TICK_SECRET is not configured on the server.

 ↓ tests/db.integration.test.ts (1 test | 1 skipped)
 ✓ tests/health.test.ts (11 tests) 166ms
 ✓ tests/spa.test.ts (9 tests) 167ms
 ✓ tests/tick.test.ts (12 tests) 172ms

 Test Files  4 passed | 1 skipped (5)
      Tests  35 passed | 1 skipped (36)
   Start at  15:33:02
   Duration  1.63s

> @quickbite/worker@0.1.0 test
> vitest run

 RUN  v2.1.9 E:/project/QuickBite/worker

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Tick Dispatching, Identity Preservation & Retry Policy > fails safely when TICK_SECRET configuration is missing
[Scheduler] Configuration error for job cutoff: TICK_SECRET configuration missing

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Tick Dispatching, Identity Preservation & Retry Policy > fails safely when APP_URL configuration is missing without defaulting to localhost (R3)
[Scheduler] Configuration error for job cutoff: APP_URL configuration missing

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Tick Dispatching, Identity Preservation & Retry Policy > dispatches authenticated POST, verifies receipt format and preserves scheduled_for identity
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms
[Scheduler] Tick verified successfully: job=cutoff status=200 duplicate=false

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Tick Dispatching, Identity Preservation & Retry Policy > retries on 5xx transient server error with identical invocation identity
[Scheduler] Dispatching tick: job=reminder scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Tick Dispatching, Identity Preservation & Retry Policy > retries on 5xx transient server error with identical invocation identity
[Scheduler] Server returned 5xx status=500 job=reminder

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Tick Dispatching, Identity Preservation & Retry Policy > retries on 5xx transient server error with identical invocation identity
[Scheduler] Dispatching tick: job=reminder scheduled_for=2026-11-15T17:30:00.000Z attempt=2 timeout=5000ms
[Scheduler] Tick verified successfully: job=reminder status=200 duplicate=false

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Tick Dispatching, Identity Preservation & Retry Policy > does NOT retry client authentication (401/403) or validation (400) failures
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Tick Dispatching, Identity Preservation & Retry Policy > does NOT retry client authentication (401/403) or validation (400) failures
[Scheduler] Non-retryable error received: status=401 job=cutoff
[Scheduler] Non-retryable error received: status=400 job=cutoff

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > aborts when initial fetch hangs beyond configured timeout
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=25ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > aborts when initial fetch hangs beyond configured timeout
[Scheduler] Network/Timeout error on attempt 1 for job cutoff: The operation was aborted due to timeout

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > aborts when initial fetch hangs beyond configured timeout
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=2 timeout=25ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > aborts when initial fetch hangs beyond configured timeout
[Scheduler] Network/Timeout error on attempt 2 for job cutoff: The operation was aborted due to timeout

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > keeps timeout protection active through response body reading
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=25ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > keeps timeout protection active through response body reading
[Scheduler] Network/Timeout error on attempt 1 for job cutoff: Body stream timed out

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > keeps timeout protection active through response body reading
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=2 timeout=25ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > keeps timeout protection active through response body reading
[Scheduler] Network/Timeout error on attempt 2 for job cutoff: Body stream timed out

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > rejects HTTP 200 response containing HTML (e.g. SPA fallback)
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > rejects HTTP 200 response containing HTML (e.g. SPA fallback)
[Scheduler] Response is not valid JSON for job=cutoff

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > rejects HTTP 200 response containing malformed JSON
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > rejects HTTP 200 response containing malformed JSON
[Scheduler] Response is not valid JSON for job=cutoff

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > rejects HTTP 200 response when receipt status is not "recorded"
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > rejects HTTP 200 response when receipt status is not "recorded"
[Scheduler] Receipt status is "completed", expected "recorded" for job=cutoff

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > rejects HTTP 200 response when receipt job_name or scheduled_for does not match requested
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > rejects HTTP 200 response when receipt job_name or scheduled_for does not match requested
[Scheduler] Receipt job_name "reminder" does not match requested "cutoff"

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Configuration & Receipt Hardening (F4) > dispatchTick with invalid configuration causes zero outbound fetches > causes zero outbound fetches on remote HTTP APP_URL
[Scheduler] Configuration error for job cutoff: APP_URL must use HTTPS protocol for remote deployments, received "http:"

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Configuration & Receipt Hardening (F4) > dispatchTick with invalid configuration causes zero outbound fetches > causes zero outbound fetches on credentials in APP_URL
[Scheduler] Configuration error for job cutoff: APP_URL must not contain embedded credentials

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Configuration & Receipt Hardening (F4) > dispatchTick with invalid configuration causes zero outbound fetches > causes zero outbound fetches on invalid TICK_TIMEOUT_MS (zero, negative, huge, non-numeric)
[Scheduler] Configuration error for job cutoff: Invalid TICK_TIMEOUT_MS: "0". Must be between 1 and 120000 ms.
[Scheduler] Configuration error for job cutoff: Invalid TICK_TIMEOUT_MS: "-1000". Must be a finite positive integer between 1 and 120000 ms.
[Scheduler] Configuration error for job cutoff: Invalid TICK_TIMEOUT_MS: "invalid". Must be a finite positive integer between 1 and 120000 ms.
[Scheduler] Configuration error for job cutoff: Invalid TICK_TIMEOUT_MS: "999999999". Must be between 1 and 120000 ms.

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Configuration & Receipt Hardening (F4) > Receipt JSON hardening against null, array, and non-object responses > rejects HTTP 200 response when parsed JSON is null without throwing
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Configuration & Receipt Hardening (F4) > Receipt JSON hardening against null, array, and non-object responses > rejects HTTP 200 response when parsed JSON is null without throwing
[Scheduler] Response JSON is not a valid receipt object for job=cutoff

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Configuration & Receipt Hardening (F4) > Receipt JSON hardening against null, array, and non-object responses > rejects HTTP 200 response when parsed JSON is an array without throwing
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Configuration & Receipt Hardening (F4) > Receipt JSON hardening against null, array, and non-object responses > rejects HTTP 200 response when parsed JSON is an array without throwing
[Scheduler] Response JSON is not a valid receipt object for job=cutoff

stdout | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Configuration & Receipt Hardening (F4) > Receipt JSON hardening against null, array, and non-object responses > rejects HTTP 200 response when parsed JSON is a primitive number or boolean
[Scheduler] Dispatching tick: job=cutoff scheduled_for=2026-11-15T17:30:00.000Z attempt=1 timeout=5000ms

stderr | tests/worker.test.ts > Cloudflare Worker Scheduler Spike > Worker Configuration & Receipt Hardening (F4) > Receipt JSON hardening against null, array, and non-object responses > rejects HTTP 200 response when parsed JSON is a primitive number or boolean
[Scheduler] Response JSON is not a valid receipt object for job=cutoff

 ✓ tests/worker.test.ts (28 tests) 3220ms
   ✓ Cloudflare Worker Scheduler Spike > Tick Dispatching, Identity Preservation & Retry Policy > retries on 5xx transient server error with identical invocation identity 1012ms
   ✓ Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > aborts when initial fetch hangs beyond configured timeout 1063ms
   ✓ Cloudflare Worker Scheduler Spike > Worker Timeouts & Success Validation (R3) > keeps timeout protection active through response body reading 1089ms

 Test Files  1 passed (1)
      Tests  28 passed (28)
   Start at  15:33:06
   Duration  4.02s
```

---

## 4. Browser Checks
- **Automated Browser End-to-End Suite**: **NOT RUN** (Playwright smoke tests are scheduled for subsequent milestones after frontend interactive forms are developed).
- **Express Static Delivery Verification**: Verified via programmatic Supertest HTTP requests asserting that `web/dist/index.html` is returned with status 200 on root and client navigation paths, containing the DEMO MODE notice.

---

## 5. Explicit Record of Checks NOT Run
1. **Real Cloudflare Worker Deployment**: Not deployed to Cloudflare network; verified locally via Vitest mock runtime.
2. **Real Render Web Service Deployment**: Not deployed to Render hosting; verified locally via Express server.
3. **Real Neon PostgreSQL Database Integration**: Not connected to Neon; `TEST_DATABASE_URL` was not provided, and database integration tests were skipped/blocked accordingly.
4. **Multi-Day Scheduler Clock Evidence**: Multi-day tick log accumulation is explicitly scheduled for Milestone M1B.
