# QuickBite Milestone M1B: Next Steps (Cloud Hosting & Scheduler Phase)

## 1. Current Status & Transition
The **Database Verification** phase of Milestone M1B is completely verified:
- Separate Neon test branch verified with direct connection and disposable schema isolation.
- Pre-migration isolation gate verified on both test and application connection pools.
- Real PostgreSQL integration tests passing (4/4).
- Application schema migration `001_create_scheduler_runs.sql` applied to Neon application branch and verified idempotent.
- Local Express monolith verified end-to-end against real Neon database (`/livez`, `/readyz` caching, authenticated tick recording, duplicate handling).
- Full monorepo test suite passing (67 tests, 0 skipped, 0 failed).

The immediate next phase is **Cloud Hosting & 3-Day Scheduler Evidence**.

---

## 2. Next Implementation & Deployment Steps

### A. Render Web Service Deployment
1. Create Render free account; record whether payment card is required.
2. Connect GitHub repository and deploy the Express modular monolith.
3. Configure environment variables in Render dashboard:
   - `DATABASE_URL` (Neon application connection string)
   - `TICK_SECRET` (Cryptographic bearer secret)
   - `PORT` (Default 3000)
4. Configure platform health check path strictly to `/livez` (zero database queries) to allow Neon compute to sleep when idle.

### B. Cloudflare Worker Scheduler Deployment
1. Create Cloudflare account; record whether payment card is required.
2. Deploy `worker/` using Wrangler.
3. Set secrets via Wrangler:
   - `npx wrangler secret put TICK_SECRET`
   - `npx wrangler secret put APP_URL` (Pointing to deployed Render application HTTPS origin)
4. Verify all 5 UTC cron triggers are active on Cloudflare dashboard:
   - `30 16 * * *` (22:00 IST reminder)
   - `30 17 * * *` (23:00 IST cutoff)
   - `40 17 * * *` (23:10 IST cutoff_retry)
   - `30 3 * * *` (09:00 IST recovery)
   - `20 4 * * *` (09:50 IST recovery_retry)

### C. Multi-Day Scheduler Evidence Collection
1. Accumulate at least 3 consecutive days of live cron triggers recorded in `docs/evidence/`.
2. For each tick, capture: scheduled time, arrival time, cold-start duration, and whether retry was needed.
3. Observe Neon serverless compute suspend (scale to zero) during idle intervals between ticks.

---

## 3. Acceptance Criteria Before Declaring Milestone M1 Complete
- Public Render URL loads and `GET /livez` responds with HTTP 200 without touching PostgreSQL.
- `GET /readyz` connects to Neon and demonstrates 30-second caching.
- At least three consecutive days of scheduled ticks recorded in `docs/evidence/` with arrival times, latency, cold-start duration, and retry counts.
- Neon compute is observed to suspend when idle.
- Payment card requirements and limitations of all free tiers are documented.
