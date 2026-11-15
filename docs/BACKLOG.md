# QuickBite: Backlog

Status: nothing started. Each milestone is a small end-to-end slice with its own tests and acceptance criteria. Rules are in `BUSINESS_RULES.md`. Design is in `ARCHITECTURE.md`.

Conventions:
- A milestone is done only when its tests pass and its acceptance criteria are demonstrated and recorded in `HANDOFF.md` under "Verified results".
- Spike milestones record evidence (timestamps, screenshots, headers) in a `docs/evidence/` folder.
- If a spike fails, work stops and the alternatives are presented for a decision. Nothing is replaced silently.

---

## M0: Local environment and repository setup

**Scope**
- Install Node.js LTS, git and the package manager. Create the GitHub repository (account creation only for GitHub).
- Create the repo structure: `web/`, `server/`, `worker/`, `docs/` (the five documents) and an agent rules file that points to them.
- Confirm which skills folder the installed Antigravity version scans, then install the single chosen workflow plugin (Superpowers). Do not install overlapping skill collections.
- TypeScript, lint and format configuration. Vitest configured. An empty passing test run.
- Decide the local and test database approach (a Neon development branch and a separate test branch, or local Postgres). No Docker.

**Tests**
- A trivial unit test passes in `server/` and `web/`.
- A unit test using the injectable `Clock` interface with a fake clock.

**Acceptance**
- A fresh clone installs, builds and runs tests with documented commands.
- The documents are committed and the agent rules file references them.
- The skills folder name and the installed plugin are recorded.

---

## M1: Minimal deployed app, database connectivity and authenticated scheduler spike

Split into **M1A** (local application skeleton & scheduler spike) and **M1B** (deployment, database connectivity & authenticated scheduler evidence).

### M1A: Local application skeleton & scheduler spike (Current)
**Scope**
- Project skeleton with npm workspaces: `web/` (React + Vite + TypeScript), `server/` (Express + TypeScript), `worker/` (Cloudflare Worker), SQL migrations, and tests.
- Express service with:
  - `GET /livez`: process liveness, no database access.
  - `GET /readyz`: bounded database readiness check, cached for at least 30 seconds, rate-limited, sanitized errors.
  - `POST /internal/tick`: authenticated scheduler webhook recording durable tick receipt in `scheduler_runs`. Constant-time bearer secret verification (`crypto.timingSafeEqual`), payload validation (`job_name`, `scheduled_for`). Does not mark meal jobs completed.
  - Production SPA static serving with explicit exclusion for `/livez`, `/readyz`, `/internal/*`, and `/api/*`.
- Database: `pg` pool with bounded timeouts (idle connection release for Neon scale-to-zero) and migration `001_create_scheduler_runs.sql` with unique logical invocation key `(job_name, scheduled_for)`.
- Cloudflare Worker with the 5 authoritative UTC cron triggers:
  - `30 16 * * *` — `reminder` (22:00 IST)
  - `30 17 * * *` — `cutoff` (23:00 IST)
  - `40 17 * * *` — `cutoff_retry` (23:10 IST)
  - `30 3 * * *` — `recovery` (09:00 IST)
  - `20 4 * * *` — `recovery_retry` (09:50 IST, final recovery before 10:00 IST)
  *(Note: No cron for menu lock at 18:00 IST, automatic delivery at 13:00 IST, or recovery at/after 10:00 IST).*
  - Worker passes `job_name` and platform `scheduledTime`, awaits authenticated POST, bounded request timeout, 1 retry on network/5xx error, no retry on 4xx validation/auth errors, sanitized logging.
- Frontend: Responsive placeholder with visible demo banner ("Demo Mode - Solo M.Tech Project"). No `/readyz` polling from browser.

**Tests**
- Unit tests: `/livez` zero DB access, `/readyz` caching and failure sanitization, tick authentication (missing, malformed, invalid, valid), payload validation, worker cron mapping and retry identity, production SPA routing.
- Integration tests: Database receipt idempotency with real PostgreSQL (or marked BLOCKED if external test database is not configured).

### M1B: Deployment, database connectivity and 3-day tick evidence

Divided into:
1. **Database Verification (Done)**:
   - Separate Neon test branch verified with direct connection and disposable schema isolation (`test_qb_<uuid>`).
   - Pre-migration isolation gate verified on both test and application connection pools.
   - Real PostgreSQL integration tests passed (4/4): idempotency, concurrent delivery, application table protection, schema cleanup.
   - Database migration `001_create_scheduler_runs.sql` applied to Neon application branch and verified via direct `information_schema` inspection.
   - Migration idempotency verified (`Applied 0 new migration(s)` on rerun).
   - Local Express server verified with real Neon database: `/livez` 200 OK (no DB access), `/readyz` 200 OK with 30s cache (MISS then HIT), `/internal/tick` authenticated receipt recording (duplicate=false then duplicate=true) and 401 auth rejection. Evidence captured in `docs/evidence/M1B_DATABASE.md`.
   - Full test suite: 67 passed, 0 failed, 0 skipped.

2. **Cloud Hosting & 3-Day Scheduler Evidence (Pending)**:
   - Deploy Express service to Render free tier from GitHub. Configure platform health check strictly to `/livez`.
   - Deploy Cloudflare Worker with the 5 cron triggers calling Render tick endpoint with Cloudflare secret.
   - Accumulate at least three consecutive days of scheduled ticks in `docs/evidence/`. For each tick: scheduled time, arrival time, cold-start duration, whether retry was needed.
   - Observe Neon compute suspend (scale to zero) when idle.
   - Record card requirements and any surprises per service.

**Acceptance (evidence required)**
- The public URL loads and `/livez` answers. `/readyz` confirms Neon connectivity.
- At least three consecutive days of scheduled ticks recorded in `docs/evidence/`. For each tick: scheduled time, arrival time, cold-start duration, whether the retry was needed.
- Neon compute is observed to suspend when idle.
- Card requirements and any surprises per service are recorded.
- If cron-to-app behaviour or account creation fails, stop and present alternatives for decision.

**Note:** development of M2 onward can proceed while the multi-day tick evidence accumulates. A live demo must not rely on the scheduler until this evidence exists.

---

## M2: Email delivery spike (Brevo)

**Scope**
- Create a Brevo account and verify one sender address. Record the exact steps and any restrictions encountered.
- A minimal send path from the Render service over HTTPS (not SMTP, since Render free blocks SMTP ports).
- Send test messages to at least three different external mailbox providers and record the result for each (inbox, spam, rejected), message headers and delay.
- Record behaviour on invalid recipient, on a quota or API error, and on a timeout.

**Tests**
- A fake sender for automated tests. The real sender is exercised manually in this milestone only.

**Acceptance**
- Real recipient delivery is **demonstrated** or **not demonstrated**, with evidence.
- If it is not demonstrated, stop and present options for a decision: Resend in test mode (own inbox only), no external email with an in-app outbox page, or another approach. Email is never silently replaced by simulation.

---

## M3: Authentication, roles and provider approval

**Scope**: signup (customer or provider applicant), login and logout with server sessions, argon2id, CSRF protection, rate limiting with a database-backed lockout, admin seed script, provider approval and disable (with the provider status log), a basic admin view, demo banner.

**Tests**: role and ownership tests, session expiry and revocation, rate-limit and lockout tests, no admin creation through signup, unapproved providers hidden.

**Acceptance**: only approved, enabled providers are visible for new subscriptions. Customers cannot reach provider or admin endpoints.

---

## M4: Plans, menus and mock subscriptions

**Scope**: plan creation and archiving, immutability once subscribed, menus with composition snapshot and the 18:00 lock, mock purchase with the one-purchase restriction, first eligible date preview and recomputation at payment, credit grant ledger entry, selection history for purchases.

**Tests**: immutability, menu lock boundaries (17:59:59 versus 18:00:00), concurrent purchases with all balances zero (exactly one succeeds), purchase timing table from `BUSINESS_RULES.md` Ex 4, preview versus payment mismatch.

**Acceptance**: checkout shows the correct first eligible date. Two parallel purchases create one subscription.

---

## M5: Selection, attendance, credit accounting, cutoff and recovery

**Scope**: skip and undo, explicit selection changes with effective-date rules, provisional status display, the service test, finality constraint on service results, meal creation with ledger consumption in one transaction, lock-ordered processing, ledger ordering for equal timestamps, recovery with the 10:00 decision instant, delayed disable replay, scheduler hooks (startup, request-triggered and tick), day processing records and labels.

**Tests**: examples 2 to 10 from the rules, duplicate runs, crash before commit, skip racing with cutoff, last-credit retry, equal-timestamp ordering, before and after 10:00 and the straddle case, two missed days, no result stored before cutoff, a menu or reminder check never stores "no service".

**Acceptance**: no balance goes negative or is double-deducted. Counts match meal records. Recovery labels appear correctly.

---

## M6: Headcount, prep sheet, delivery status and provider disabling

**Scope**: headcount views, prep sheet from snapshots, delivery transitions and corrections, bulk updates, status history, provider disabling with cancellations and returns, disabled-provider permissions, re-enable behaviour.

**Tests**: 20 meals x 4 rotis = 80, transition and correction rules, no regression to Pending while disabled, disable racing with a status update, report creation racing with disable, permission matrix.

**Acceptance**: Delivered is final. Disabling returns credits exactly once per cancelled meal.

---

## M7: Notifications and the production outbox

**Scope**: in-app notifications for each event type with unique event keys, the outbox with claims, leases, bounded retries, expiry for reminders, reminder run, first-Dispatched email, admin email log, using the real sender only if M2 demonstrated delivery.

**Tests**: one notification per event, lease expiry after a sender crash, stale claim token rejected, reminder expiry at 23:00:00, no late reminder, retry bounds, duplicate prevention by dedupe key.

**Acceptance**: failed or expired emails never affect attendance, credits or delivery, and are visible to admin.

---

## M8: Ratings, reports and operational visibility

**Scope**: ratings (Delivered only, one per meal, no deadline, average per plan), reports (window, one per meal, status and resolution note), disabled-provider report handling, admin read-only report list without contact data, admin health view (component readiness, last ticks, candidates without results, outbox counts, recovery labels, credits on disabled providers).

**Tests**: window boundaries (13:00:00 on D and 00:00:00 on D+2), one rating and one report per meal, reports on later-cancelled meals, admin sees no phone or email.

**Acceptance**: rules examples 11 and 13 pass. The health view reflects the real architecture and shows no broker metrics.

---

## M9: Hardening and demo preparation

**Scope**: security checklist pass, secret scan, re-check of free-tier terms (documented in `ARCHITECTURE.md` 12), seed script and demo script, a demo run-through using the real schedule, README with limitations, a short architecture walkthrough for interviews.

**Acceptance**: a documented demo runs end to end. Limitations (cold start, email, scheduling) are stated honestly in the README.

---

## Parking lot (not scheduled)

- Whether providers should see individual rating comments (not specified by the approved brief).
