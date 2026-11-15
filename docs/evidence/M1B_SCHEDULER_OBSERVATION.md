# QuickBite Milestone M1B: 3-Day Multi-Day Scheduler & Neon Suspension Observation Log

**Target Monolith**: `https://quickbite-2q20.onrender.com`  
**Target Scheduler**: Cloudflare Worker `quickbite-scheduler` (`https://quickbite-scheduler.bhaumik-quickbite.workers.dev`)  
**Deployment Version**: `dc1e806c-9c6b-41fe-b67c-031965e80550` (Deployed 2026-11-15 20:23:38 IST)  
**Database**: Neon Serverless PostgreSQL (`aws-us-east-2`)  
**Objective**: Record real automated scheduled cron ticks over 3 consecutive calendar days, verify receipts in `scheduler_runs`, measure dispatch-to-receipt elapsed latency, and observe Neon compute scale-to-zero suspension during idle intervals.

---

## 1. Observation Protocol & Attribution Guidelines

1. **Distinguish Trigger Sources**:
   - `trigger_source = 'cron'`: Automated background ticks triggered by Cloudflare Worker cron events.
   - `trigger_source = 'manual'`: Smoke tests or deployment verification checks manually executed via curl or script.
   Only `cron` events count toward multi-day scheduler verification.

2. **Latency vs. Cold-Start Attribution**:
   - Total elapsed latency = `executed_at` minus `scheduled_for`.
   - **Attribution Rule**: Total latency includes Cloudflare cron scheduling jitter, network transit, Render container wake-up (if asleep), and PostgreSQL query execution.
   - **Do NOT label total elapsed latency as "measured cold-start duration"** unless server-side response headers or platform container logs explicitly isolate and substantiate the cold-start phase.

3. **Neon Compute Scale-to-Zero Observation**:
   - Between the 23:10 IST cutoff retry and the 09:00 IST recovery tick (an idle window of ~9 hours 50 minutes), no automated requests or database queries should occur.
   - Check the Neon Console under **Monitoring -> Compute Hours** or **Active Compute Units** to confirm compute suspension during this interval.
   - Verify that the 09:00 IST recovery tick successfully wakes the database without a timeout error.

---

## 2. Evidence Collection Procedures

### A. Live Worker Log Streaming (Cloudflare)
To observe scheduled trigger execution in real time as Cloudflare fires cron events:
```powershell
npx wrangler tail --config worker/wrangler.jsonc
```
*(Displays structured execution logs, invocation timestamp, attempt count, and outbound dispatch outcome).*

### B. Database Receipt Inspection (Neon PostgreSQL)
To inspect captured receipts directly from the Neon database without printing secrets or connection strings:

```bash
# Query recent scheduler runs safely from workspace root using node/pg
node -e "
import('dotenv').then(d => d.config());
import('pg').then(async ({ Pool }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
  const res = await pool.query(\`
    SELECT id, job_name, scheduled_for, executed_at,
           ROUND(EXTRACT(EPOCH FROM (executed_at - scheduled_for))::numeric, 2) AS latency_seconds,
           status, trigger_source, details
    FROM scheduler_runs
    ORDER BY scheduled_for DESC
    LIMIT 20;
  \`);
  console.table(res.rows);
  await pool.end();
});
"
```

---

## 3. Pre-Cron Manual Test Baseline (Deployment Smoke Test)

| ID | Job Name | Scheduled For (UTC) | Executed At (UTC) | Latency (s) | Status | Duplicate | Source | Notes |
| :-: | :--- | :--- | :--- | :-: | :---: | :---: | :---: | :--- |
| `3` | `cutoff` | 2026-11-15 14:15:00 | 2026-11-15 14:15:09 | 9.0s | `recorded` | `false` | `manual` | Initial smoke test during Render deployment verification |
| `3` | `cutoff` | 2026-11-15 14:15:00 | 2026-11-15 14:15:09 | 9.0s | `recorded` | `true` | `manual` | Idempotency test (same receipt returned on duplicate call) |

*Note: These entries represent manual smoke verification and do not count as automated cron evidence.*

---

## 4. 3-Day Automated Scheduled Run Observations

**Next Immediate Scheduled Tick**: Day 1 — **22:00 IST (16:30 UTC)** on **15 Nov 2026** (`reminder`).

### Day 1: 15–16 Nov 2026
| Schedule (IST) | Job Name | Cron Expression (UTC) | Scheduled (UTC) | Executed (UTC) | Latency (s) | Status | Attempts | Observed Neon State |
| :---: | :--- | :--- | :--- | :--- | :-: | :---: | :-: | :--- |
| 22:00 | `reminder` | `30 16 * * *` | 2026-11-15 16:30:00 | *Pending 22:00 IST* | — | PENDING | — | Pending observation |
| 23:00 | `cutoff` | `30 17 * * *` | 2026-11-15 17:30:00 | *Pending 23:00 IST* | — | PENDING | — | Pending observation |
| 23:10 | `cutoff_retry` | `40 17 * * *` | 2026-11-15 17:40:00 | *Pending 23:10 IST* | — | PENDING | — | Pending observation |
| 09:00 | `recovery` | `30 3 * * *` | 2026-11-16 03:30:00 | *Pending 09:00 IST* | — | PENDING | — | Check idle suspension (23:10–09:00) |
| 09:50 | `recovery_retry` | `20 4 * * *` | 2026-11-16 04:20:00 | *Pending 09:50 IST* | — | PENDING | — | Pending observation |

### Day 2: 16–17 Nov 2026
| Schedule (IST) | Job Name | Cron Expression (UTC) | Scheduled (UTC) | Executed (UTC) | Latency (s) | Status | Attempts | Observed Neon State |
| :---: | :--- | :--- | :--- | :--- | :-: | :---: | :-: | :--- |
| 22:00 | `reminder` | `30 16 * * *` | 2026-11-16 16:30:00 | *Pending* | — | PENDING | — | Pending observation |
| 23:00 | `cutoff` | `30 17 * * *` | 2026-11-16 17:30:00 | *Pending* | — | PENDING | — | Pending observation |
| 23:10 | `cutoff_retry` | `40 17 * * *` | 2026-11-16 17:40:00 | *Pending* | — | PENDING | — | Pending observation |
| 09:00 | `recovery` | `30 3 * * *` | 2026-11-17 03:30:00 | *Pending* | — | PENDING | — | Check idle suspension |
| 09:50 | `recovery_retry` | `20 4 * * *` | 2026-11-17 04:20:00 | *Pending* | — | PENDING | — | Pending observation |

### Day 3: 17–18 Nov 2026
| Schedule (IST) | Job Name | Cron Expression (UTC) | Scheduled (UTC) | Executed (UTC) | Latency (s) | Status | Attempts | Observed Neon State |
| :---: | :--- | :--- | :--- | :--- | :-: | :---: | :-: | :--- |
| 22:00 | `reminder` | `30 16 * * *` | 2026-11-17 16:30:00 | *Pending* | — | PENDING | — | Pending observation |
| 23:00 | `cutoff` | `30 17 * * *` | 2026-11-17 17:30:00 | *Pending* | — | PENDING | — | Pending observation |
| 23:10 | `cutoff_retry` | `40 17 * * *` | 2026-11-17 17:40:00 | *Pending* | — | PENDING | — | Pending observation |
| 09:00 | `recovery` | `30 3 * * *` | 2026-11-18 03:30:00 | *Pending* | — | PENDING | — | Check idle suspension |
| 09:50 | `recovery_retry` | `20 4 * * *` | 2026-11-18 04:20:00 | *Pending* | — | PENDING | — | Pending observation |

---

## 5. Summary of Current Progress

- **Scheduler Deployment Status**: **DEPLOYED TO CLOUDFLARE WORKERS FREE**.
- **Automated Observation Status**: **AWAITING SCHEDULED CRON EXECUTIONS (DAY 1 BEGINS 22:00 IST)**.
- **Evidence Integrity Policy**: No future rows or simulated cron executions are fabricated. Real data will be populated as ticks execute over the 3 consecutive days following Cloudflare Worker deployment.

