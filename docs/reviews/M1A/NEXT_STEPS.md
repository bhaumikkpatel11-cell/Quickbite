# QuickBite Milestone M1A: Next Steps & Design Inquiries (v3 Post-Repair)

## 1. Current Blockers
- **PostgreSQL Test Database**: Without an isolated test database (`TEST_DATABASE_URL`), real concurrency and unique-constraint database tests remain BLOCKED (R4, F2).
- **External Free-Tier Accounts**: Neon, Render, and Cloudflare accounts must be provisioned to transition from local skeleton to deployed spike in M1B.

---

## 2. Next Milestone: M1B (Deployment & Multi-Day Spike)
The immediate next milestone is **Milestone M1B: Deployed App, Database Connectivity & Authenticated Scheduler Evidence**.

### Required Account & Configuration Steps:
1. **Neon PostgreSQL**:
   - Create free project on Neon.
   - Record whether signup requires a credit card.
   - Obtain pooled connection string and execute initial migration (`npm run migrate`).
2. **Render Web Service**:
   - Create free Render account; deploy Express modular monolith from GitHub.
   - Set environment variables: `DATABASE_URL` and `TICK_SECRET`.
   - Configure health check path strictly to `/livez`.
3. **Cloudflare Worker**:
   - Create Cloudflare account; deploy `quickbite-scheduler` via Wrangler.
   - Set secret: `npx wrangler secret put TICK_SECRET`.
   - Verify all 5 UTC cron triggers are active.

### Acceptance Criteria Before Declaring M1 Complete:
- Public URL loads and `GET /livez` responds with HTTP 200 without touching PostgreSQL.
- `GET /readyz` connects to Neon and demonstrates 30-second caching.
- At least three consecutive days of scheduled ticks recorded in `docs/evidence/` with arrival times, latency, cold-start duration, and retry counts.
- Neon serverless compute is observed to scale to zero (suspend) during idle intervals between ticks.
- Payment card requirements and limitations of all free tiers are documented.

---

## 3. Items for Instructor Review

### Item A: Worker Request Timeout & Retry Behavior vs. Hosting Cold-Start Time
- **The Challenge**:
  - Render free tier instances spin down after 15 minutes of inactivity. When a scheduled Cloudflare cron triggers after hours of idle time, Render cold-start latency typically takes 45 to 65 seconds.
  - Standard HTTP clients or Cloudflare Workers that set a short request timeout (e.g. 10–15 seconds) will abort before the container finishes waking up.
- **Implemented Fix & Hardening (R3, F4)**:
  - In response to review checklist items R3 and F4, `worker/src/index.ts` was updated with a validated default 90-second bounded timeout (`TICK_TIMEOUT_MS`) suitable for container cold starts.
  - Timeout is validated as a positive integer in `[1, 120000]` ms compatible with the Worker invocation budget. Invalid values cause zero outbound fetches.
  - Timeout protection remains active through full response-body reading, and invocation identity (`scheduled_for`) is strictly preserved across retries.
- **Verification Planned in M1B**:
  - Real Render wake-up latency will be empirically measured during the multi-day spike.

### Item B: Readiness Caching Reduces Queries But Does Not Guarantee Database Suspension
- **The Challenge**:
  - Neon PostgreSQL compute automatically suspends after ~5 minutes of idle time.
  - `GET /readyz` executes `SELECT 1` against PostgreSQL. To prevent probes from keeping compute active, we implemented a 30-second in-memory cache (`X-Cache: HIT`).
  - However, if an external monitor, uptime pinger, or admin dashboard polls `/readyz` every 2 to 4 minutes, each poll will result in a cache miss (exceeding 30s) and dispatch a query to PostgreSQL, effectively preventing Neon from ever scaling to zero and depleting the monthly 100 CU-hour free quota.
- **Implemented Fix & Architectural Safeguard (R5)**:
  - Documentation and route comments were updated to explicitly state that readiness caching does NOT guarantee database suspension if polled periodically.
  - Added in-flight request deduplication so concurrent readiness requests share a single database check.
  - All automated platform monitors (Render health check, uptime pingers) must target `/livez` exclusively, which makes zero database calls.
