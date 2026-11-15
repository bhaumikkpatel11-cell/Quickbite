# QuickBite M1A v2 — review and focused repair task

Reviewed 15 November 2026 against QuickBite_M1A_Review_v2.zip.

## Outcome

Most earlier fixes are present. Do not run the current configuration tests on a workspace containing a valuable root .env: they overwrite and delete it. Complete the focused repairs below before connecting real credentials or deploying.

## Independent evidence

- Installed locked dependencies in an isolated review copy using npm ci --ignore-scripts.
- npm run typecheck: passed.
- npm run build: passed.
- npm test: 46 passed (32 server, 14 Worker); one skipped placeholder for the unconfigured PostgreSQL suite. Real PostgreSQL was not tested.
- All 51 indexed manifest hashes match the archive contents.
- Public Worker /trigger was removed. Root environment resolution, receipt validation, query timeouts, readiness deduplication and API error routing are improved.
- No live deployment, network TLS connection or browser rendering was verified.

## F1 — High: configuration tests destroy root .env

File: server/tests/config.test.ts.

The tests set tempRootEnv to the actual repository-root .env, overwrite it with writeFileSync, then unlink it in afterEach. The createdTempEnv flag does not check whether the file already existed.

Reproduction in the isolated review copy: created .env containing only REVIEW_ONLY_SENTINEL=must_survive_tests, ran npm test, and checked existence. All tests passed, but the sentinel file was deleted. No real credentials were used in this reproduction.

Required fix:
- Use an OS temporary directory and fake workspace fixture. Never write or delete the actual project .env during tests.
- Exercise root discovery using a temporary package.json with workspaces, and environment loading using the fixture path.
- Avoid falling back to the real working-directory .env in tests; make the loader path/fallback injectable or isolate execution in a child process.
- Restore environment/config state and clean only files owned by the test.
- Verify fixture discovery from source-like and compiled-like directories and environment-variable precedence.
- If the user's .env is already missing, explain that it may need restoration from their own secure source. Do not invent or print credentials.

## F2 — Medium: URL text inequality does not establish database isolation

File: server/tests/db.integration.test.ts.

The guard compares raw TEST_DATABASE_URL and DATABASE_URL strings. The same database can have different query parameters, credentials, or pooled/direct endpoint names. The suite still migrates and deletes fixed-date rows. Its comment that distinct URLs guarantee isolation is inaccurate.

Required fix:
- Prefer a uniquely named disposable schema for every test run, with both migrations and application queries explicitly scoped to it. Use a separately provisioned test database/branch when available.
- Alternatively, require a clearly documented dedicated test target with stronger identity safeguards; do not infer safety solely from URL inequality.
- Ensure cleanup can remove only test-owned data/schema, and closes both pools even if cleanup fails.
- Keep the real suite BLOCKED if the isolated target is not configured. Do not claim it has passed based on skip behavior.

## F3 — Medium: connection-string TLS settings override explicit options

File: server/src/db/pool.ts.

The helper returns ssl.rejectUnauthorized=true, but tests inspect only that helper object. pg parses the connection string afterwards.

Independent, offline verification instantiated pg.Client with the actual helper configuration and dummy remote URLs. Effective connectionParameters.ssl was:
- sslmode=require: {} (current installed driver behavior; not a demonstrated verification failure).
- sslmode=verify-full: {}.
- sslmode=no-verify: {rejectUnauthorized:false}.
- sslmode=disable: false.

Thus the claim that remote certificate verification is always enforced is not yet true. No real network connection was made.

Required fix:
- Parse the URL and explicitly reject insecure TLS settings for remote hosts, or normalize conflicting SSL parameters before applying a verified TLS configuration.
- Classify local versus remote using parsed hostname, not substring presence or NODE_ENV alone.
- Add tests inspecting effective pg.Client connection parameters, including disable/no-verify inputs, without connecting or logging credentials.
- Keep permitted local development behavior explicit.

## F4 — Medium: Worker configuration is present but not validated

File: worker/src/index.ts.

APP_URL is checked only for a nonempty value. TICK_TIMEOUT_MS uses unchecked parseInt. Invalid, negative, zero or huge values can undermine the intended request bound. An HTTP deployment URL could send the bearer secret without TLS.

Required fix:
- Validate APP_URL as an origin with no embedded credentials, query or fragment; require HTTPS except explicitly permitted localhost development.
- Validate TICK_TIMEOUT_MS as a finite positive integer in a documented bounded range compatible with the Worker invocation budget. Reject malformed/overflow inputs before dispatch.
- Test invalid settings cause zero outbound fetches and retain the valid 90-second default.
- Also validate parsed receipt JSON is a non-null object before accessing fields, so null/array responses fail cleanly as invalid receipts.

## Instructions for Antigravity

This is the complete follow-up checklist; no other attachment is required once this file is saved in the repository.

1. Save this review as docs/reviews/M1A/INSTRUCTOR_REVIEW_V2.md.
2. Fix F1 before rerunning the full suite. Inspect but do not display or modify any existing real .env.
3. Complete F1–F4 with focused tests; do not reopen product requirements, add business features or deploy.
4. Update REPAIR_PROGRESS.md, VERIFICATION.md and HANDOFF.md using current totals. Preserve historical counts only when clearly labelled historical. The existing progress file mixes 7, 14 and 25-test interim results with final results.
5. Run typecheck, build and applicable tests. Explicitly retain the PostgreSQL blocker until a safe real test target is configured.
6. Generate QuickBite_M1A_Review_v3.zip with this review, updated evidence and source. Verify hashes and inspect for secrets.
7. Return the ZIP path and concise evidence summary. Do not claim M1 complete before live database and scheduler validation.
