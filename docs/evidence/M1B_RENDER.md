# QuickBite Milestone M1B: Render Deployment Verification Evidence

**Date & Time**: 2026-11-15 19:45:05 IST (UTC+05:30, Asia/Kolkata) / 2026-11-15 14:15:05 UTC  
**Deployment URL**: `https://quickbite-2q20.onrender.com`  
**Hosting Platform**: Render Free Web Service (Node runtime, `aws-us-east-2` paired region)  
**Database**: Neon Serverless PostgreSQL with connection pooling (`-pooler`)  
**Scope**: Render Deployment Verification (SPA root, JavaScript/CSS static assets, `/livez` liveness, `/readyz` cached database readiness, `/internal/tick` authorization guardrails, receipt recording, and duplicate idempotency)

---

## 1. Summary of Verification Results

| Check / Endpoint | Method | Headers / Auth | Expected Result | Actual Result | Status |
| :--- | :---: | :--- | :--- | :--- | :---: |
| `/` (SPA Root) | GET | None | 200 OK, HTML with `<div id="root">` | `200 OK` (654 bytes, `<div id="root">`, Demo banner) | **PASSED** |
| `/assets/index-X299OTM8.js` | GET | None | 200 OK, compiled JavaScript bundle | `200 OK` (146,761 bytes, `application/javascript`) | **PASSED** |
| `/assets/index-Dj4Y14mn.css` | GET | None | 200 OK, compiled CSS bundle | `200 OK` (2,227 bytes, `text/css`) | **PASSED** |
| `/livez` (Liveness) | GET | None | 200 OK, zero DB queries | `200 OK` (`{"status":"ok","uptime":428.11}`) | **PASSED** |
| `/readyz` (Probe 1 - Readiness) | GET | None | 200 OK, Neon DB ping | `200 OK` (`{"status":"ready","cached":false}`) | **PASSED** |
| `/readyz` (Probe 2 - Caching) | GET | None | 200 OK, 30s cache hit | `200 OK` (`{"status":"ready","cached":true}`) | **PASSED** |
| `/internal/tick` (No Auth) | POST | Missing Authorization | 401 Unauthorized | `401 Unauthorized` (`{"error":"Missing Authorization header"}`) | **PASSED** |
| `/internal/tick` (Invalid Auth) | POST | Invalid Bearer Token | 401 Unauthorized | `401 Unauthorized` (`{"error":"Invalid tick credentials"}`) | **PASSED** |
| `/internal/tick` (Valid Initial) | POST | Valid Bearer Token | 200 OK, `duplicate: false` | `200 OK` (`{"status":"recorded","receipt_id":3,"duplicate":false}`) | **PASSED** |
| `/internal/tick` (Valid Duplicate) | POST | Valid Bearer Token | 200 OK, `duplicate: true`, same ID | `200 OK` (`{"status":"recorded","receipt_id":3,"duplicate":true}`) | **PASSED** |

**Overall Status**: **ALL CHECKS PASSED**.

> [!IMPORTANT]
> **Scope Disclaimer**:
> This verification proves that the Express application is running on Render, serves the production React SPA, connects to Neon PostgreSQL with cached readiness, enforces timing-safe authentication on `/internal/tick`, and records idempotent tick receipts.
> This manual test **does NOT prove cron execution or scheduled background trigger reliability**. Verification of automated cron execution remains strictly blocked until Cloudflare Worker deployment and multi-day scheduler observation are completed.

---

## 2. Detailed Verification Evidence

### A. Frontend Root & Asset Delivery
The root URL `https://quickbite-2q20.onrender.com/` was fetched and parsed for HTML structure and linked static assets.

**1. Root HTML Response (`GET /`)**:
- **HTTP Status**: `200 OK`
- **Content-Type**: `text/html; charset=UTF-8`
- **Content-Length**: `654 bytes`
- **Structure Verified**:
  - `<!DOCTYPE html>`: Present
  - `<div id="root"></div>`: Present
  - Vite static bundle references discovered:
    - JavaScript: `/assets/index-X299OTM8.js`
    - Stylesheet: `/assets/index-Dj4Y14mn.css`

**2. Compiled JavaScript Asset (`GET /assets/index-X299OTM8.js`)**:
- **HTTP Status**: `200 OK`
- **Content-Type**: `application/javascript; charset=UTF-8`
- **Content-Length**: `146,761 bytes`
- **Integrity**: Non-empty production React/Vite bundle.

**3. Compiled CSS Asset (`GET /assets/index-Dj4Y14mn.css`)**:
- **HTTP Status**: `200 OK`
- **Content-Type**: `text/css; charset=UTF-8`
- **Content-Length**: `2,227 bytes`
- **Integrity**: Non-empty production stylesheet.

---

### B. Platform Health Endpoints

**1. Process Liveness (`GET /livez`)**:
- **HTTP Status**: `200 OK`
- **Content-Type**: `application/json; charset=utf-8`
- **Response Body**:
  ```json
  {
    "status": "ok",
    "uptime": 428.111979725
  }
  ```
- **Platform Health Check Compliance**:
  - The Render Web Service health check path is configured strictly to `/livez`.
  - `/livez` executes zero database queries, preventing Render platform pings from waking Neon serverless compute during idle intervals.

**2. Database Readiness & 30-Second Caching (`GET /readyz`)**:
- **Probe 1 (Initial / Potential Cache Miss)**:
  - **HTTP Status**: `200 OK`
  - **Content-Type**: `application/json; charset=utf-8`
  - **Response Body**:
    ```json
    {
      "status": "ready",
      "checked_at": "2026-11-15T14:15:07.279Z",
      "cached": false
    }
    ```
- **Probe 2 (Subsequent check 1 second later)**:
  - **HTTP Status**: `200 OK`
  - **Content-Type**: `application/json; charset=utf-8`
  - **Response Body**:
    ```json
    {
      "status": "ready",
      "checked_at": "2026-11-15T14:15:07.279Z",
      "cached": true
    }
    ```
  - **Verification**: The cached response returned identical `checked_at` timestamp with `cached: true`, proving that the 30-second TTL cache in `server/src/routes/health.ts` is operating properly in production and prevents connection thrashing against Neon compute.

---

### C. Scheduler Webhook Authentication Guardrails (`POST /internal/tick`)

**1. Rejection of Missing Authorization**:
- **Request**: `POST https://quickbite-2q20.onrender.com/internal/tick` (no `Authorization` header)
- **HTTP Status**: `401 Unauthorized`
- **Response Body**:
  ```json
  {
    "error": "Missing Authorization header"
  }
  ```

**2. Rejection of Invalid Authorization**:
- **Request**: `POST https://quickbite-2q20.onrender.com/internal/tick` (`Authorization: Bearer <invalid-sanitized-token>`)
- **HTTP Status**: `401 Unauthorized`
- **Response Body**:
  ```json
  {
    "error": "Invalid tick credentials"
  }
  ```
- **Security Check**: Timing-safe comparison via `crypto.timingSafeEqual` rejected the invalid bearer token immediately. No error stack traces or secrets were returned.

---

### D. Authenticated Tick Receipt Recording & Idempotency

**Documented Test Timestamp**: `2026-11-15T14:15:00.000Z`  
**Test Job Name**: `cutoff`  
**Request Payload**:
```json
{
  "job_name": "cutoff",
  "scheduled_for": "2026-11-15T14:15:00.000Z",
  "details": {
    "test_run": "m1b_render_verification",
    "verified_by": "solo_mtech_project_test",
    "note": "manual deploy smoke test"
  }
}
```

**1. Initial Delivery (`duplicate: false`)**:
- **Headers**: `Authorization: Bearer [REDACTED_TICK_SECRET]`, `Content-Type: application/json`
- **HTTP Status**: `200 OK`
- **Response Body**:
  ```json
  {
    "status": "recorded",
    "receipt_id": 3,
    "job_name": "cutoff",
    "scheduled_for": "2026-11-15T14:15:00.000Z",
    "duplicate": false,
    "message": "Tick receipt recorded successfully"
  }
  ```
- **Verification**: Database recorded a new row in `scheduler_runs` with status `'recorded'`, unique receipt ID `3`, and `duplicate: false`.

**2. Duplicate Identical Delivery (`duplicate: true`)**:
- **Headers**: `Authorization: Bearer [REDACTED_TICK_SECRET]`, `Content-Type: application/json`
- **HTTP Status**: `200 OK`
- **Response Body**:
  ```json
  {
    "status": "recorded",
    "receipt_id": 3,
    "job_name": "cutoff",
    "scheduled_for": "2026-11-15T14:15:00.000Z",
    "duplicate": true,
    "message": "Tick receipt already recorded (idempotent)"
  }
  ```
- **Verification**: Identical `receipt_id: 3` returned with `duplicate: true`. Confirmed database unique constraint `(job_name, scheduled_for)` safely handled duplicate delivery without duplicate rows, schema errors, or service disruption.

---

## 3. Pending Milestone M1 Items

With Render deployment verified, the remaining requirements for Milestone M1 completion are:
1. **Cloudflare Worker Deployment**: Deploy `quickbite-scheduler` Worker via Wrangler with the 5 cron schedules (`reminder`, `cutoff`, `cutoff_retry`, `recovery`, `recovery_retry`) and set `TICK_SECRET` secret in Cloudflare.
2. **Multi-Day Scheduled Tick Evidence**: Accumulate at least 3 consecutive days of automated scheduled ticks logged in `docs/evidence/` and observe Neon compute suspension during idle intervals.
