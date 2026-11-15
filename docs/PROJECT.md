# QuickBite: Project Overview

Status: design approved, nothing implemented or deployed.
Document set: `PROJECT.md` (this file), `BUSINESS_RULES.md` (v2.1, authoritative product behaviour), `ARCHITECTURE.md`, `BACKLOG.md`, `HANDOFF.md`.

## 1. Problem and purpose

Students on tiffin plans decide each day whether to eat based on the daily menu. Providers lack a reliable headcount before cooking, which causes overproduction and food waste.

QuickBite establishes a locked headcount before preparation, generates ingredient and portion totals, and tracks meal delivery.

It is also a portfolio project: an event-driven design that a solo M.Tech student can understand, explain in interviews and maintain.

## 2. Roles

- **Customer:** subscribes, views menus, selects which subscription supplies meals, skips or restores inclusion, tracks meals, rates Delivered meals and submits reports.
- **Provider:** creates plans, publishes menus, views headcounts and prep sheets, updates delivery status and responds to reports.
- **Admin:** approves or disables providers, views operational health and a read-only report list.

## 3. Constraints

- Solo M.Tech project. No hard deadline.
- Budget ₹0 on free tiers. A live demo is required.
- Responsive web application. No native mobile app.
- Open signup, mock payments and a visible demo banner. No real users yet.
- No AI functionality in the MVP.
- Business timezone: Asia/Kolkata. Slow startup after idle time is acceptable.
- The exact-time behaviour of the free-tier scheduler and real email delivery are not yet demonstrated (see `HANDOFF.md`).

## 4. Product summary

- Providers publish a menu per plan per service date by 18:00 the day before.
- Customers are included by default and may skip until the 23:00 cutoff the day before.
- A meal credit is consumed at cutoff for each Included meal. Skipped meals, days without a menu and meals not served consume nothing.
- A customer buys one subscription at a time, holds a selected subscription that supplies meals, and sees the remaining credits and an estimated end date.
- After cutoff the provider sees locked headcounts and a prep sheet. Delivery status moves Pending, Preparing, Dispatched, Delivered.
- Customers receive in-app notifications for each delivery change, plus a reminder. Email is sent for the reminder and the first Dispatched event, on a best-effort basis.
- Customers can rate a Delivered meal and report Missing or Poor quality meals.

Full rules are in `BUSINESS_RULES.md`.

## 5. Out of scope

GPS tracking, AI features, native apps, real payments and refunds, per-provider cutoffs, meal customization, SMS or WhatsApp, coupons, multi-city support, a separate delivery-person role, per-dish ratings, credit transfers, refunds or expiry, automatic fallback between subscriptions or providers, customer-chosen start dates, purchases while any balance is positive, and any production or public clock override.

## 6. Build priority

1. Provider approval, plans, menus and subscriptions.
2. Meal-credit accounting, selection, skip/undo, cutoff and recovery.
3. Locked headcounts, prep sheets and delivery.
4. Notifications, ratings and reports.
5. Expanded admin health view.

Basic authorization and operational logging apply throughout.

## 7. Technology (summary)

React + Vite + TypeScript. Node.js + Express + TypeScript with `pg` and Zod. PostgreSQL on Neon. Server sessions with secure cookies. Render free web service. Cloudflare cron for scheduling plus startup and request-triggered recovery. Brevo as the first email candidate. Details, alternatives and limitations are in `ARCHITECTURE.md`.

## 8. Portfolio goals

The project should demonstrate and be able to explain:

- A ledger-based accounting model with idempotent processing.
- Server-enforced deadlines independent of the scheduler.
- Transactional consistency, a consistent lock order and a transactional outbox.
- Honest handling of free-tier limits (sleep, scheduling jitter, email restrictions).
- Automated tests for concurrency, retries and deadline boundaries.
