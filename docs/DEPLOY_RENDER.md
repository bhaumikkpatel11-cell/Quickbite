# QuickBite: Render Deployment Guide

Authoritative deployment instructions for the QuickBite Express modular monolith on the Render Free Tier.

---

## 1. Service Specifications

- **Service Type**: Web Service
- **Environment / Runtime**: `Node`
- **Region**: Closest to Neon database (e.g. `Ohio (US East)` for Neon `aws-us-east-2`)
- **Branch**: `master` (or main production branch)
- **Root Directory**: `.` (leave blank / repository root)
- **Build Command**:
  ```bash
  npm ci --include=dev && npm run build
  ```
- **Start Command**:
  ```bash
  npm start
  ```
- **Instance Type**: `Free` ($0/month)
- **Health Check Path**: `/livez`

> [!IMPORTANT]
> The health check path must be configured strictly to `/livez`.
> `/livez` responds with HTTP 200 without touching PostgreSQL.
> Never set the health check path to `/readyz` or `/`, as periodic platform health pings would wake up Neon serverless compute and exhaust the monthly free quota.

---

## 2. Environment Variables

Configure the following environment variables in the Render Dashboard under **Environment**:

| Variable Name | Required Value / Source | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations and SPA static asset serving. |
| `DATABASE_URL` | Copied from Neon application branch | Pooled PostgreSQL connection string (`-pooler` suffix) with SSL enabled. |
| `TICK_SECRET` | 64-character bearer token | Shared cryptographic secret used to authenticate Cloudflare Worker cron ticks. |

### Security & Isolation Guardrails
- **Do NOT configure `TEST_DATABASE_URL`** on Render. The production service must never connect to the test database.
- **Do NOT configure secrets in frontend variables** (variables prefixed with `VITE_`). The React frontend is a static bundle served to browsers; client bundles must never contain `DATABASE_URL` or `TICK_SECRET`.
- The application database schema migration (`001_create_scheduler_runs.sql`) has already been applied to Neon. Render does not need to run migrations during build or startup.

---

## 3. Deployment Steps

1. In the [Render Dashboard](https://dashboard.render.com/), click **New +** -> **Web Service**.
2. Connect your GitHub repository: `https://github.com/<owner>/QuickBite`.
3. Fill in the service details:
   - **Name**: `quickbite-server` (or chosen name)
   - **Root Directory**: leave empty (defaults to repo root)
   - **Runtime**: `Node`
   - **Build Command**: `npm ci --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
4. Expand **Advanced Settings**:
   - Set **Health Check Path** to `/livez`.
5. Add the environment variables:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: `<your-neon-app-connection-string>`
   - `TICK_SECRET`: `<your-tick-secret>`
6. Click **Create Web Service**.
7. Once deployed, verify:
   - `https://<your-render-app>.onrender.com/livez` returns HTTP 200 `{ status: "ok" }`.
   - `https://<your-render-app>.onrender.com/` loads the QuickBite React SPA with the Demo Mode banner.
   - `https://<your-render-app>.onrender.com/readyz` returns HTTP 200 `{ status: "ready" }`.
