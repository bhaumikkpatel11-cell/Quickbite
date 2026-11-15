# QuickBite: Architecture

Status: approved design. Nothing is implemented or deployed. Business behaviour is defined in `BUSINESS_RULES.md` (v2.1) and is not repeated here except where it constrains the design.

## 1. Decision summary

**Option A: a modular monolith with database-backed jobs and a transactional outbox.**

- One deployable Node.js service. Modules call each other through service functions, not over a network.
- Every business step (meal, credit consumption, in-app notification, processing record, outbox record) commits in **one database transaction**. A crash therefore cannot leave partial state, and no repair protocol is needed.
- Email is the only external side effect. It is written to an `outbox` table in the same transaction and sent afterwards by an in-process sender with leases and bounded retries.
- Deadlines are enforced by the clock on every request. Schedulers only make processing happen sooner and never decide correctness.

**Why not the alternatives**

- *Separate worker with outbox:* a separate always-on worker is not available on a free Render instance (see section 9). The outbox pattern itself is a table and is kept inside the one process.
- *Microservices with a message broker:* several always-on services plus a broker is not realistic at ₹0, and a credit ledger would need sagas and compensation. It would be hard for one person to run and defend.

**Terminology used in this project**

- **Domain event:** a business fact (meal dispatched, provider disabled). It is a design concept and may be a function call or a row.
- **Scheduled job:** work triggered by time (cutoff for date D).
- **Outbox / durable job queue:** a table of pending side effects, written atomically with the state change and retried by a consumer.
- **Message broker:** a separate server routing messages between independent processes. Not used.

## 2. Diagram

```
Browser (React SPA)
   | HTTPS, session cookie
   v
Render free web service: Express modular monolith (also serves the SPA)
 |- modules: identity, providers, catalog, subscriptions, attendance,
 |           meals, accounting, notifications, feedback, ops
 |- GET  /livez            (no database access)
 |- GET  /readyz           (database check, cached, not for frequent probes)
 |- POST /internal/tick  <-- Cloudflare Worker cron (5 UTC schedules)
 |                         + startup catch-up + request-triggered recovery
 '- in-process outbox sender (no polling loop)
   | SQL, one transaction per business operation
   v
Neon PostgreSQL: business tables, credit_ledger, notifications, outbox, scheduler_runs
   outbox rows --> sender --HTTPS API--> Brevo (first email candidate)
```

## 3. Technology decisions

| Layer | Selected | Why | Simpler alternative considered | Main limitation |
|---|---|---|---|---|
| Frontend | React + Vite + TypeScript SPA, served by the Express service | Responsive role-based screens | Server-rendered templates | First load after idle is slow (cold start) |
| Backend | Node.js + Express + TypeScript, `pg` with plain SQL, Zod validation | Explicit transactions and locks for the ledger | ORM (hides locking) | One free instance, restarts possible |
| Database | PostgreSQL on Neon | Row locks, unique constraints and multi-row transactions | MongoDB (weaker constraints for this ledger), SQLite (ephemeral filesystem on Render) | Scale-to-zero cold start, small storage |
| Authentication | Server sessions: opaque random token, hash stored in DB, httpOnly Secure SameSite=Lax cookie, argon2id passwords | Revocable, simple role checks | JWT (no benefit with one server) | A DB lookup per authenticated request |
| Jobs and events | Postgres tables plus in-process runner plus external cron tick | Durable retries without Redis or a broker | Redis (the free Render Key Value does not persist), RabbitMQ (extra service) | Runs only while the app is awake |
| Email | Brevo transactional API over HTTPS (to be demonstrated) | The only candidate that may send to arbitrary recipients at ₹0 | Resend (needs a verified domain, not ₹0) | Real delivery UNVERIFIED |
| Testing | Vitest, Supertest, a real Postgres test database (Neon branch), few Playwright smoke tests | Concurrency and constraint behaviour needs a real DB | Mocked DB | Needs network for DB tests |
| Deployment | Render web service from GitHub, Cloudflare Worker via Wrangler | Cheapest feasible combination | Docker (not required) | Free-tier terms can change |

Not used: Redis, RabbitMQ, JWT, Docker, microservices, event sourcing.

## 4. Modules

| Module | Responsibility |
|---|---|
| identity | Signup, login, sessions, role checks |
| providers | Application, approval, enable/disable, status log |
| catalog | Plans (immutable once subscribed), menus with composition snapshots |
| subscriptions | Purchase, selection history, first-eligible-date calculation and preview |
| attendance | Skip and undo, cutoff clock rules |
| meals | Service test, meal creation, recovery, delivery status, headcount and prep sheet |
| accounting | The only writer of the credit ledger |
| notifications | In-app records, outbox, email sender |
| feedback | Ratings and reports |
| ops | Scheduler runs, health views |
| shared | Clock interface, authorization policies, error types |

Dependency rule: modules call each other only through service interfaces. Only `accounting` writes ledger rows and only `meals` creates meal records.

## 5. Data model

| Entity | Key points |
|---|---|
| users | Unique email. Role assigned server-side. Admin created by a seed script only |
| providers, provider_status_log | Current state plus an append-only log with effective timestamps |
| plans | Composition, credits, price, archived flag |
| daily_menus | Unique (plan, service date). Composition snapshot |
| subscriptions | Purchase time, first eligible date. Balance is the sum of ledger entries |
| selection_history | Customer, subscription, selected-at, effective-from date computed from the selection rules |
| skip_decisions | Primary key (customer, service date) |
| service_results | Primary key (customer, service date). Result (served or not) and reason. Carries the cutoff instant and the decision instant. A check constraint requires decision instant >= cutoff instant, so no result can be stored before cutoff |
| daily_meals | Unique (customer, service date). One supplying subscription. Outcome Included, Skipped or Cancelled with reason. Composition snapshot. Delivery status. Decision instant, completion time, late flag |
| credit_ledger | Unique (meal, type). A return references its consumption through a unique foreign key. Ordered by (effective time, sequence) |
| delivery_status_history | Per-meal history |
| ratings | Unique per meal. Stars 1 to 5, optional comment |
| reports | Unique per meal. Type, description, status, resolution note |
| notifications | Unique (user, event key) |
| outbox | See section 8 |
| scheduler_runs | Trigger source, job kind, scheduled and actual times, outcome, counts |
| sessions | Hashed token, user, expiry |

## 6. Consistency and locking

### 6.1 Lock order

Locks are always acquired in this order and never in reverse. Within a level, rows are locked in ascending id order.

1. provider
2. customer (user row)
3. subscription
4. daily meal

Ledger, notification and outbox rows are inserted and never locked separately. All ledger inserts for a subscription happen while that subscription's row is locked, so ledger sequence numbers follow commit order for that subscription.

Pattern for every operation: **read to find candidates, acquire locks in order, re-validate under locks, decide, write, commit.** Unique constraints are a second line of defence and do not replace this coordination.

| Operation | Locks (in order) |
|---|---|
| Purchase | provider (shared), customer, that customer's subscriptions |
| Skip, undo, selection change | customer. The clock is read after the lock |
| Cutoff or recovery of one customer-date | supplying provider (shared), customer, subscription, then insert meal and ledger |
| Provider disable (including credit returns) | provider (exclusive), then affected customers ascending, their subscriptions ascending, their meals ascending |
| Delivery status update | provider (shared), meal |
| Report, rating | meal (shared) |
| Admin approval, enable, disable | provider (exclusive) |

A cutoff transaction holds only one customer, and blocks at the provider level if a disable is in progress, so the orders cannot deadlock.

### 6.2 Scenarios

| Scenario | Handling |
|---|---|
| Concurrent purchases with all balances zero | The customer row lock serialises them. The second sees a positive balance and fails |
| Skip racing with cutoff | The skip reads its clock after taking the customer lock. Cutoff processing needs the same lock. An accepted skip is visible to processing, and a skip arriving later is rejected |
| Duplicate cutoff runs | After locks, an existing result is recognised before evaluation. A second concurrent run waits on the lock and then finds the result |
| Final credit retried | Same recognition rule. The balance before the meal's own consumption is computed with the ordering in `BUSINESS_RULES.md` 8.3, so the consumption never invalidates its own meal |
| Provider disable racing with preparation | Disable takes the provider exclusively. Status updates take it shared and re-check the meal. Either the update commits first (meal no longer Pending) or the disable commits first (update rejected for a cancelled meal or an invalid regression) |
| Crash during meal creation or notification | All records commit together. A crash before commit leaves nothing. A health query still looks for anomalies as a detective check |
| Selection and historical reconstruction | The selected subscription for D is the latest history row with effective-from date <= D. It is a pure query |
| Delayed disable replay | Under the provider lock, disable events between cutoff and the decision instant are replayed (`BUSINESS_RULES.md` 10.5) in the same transaction |
| Preview or reminder cached as "no service" | Not possible: previews and reminder checks write nothing to `service_results` |

### 6.3 Service result finality

`service_results` rows are written only by cutoff or recovery processing at or after the cutoff instant. The database constraint enforces this. Menu previews, checkout previews and reminder evaluation compute provisional answers on demand and store nothing.

## 7. Clock and the recovery decision point

- A `Clock` interface is injected. Production reads the database clock inside the active transaction, so all app instances share one time source. Tests inject a fake clock. There is no environment variable, endpoint or admin control that overrides the clock in production, and the fake clock is not part of the production bundle.
- For each customer-date the transaction does the following: acquire the locks, re-check for an existing result, read the clock once (the **decision instant**), decide the outcome, write results with the decision instant, commit.
- **Mapping to the 10:00 rule.** A decision instant before 10:00:00 on D finalizes. A decision instant at or after 10:00:00 cancels as missed processing. The decision instant is read after locks are held, so waiting for a lock does not make a meal appear earlier. The commit follows within a short transaction timeout (a few seconds). The system does not claim the commit happened before 10:00. It records both the decision instant and the completion time, and the UI shows the decision instant for late-finalized meals.
- Existing finalized meals are recognised first and are never cancelled by a late retry.

## 8. Jobs, events and the outbox

### 8.1 Job and event table

| Name (type) | Trigger and producer | Durable record | Consumer | Retry and deduplication | Failure visibility |
|---|---|---|---|---|---|
| Reminder run (scheduled job) | Cron 22:00 IST via tick | In-app notification plus outbox row per eligible customer, in one transaction. No per-customer "no service" record | Outbox sender | Unique key `reminder:customer:date`. Outbox row expires at 23:00:00 | Expired, Failed and Missed counts in admin health |
| Cutoff run (scheduled job) | Cron 23:00 and 23:10 IST, startup catch-up, request-triggered | `service_results`, meal, ledger, notification, outbox rows, one transaction per customer-date | Same process | Idempotent per customer-date through locks and recognition of existing results | Count of candidates without results, per date |
| Recovery run (scheduled job) | Cron 09:00 and 09:50 IST, startup, request-triggered | Same records, with decision instants | Same | Same | "Recovery incomplete" label |
| Meal status changed (domain event) | Provider request | Status history and notification, one transaction. Outbox row only for the first Dispatched | n/a | Notification keyed by history row. Email keyed `dispatched:meal` | Request error |
| Provider disabled (domain event) | Admin request | Status log, cancellations, returns, notifications, one transaction | n/a | Return unique per meal | Request error |
| Email send (outbox) | Any transaction needing email | `outbox` row | In-process sender | Section 8.2 | Failed and Expired counts, admin email log |

### 8.2 Outbox claiming, leases and retries

Outbox columns: id, kind, unique dedupe key, payload, status (pending, sending, sent, failed, expired), attempts, maximum attempts, next attempt time, expiry time (set for reminders, null otherwise), claim token, claim time, lease expiry, last error, provider message id, sent time.

1. **Claim (short transaction).** Select due rows that are pending (next attempt time reached) or sending with an expired lease, using skip-locked, a small batch size and a time budget. Rows past their expiry time are marked expired instead. For the rest, set status sending, increase attempts, store a new claim token and set the lease expiry. Commit.
2. **Send (no transaction open).** Call the email API outside any database transaction. Before the call, check expiry again. The call has a timeout shorter than the lease. A message already handed to the provider cannot be recalled.
3. **Record (short transaction).** Update the row only if its claim token still matches. Mark sent, or schedule a retry with backoff (for example 1, 5 and 15 minutes) back to pending, or mark failed when attempts reach the maximum.
4. **Sender crash.** The row stays in sending until the lease expires, after which another claim recovers it. The attempt counter has already been incremented, so retries remain bounded. A recovered row whose outcome was unknown may produce a duplicate email. That is accepted (best-effort email). If attempts are exhausted the row is failed with the note "outcome unknown".
5. **Expiry.** Reminder rows expire at the cutoff instant. Expired rows are recorded and never sent. Other kinds have no expiry but are bounded by attempts.
6. **Stale sender.** A sender whose lease expired cannot overwrite a newer claim because the token check fails.
7. **Triggers.** The sender runs after a commit that created outbox rows, on every tick and on lazy request-triggered recovery. There is no polling loop or periodic timer.
8. **Deduplication.** The unique dedupe key prevents creating two outbox rows for the same event. Brevo idempotency support is not assumed. Duplicates from crashes remain possible.
9. **Quota.** If the email provider reports a quota error, the row is retried within its limits. Reminders expire in any case.

## 9. Scheduling

Cloudflare cron triggers run in UTC. The free plan allows five. They are used as follows.

| Cron (UTC) | IST | Purpose |
|---|---|---|
| `30 16 * * *` | 22:00 | Reminder run |
| `30 17 * * *` | 23:00 | Cutoff run |
| `40 17 * * *` | 23:10 | Cutoff retry |
| `30 3 * * *` | 09:00 | Recovery run |
| `20 4 * * *` | 09:50 | Last recovery run before 10:00 |

- The Worker calls `POST /internal/tick` with a bearer secret and a job name. The server decides the relevant date from its own clock and ignores dates in the request.
- Every tick also drains the outbox.
- The first request wakes the sleeping Render service, which takes about a minute. The Worker uses one retry. Correctness does not depend on tick timing.
- There is no 18:00 job: menu lock and selection are computed from timestamps.
- Do not ping the service every minute. It would consume most of the monthly free instance hours and defeat sleeping.
- Fallbacks if the Cloudflare spike fails: a GitHub Actions schedule (delays, drops and a 60-day inactivity disable are reported by secondary sources), or lazy and startup recovery only (reminders then depend on someone opening the app). These are alternatives for a decision and are not adopted silently.

## 10. Health and liveness

- **`GET /livez`** returns success without touching the database. It is the only endpoint a platform health check or pinger should use.
- **`GET /readyz`** runs a trivial database query. Its result is cached for at least 30 seconds and it is rate-limited. It is used by the admin health view, deployment verification and manual checks, not by frequent probes.
- The application runs no periodic database polling. Neon suspends compute after about five minutes without queries, and nothing may prevent that.
- The connection pool is small, with a short idle timeout so idle connections close. Connection errors after a suspend are retried once. Whether Neon's pooled connection string and these settings let compute suspend as intended is to be observed in the first spike.
- The admin health view reads on demand: component readiness, last tick per job, candidates without results, outbox counts by status, expired and failed reminders, recovery labels. It shows no broker depth, since no broker exists.

## 11. Security

- **Ownership checks:** every query is filtered by the session user or provider through central policy functions. Customers cannot read another customer's records. Providers cannot read another provider's records.
- **Disabled-provider permissions** (`BUSINESS_RULES.md` 13) live in one policy module and have tests.
- **Role assignment:** signup can create only a customer or a provider applicant. Admin is created by a seed script, never through the API. Provider approval is admin-only.
- **Sessions:** 256-bit random tokens, only the hash stored, httpOnly, Secure, SameSite=Lax. Logout deletes the row. CSRF protection: Origin check and JSON-only content type on state-changing requests.
- **Validation:** Zod schemas on every endpoint.
- **Secrets:** host environment variables. `.env` is gitignored and secret scanning is enabled.
- **Rate limiting:** per IP and per email on login and signup. In-memory limits reset when the free host sleeps, so a database-backed lockout counter backs them up.
- **Tick endpoint:** bearer secret compared in constant time, no user session, minimal response, safe to replay because jobs are idempotent. The secret is stored as a Cloudflare secret.
- **Privacy:** providers never see customer email, phone or balances. Logs exclude personal data. No card data is stored.

## 12. Hosting feasibility

Checked on 14 Nov 2026 against official or vendor pages, unless marked. Everything is **provisional** until the spikes in `BACKLOG.md` demonstrate it.

### 12.1 Documented facts

| Service | Facts | Status |
|---|---|---|
| Render free web service | Spins down after 15 minutes without inbound traffic and takes about one minute to wake. 750 free instance hours per month, with spun-down time not counted. May restart at any time. Ephemeral filesystem. Outbound ports 25, 465 and 587 are blocked, so SMTP is unusable and an HTTPS email API is required. Service-initiated traffic (external database or API calls) can trigger suspension only at "uncommonly high" volumes. Background workers and cron jobs are not available on the free instance type. Free Postgres expires after 30 days and is not used. Static sites are free | Documented |
| Render signup | Whether a payment card is required at signup is not stated in the docs read. The docs describe free services working without a payment method | UNVERIFIED |
| Neon free plan | No time limit and no credit card required, per Neon. 100 CU-hours per project per month. Compute scales to zero after 5 minutes of inactivity and wakes in a few hundred milliseconds. Storage of 1 GB per project per the changelog of 2 Oct 2026 (some pages still show 0.5 GB). 10 branches per project | Documented (vendor pages) |
| Cloudflare Workers free | Five Cron Triggers per account. Cron runs in UTC. CPU time per cron trigger is 10 ms on the free plan, and waiting on a fetch does not count as CPU time. One-minute granularity and a few seconds of jitter come from secondary sources only | Partly documented. Card requirement UNVERIFIED |
| Vercel Hobby cron | Once per day with up to a 59 minute window. Unusable for 22:00 and 23:00 | Documented, not used |
| GitHub Actions schedule | Secondary sources quoting GitHub: five minute minimum interval, delays or drops under load, disabled after 60 days without repository activity. Official page not opened | UNVERIFIED, fallback only |
| Resend free | 100 emails per day and 3,000 per month, each recipient counted separately. The test sender can deliver only to your own account address. Sending to others needs a verified domain, which is not ₹0 | Documented, not selected |
| Brevo free | 300 emails per day. Sending to arbitrary recipients from one verified sender address without a domain is reported by secondary sources only. Deliverability from a free-mail sender address is unknown | UNVERIFIED |

### 12.2 Provisional feasibility of the complete ₹0 deployment

The combination Render + Neon + Cloudflare cron + Brevo is **provisionally feasible, not proven**. Three things need real verification:

1. Account creation on Render and Cloudflare without a card, and Neon free-plan behaviour with the real connection settings.
2. Cron-to-app behaviour: how long the cron-triggered request takes against a sleeping Render service, whether the retry is needed, and the actual timing over several days.
3. Real recipient email delivery through Brevo, including spam placement.

If a spike fails, the project stops and presents alternatives for a decision. Email is not replaced by simulation silently.

### 12.3 Sources (checked 14 Nov 2026)

- https://render.com/docs/free
- https://neon.com/faqs/free-plan-limits-and-quotas
- https://neon.com/docs/changelog/2026-10-02
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing
- https://resend.com/docs/knowledge-base/account-quotas-and-limits
- https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
- https://www.brevo.com/products/transactional-email/

## 13. Testing strategy

- Unit tests with the fake clock for every deadline boundary (18:00:00, 22:00, 23:00:00, 10:00:00, 13:00:00, 00:00:00 on D+2).
- Integration tests on a real Postgres test branch for ledger ordering, unique constraints and the service-result finality constraint.
- Concurrency tests: parallel purchases, duplicate cutoff runs, skip racing with cutoff, disable racing with a status update, report racing with disable.
- Recovery tests: before and after 10:00, straddle, two missed days, delayed disable replay.
- Outbox tests with a fake sender: lease expiry, sender crash, expiry of reminders, retry bounds, stale claim token.
- Health tests: `/livez` makes no database call. `/readyz` is cached.
- A few Playwright smoke tests for the core customer and provider paths.
- Authorization tests for every role and for the disabled-provider matrix.

## 14. Deployment

- One Render web service built from GitHub. The environment holds the database URL, session secret, tick secret and email API key.
- A Cloudflare Worker with five cron triggers and its own secret.
- Migrations use a direct (non-pooled) Neon connection. The application uses the pooled connection string if the first spike confirms it works as intended.
- The demo banner is visible on every page. Seed data is created by a script. The live cutoff is demonstrated at its real time, since there is no production clock override.

## 15. Known architecture limitations

- First request after idle takes about a minute.
- Cron ticks may arrive late. Correctness does not depend on them, but reminders may be late or expire.
- A single free instance can restart at any time. In-flight outbox claims recover through lease expiry.
- Email can be delayed, duplicated, filtered or undelivered.
- In-memory rate limits reset on sleep.
- Free-tier terms can change. Re-check before the demo.
