# QuickBite Milestone Review & Packaging Process

This document defines the repeatable procedure for generating sanitized review packages for project review and submission.

---

## 1. Overview
At the completion of each milestone, a structured review package must be created and placed into `review-packages/`. The archive contains the milestone reports, source code, tests, configuration, and documentation, with all credentials, environment secrets, and build caches strictly excluded.

---

## 2. Review Artifacts Structure
Each milestone produces four structured markdown reports under `docs/reviews/<milestone>/`:

1. **`REPORT.md`**: Milestone objective, implemented behavior, files created or changed, known defects, and pending external decisions.
2. **`VERIFICATION.md`**: Environment versions, exact verification commands, exit codes, test counts by suite, and an explicit record of checks not run.
3. **`FILE_MANIFEST.md`**: Repository branch, HEAD commit, uncommitted status, excluded categories, and SHA-256 checksums of every included file.
4. **`NEXT_STEPS.md`**: Current blockers, next milestone scope, required configuration, acceptance criteria, and specific items highlighted for instructor review.

---

## 3. Repeatable Packaging Script
The packaging process is automated via `scripts/package-review.mjs`.

### How to Run
From the repository root:

```powershell
# Package Milestone M1A (default)
node scripts/package-review.mjs M1A

# Package with a version tag (e.g. v2)
node scripts/package-review.mjs M1A v2
# Produces: review-packages/QuickBite_M1A_Review_v2.zip

# Or for any future milestone
node scripts/package-review.mjs M1B
```

### Script Guardrails
- **Preflight Verification**: Fails with an exit code of `1` if any required report (`REPORT.md`, `VERIFICATION.md`, `NEXT_STEPS.md`) is missing.
- **Explicit Inclusions**: Uses a strict whitelist including source code, SQL migrations, test files, configs, and documentation.
- **Secret Scanning**: Scans every file for private keys, actual database passwords, or auth tokens before archiving.
- **Strict Exclusions**: Automatically excludes `.git/`, `.env*` (except `.env.example`), `node_modules/`, `dist/`, `build/`, `coverage/`, and all `.log` files.
- **Automated Manifest**: Computes cryptographic SHA-256 hashes for all packaged files and writes them directly into `FILE_MANIFEST.md`.
- **Sanitized ZIP Output**: Produces `review-packages/QuickBite_<milestone>_Review.zip`.

---

## 4. Verification of the Review Archive
Before submitting the ZIP to the instructor:

1. **Verify Archive Size & Integrity**:
   ```powershell
   Get-Item review-packages/QuickBite_M1A_Review.zip | Select-Object FullName, Length
   ```

2. **Inspect Contents**:
   ```powershell
   tar -tf review-packages/QuickBite_M1A_Review.zip
   ```

3. **Verify No Sensitive Files**:
   Confirm that no `.env`, `.git/`, or `node_modules/` directories are present inside the archive.
