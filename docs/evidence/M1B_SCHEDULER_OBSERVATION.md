# QuickBite Milestone M1B: 3-Day Multi-Day Scheduler & Neon Suspension Observation Log

**Target Monolith**: `https://quickbite-2q20.onrender.com`  
**Target Scheduler**: Cloudflare Worker `quickbite-scheduler`  
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

## 2. Evidence Collection Query Procedure

To inspect captured receipts directly from the Neon database without printing secrets or connection strings:

```bash
# Query recent scheduler runs safely from workspace root using tsx/pg
node -e "
import('dotenv').then(d => d.config());
import('pg').then(async ({ Pool }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
  const res = await pool.query(\`
    SELECT id, job_name, scheduled_for, executed_at,
           EXTRACT(EPOCH FROM (executed_at - scheduled_for)) AS latency_seconds,
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

## 4. 3-Day Automated Scheduled Run Observations (Pending)

### Day 1: [Date Pending Deployment]
| Schedule (IST) | Job Name | Cron Expression (UTC) | Scheduled (UTC) | Executed (UTC) | Latency (s) | Status | Attempts | Observed Neon State |
| :---: | :--- | :--- | :--- | :--- | :-: | :---: | :-: | :--- |
| 22:00 | `reminder` | `30 16 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |
| 23:00 | `cutoff` | `30 17 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |
| 23:10 | `cutoff_retry` | `40 17 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |
| 09:00 | `recovery` | `30 3 * * *` | *Pending* | *Pending* | — | PENDING | — | Compute wake check pending |
| 09:50 | `recovery_retry` | `20 4 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |

### Day 2: [Date Pending Deployment]
| Schedule (IST) | Job Name | Cron Expression (UTC) | Scheduled (UTC) | Executed (UTC) | Latency (s) | Status | Attempts | Observed Neon State |
| :---: | :--- | :--- | :--- | :--- | :-: | :---: | :-: | :--- |
| 22:00 | `reminder` | `30 16 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |
| 23:00 | `cutoff` | `30 17 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |
| 23:10 | `cutoff_retry` | `40 17 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |
| 09:00 | `recovery` | `30 3 * * *` | *Pending* | *Pending* | — | PENDING | — | Compute wake check pending |
| 09:50 | `recovery_retry` | `20 4 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |

### Day 3: [Date Pending Deployment]
| Schedule (IST) | Job Name | Cron Expression (UTC) | Scheduled (UTC) | Executed (UTC) | Latency (s) | Status | Attempts | Observed Neon State |
| :---: | :--- | :--- | :--- | :--- | :-: | :---: | :-: | :--- |
| 22:00 | `reminder` | `30 16 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |
| 23:00 | `cutoff` | `30 17 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |
| 23:10 | `cutoff_retry` | `40 17 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |
| 09:00 | `recovery` | `30 3 * * *` | *Pending* | *Pending* | — | PENDING | — | Compute wake check pending |
| 09:50 | `recovery_retry` | `20 4 * * *` | *Pending* | *Pending* | — | PENDING | — | Pending observation |

---

## 5. Summary of Current Progress

- **Automated Observation Status**: **PENDING CLOUDFLARE DEPLOYMENT**.
- **Evidence Integrity Policy**: No future rows or simulated cron executions are fabricated. Real data will be populated as ticks execute over the 3 consecutive days following Cloudflare Worker deployment.
