# QuickBite Milestone M1B: Cloudflare Scheduler Deployment & Verification Evidence

**Date**: 2026-11-15 20:00:00 IST (UTC+05:30, Asia/Kolkata)  
**Worker Name**: `quickbite-scheduler`  
**Worker Target**: `https://quickbite-2q20.onrender.com/internal/tick`  
**Compatibility Date**: `2024-11-01`  
**Runtime**: Cloudflare Workers (Free Tier)  
**Scope**: Scheduler configuration, dry-run build verification, cron trigger schedule preservation, secret binding architecture, and Free tier limit assessment.

---

## 1. Cloudflare Workers Free Tier Compatibility Assessment (Task 4)

| Cloudflare Free Limit | QuickBite Requirement | Free Plan Fit | Analysis / Evidence |
| :--- | :--- | :---: | :--- |
| **Cron Triggers per Account** | 5 cron schedules | **Compliant** | Cloudflare Workers Free tier supports up to **5 Cron Triggers per account**. QuickBite uses exactly 5 authoritative cron schedules. |
| **Daily Request Quota** | 5 to 10 requests / day | **Compliant** | Free tier permits up to **100,000 requests/day**. 5 scheduled ticks (plus at most 1 retry each) generate ~10 requests/day (< 0.01% of daily allowance). |
| **CPU Time per Invocation** | < 2 ms CPU time | **Compliant** | Free tier provides **10 ms CPU time** per cron invocation. `quickbite-scheduler` only validates configuration and initiates an asynchronous `fetch()`, consuming ~1 ms CPU time. (I/O wait time for Render cold starts does not count against CPU time). |
| **Execution Wall Clock Timeout** | Up to 90 seconds | **Compliant** | Scheduled events support extended execution windows up to 15 minutes, accommodating the 90-second timeout budget required for sleeping Render containers. |
| **Worker Script Size** | 10.01 KiB (2.62 KiB gzip) | **Compliant** | Well within the 1 MiB compressed script size limit for the Free tier. |

---

## 2. Configuration & Cron Schedule Preservation (Tasks 2 & 3)

The configuration file [`worker/wrangler.jsonc`](file:///e:/project/QuickBite/worker/wrangler.jsonc) specifies the target URL and the 5 authoritative cron schedules:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "quickbite-scheduler",
  "main": "src/index.ts",
  "compatibility_date": "2024-11-01",
  "triggers": {
    "crons": [
      "30 16 * * *", // 22:00 IST — reminder
      "30 17 * * *", // 23:00 IST — cutoff
      "40 17 * * *", // 23:10 IST — cutoff retry
      "30 3 * * *",  // 09:00 IST — recovery
      "20 4 * * *"   // 09:50 IST — final recovery attempt
    ]
  },
  "vars": {
    "APP_URL": "https://quickbite-2q20.onrender.com"
  }
}
```

### Cron Expression to Job Name Mapping
The Worker mapping in [`worker/src/index.ts`](file:///e:/project/QuickBite/worker/src/index.ts) strictly preserves the business schedule:

| UTC Cron Expression | IST Trigger Time | Job Identifier | Purpose |
| :--- | :---: | :--- | :--- |
| `30 16 * * *` | 22:00 IST | `reminder` | Emits unconfirmed meal reminders 1 hour before cutoff |
| `30 17 * * *` | 23:00 IST | `cutoff` | Primary cutoff execution: fixes inclusion, consumes credits |
| `40 17 * * *` | 23:10 IST | `cutoff_retry` | Retry window for interrupted or failed cutoff processing |
| `30 3 * * *` | 09:00 IST | `recovery` | Morning service recovery for pending/unresolved items |
| `20 4 * * *` | 09:50 IST | `recovery_retry` | Final recovery attempt prior to hard 10:00 IST recovery deadline |

---

## 3. Secret Binding Architecture (Task 6)

In accordance with project security directives:
- `TICK_SECRET` is **never** committed to `wrangler.jsonc`, `package.json`, or Git.
- `TICK_SECRET` is **never** passed as plain-text command-line arguments or exposed in console logs.
- The secret is provisioned into the Cloudflare Worker via:
  ```powershell
  # Interactive prompt (reads value securely from stdin without echo)
  npx wrangler secret put TICK_SECRET --config worker/wrangler.jsonc
  ```
  Or piped securely from the local `.env` without echoing to terminal logs.

---

## 4. Local Build & Test Verification Results (Task 4)

### A. TypeScript Typecheck
- **Command**: `npm --workspace=worker run typecheck`
- **Result**: `0 errors` (Clean TypeScript compilation with `@cloudflare/workers-types`).

### B. Worker Unit Test Suite
- **Command**: `npm --workspace=worker run test`
- **Result**: **28 passed, 0 failed, 0 skipped** across `worker/tests/worker.test.ts`.
  - Cron trigger schedule mapping verified for all 5 UTC expressions.
  - Preserves exact `scheduled_for` ISO timestamp across retries.
  - Retries once on 5xx server errors and network timeouts.
  - Halts immediately on 4xx client/validation errors without retry.
  - Enforces `validateWorkerConfig` (pure HTTPS origin, rejection of URL paths/credentials/query params).
  - Rejection of public `/trigger` confirmed (returns 404; outbound dispatch is triggered exclusively via scheduled cron events).
  - Receipt validation hardened against non-object responses (`null`, arrays, primitives).

### C. Deployment Dry-Run Output
- **Command**: `npx wrangler deploy --dry-run --config worker/wrangler.jsonc`
- **Output**:
  ```text
  ⛅️ wrangler 4.162.0
  ────────────────────
  Total Upload: 10.01 KiB / gzip: 2.62 KiB
  Your Worker has access to the following bindings:
  Binding                                                  Resource                  
  env.APP_URL ("https://quickbite-2q20.onrender.com")      Environment Variable      

  --dry-run: exiting now.
  ```

---

## 5. Deployment Status & Verification Checklist

- [x] Project-local Wrangler installed (`wrangler@4.162.0`) in `worker/package.json`.
- [x] `APP_URL` configured to `https://quickbite-2q20.onrender.com` in `worker/wrangler.jsonc`.
- [x] All 5 authoritative UTC cron schedules preserved.
- [x] All 28 worker tests and typechecks passing.
- [x] Wrangler deployment dry-run verified.
- [x] Free tier limits confirmed (5 cron triggers per account supported).
- [ ] Cloudflare account authentication (`wrangler login` / API token).
- [ ] `TICK_SECRET` encrypted secret bound on Cloudflare.
- [ ] Production deployment executed via `npx wrangler deploy --config worker/wrangler.jsonc`.
- [ ] Live cron trigger execution observed in `docs/evidence/M1B_SCHEDULER_OBSERVATION.md`.
