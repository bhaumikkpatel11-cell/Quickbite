# QuickBite Milestone M1B File Manifest

## Repository State
- **Branch**: `master`
- **HEAD Commit**: `no commits yet`
- **Working Tree State**: Working tree contains uncommitted/untracked files
- **Reviewed Snapshot**: Local working tree snapshot for milestone M1B

---

## Excluded Categories
The following categories are strictly excluded from this review package:
- Git internal version control directory (`.git/`)
- Real credentials and environment files (`.env`, `.env.*`, excluding `.env.example`)
- API tokens, passwords, database credentials, and private keys
- Dependency folders (`node_modules/`, `.pnpm-store/`)
- Build and compilation output (`dist/`, `build/`, `out/`)
- Test coverage artifacts (`coverage/`, `playwright-report/`)
- Review package archives and previous ZIP files (`review-packages/`, `*.zip`)
- Tool logs and agent runtime scratch (`*.log`, `.system_generated/`, `tmp/`)

---

## Security Scanner Notice (R8)
Every included file has been inspected line-by-line for private keys, sensitive database connection strings, and credential tokens. Note: Automated regex scanning reduces risk but cannot guarantee detection of all credential patterns; manual review of staged files remains mandatory.

---

## Included Source and Configuration Files (56 files indexed)

*Note: This manifest lists all 56 packaged source, test, config, and report files. In accordance with R8, the manifest itself is omitted from self-indexing to maintain cryptographic integrity.*

| File Path | Size (Bytes) | SHA-256 Checksum |
| :--- | :---: | :--- |
| `.agents/skills/frontend-design/LICENSE.txt` | 10351 | `eb3d7b5485466acbd81f2b496f595ab637d2792e268206b27d99e793bdb67549` |
| `.agents/skills/frontend-design/SKILL.md` | 9461 | `b8009ae690dfa69edc7f08bb8715f32db8817112cfa4388741dbaf876c237df8` |
| `.env.example` | 848 | `5e130fc299f90f5057909383d92dff95b417494f661b841e3cfd575af7292a4c` |
| `.gitignore` | 688 | `6c3fcf4584fcbd00a6b516f345b442968f1abaf91668d0b632ce04cbc213b220` |
| `AGENTS.md` | 2009 | `24e312332de1b460d132a910a8bc3f3d0dd637ab47f5d6f370d33b6dcb1ae8bb` |
| `GEMINI.md` | 700 | `f6ca9be1dcc90a22b0a79b717f23666b2c1fcf00f40f2aaa5aa9d5887fc3811d` |
| `docs/ARCHITECTURE.md` | 24819 | `f603b41d34f4d64f66709f4067670acf5c03a914b3f5e6a059700645c0b8bbd6` |
| `docs/BACKLOG.md` | 12092 | `c4d1a5a1b919f0e0088c1e179519a5090c85e1c713b192dfcb39636d62c47003` |
| `docs/BUSINESS_RULES.md` | 31223 | `7c58c9659c5f4873a938cae9dcab5d7b682f641130bc98b4da7881bf80469617` |
| `docs/HANDOFF.md` | 16467 | `634f2e99bf16a52c9c2980e1a526b41943799aaea669d0d4c1fc40e895044695` |
| `docs/PROJECT.md` | 4064 | `542386462b51ae0d289157ef9769c480b532ae1536ced41c772b62fe3bf699f7` |
| `docs/REVIEW_PROCESS.md` | 2943 | `d284d58658207c1010445e59c048728596ffd0812a5f1a7538c5071c2c8c02de` |
| `docs/evidence/M1B_DATABASE.md` | 10542 | `5c7ce9ad246bfa7dea0cff8348b035024f0825a08019a8cad343963adcc14cc2` |
| `docs/reviews/M1A/INSTRUCTOR_REVIEW.md` | 5200 | `7b3c14ee1211a21648d0898f903491cfafba7c039a23d7d837f38ff4a33232ab` |
| `docs/reviews/M1A/INSTRUCTOR_REVIEW_V2.md` | 6420 | `afa0fb42844882e6f8c46ebb92caacb341829f87af26e3d7c5f8289300eaeec9` |
| `docs/reviews/M1A/NEXT_STEPS.md` | 4111 | `8d105a08d34c536b6bff3e7a306d69ef696ab2e5ac348ddb6d4df79a57d76ae0` |
| `docs/reviews/M1A/REPAIR_PROGRESS.md` | 14663 | `88d1a84e1367ee94b83b713bfa2663d8b4cc0103ceb6e80c9d7a8f4675d494f5` |
| `docs/reviews/M1A/REPORT.md` | 9914 | `7ebb54e89cd846a1ba4dfa2c0c093413efcc5a7843d0507248136498a8d09cf0` |
| `docs/reviews/M1A/VERIFICATION.md` | 16993 | `cd79ef6e28a3047e96ed921f662b6d3c15ba2e0d835a830acea3bab1cc6f9a56` |
| `docs/reviews/M1B/NEXT_STEPS.md` | 2835 | `9c5e812192721acd0922a2ec16c5a5e787013dd9f7e364e2cad4a0ae7be3bcfb` |
| `docs/reviews/M1B/REPORT.md` | 5234 | `f9051ccb2877a5a5711607e584d86eda22690ebb6251ed6339537df8aa511030` |
| `docs/reviews/M1B/VERIFICATION.md` | 3950 | `fc265b32849f7742a8c8cf7eabdbe9ddf0189b556f64c7835ecea1b675f44887` |
| `package-lock.json` | 175883 | `be1d7c4002bd4031c36204a0d07e65cd46cbd03e09a28bbd0ff1746ff6159a74` |
| `package.json` | 932 | `1c922835e5f821b6ef9ebf761227c7453f3f5a627902891e45af091b4ec5fea5` |
| `scripts/package-review.mjs` | 14272 | `99e0fc5d9c1e15e4a28b5028a55bd552b5e3a544cf91d897cd0fd60660218123` |
| `server/migrations/001_create_scheduler_runs.sql` | 857 | `fc4ff7b2a70a9f58415d86c85ab18341de33c8c2ece8defff0a837208e85bd78` |
| `server/package.json` | 706 | `8a5fe2d64c61769e81c75e8226e984c564c8346be4d17584d647472c4e29ef45` |
| `server/src/app.ts` | 2262 | `776f474696da1fa093053e6b78a150fda6d503811da26cdbeb7201c780ada4bc` |
| `server/src/config.ts` | 3870 | `1d5fbbb3339a93cdfdecf7fefde2430b7596e075ab130afd31a47bc6b4cc0086` |
| `server/src/db/migrate.ts` | 2386 | `f530d8d83ff2449939e76352ab7b27e95825d58bf05cba547173a37001d00c30` |
| `server/src/db/pool.ts` | 3423 | `5c48c3ab714e94b4c652d2b1f39164424805607a4ef6012f974a5f0a3893603a` |
| `server/src/index.ts` | 513 | `8d82856ca5b7214dae5cc34c3e6dde37bcf02690358a78d28a6e6a8044d72a02` |
| `server/src/middleware/auth.ts` | 2114 | `febdee4545590bd8631cec1b9fdab03cceef1ccaa97fad3b482b6a299f1e0177` |
| `server/src/middleware/spa.ts` | 2961 | `19577cc396fafb3f822306fbcc91912f62bed645cf22b7c80f97230325a5c304` |
| `server/src/routes/health.ts` | 3922 | `e294a83098932c562db1bc991a51201a5d50fc791a2778f77daa3dcfc0ad50a0` |
| `server/src/routes/tick.ts` | 3483 | `f4b0b062d028e7a8e7b7b9f07c4e5996d2831b8f228cb76d887bf2146e6ec175` |
| `server/tests/config.test.ts` | 3127 | `cd07b1e099786d21aa8abb0c4c0e07be29478777f76ff1108d4383d591eb9cda` |
| `server/tests/db.integration.test.ts` | 9133 | `fe220c3ed184b61571ecda6ad030cb149355c6f35c7b2e38b26ddfec540bc34a` |
| `server/tests/health.test.ts` | 8108 | `87a65b995f92ba4d26a0274b28731d1de5ab6188444536b7be451f3217d27683` |
| `server/tests/spa.test.ts` | 4100 | `5bc697a3fdc313060a28ea9035e67ff15be2780c41d941b48fb9d3b32f8618cb` |
| `server/tests/tick.test.ts` | 6610 | `d879afeb54962ea44be02f8d99859625cebf5ba6656e90eb0febaa23bbfdfd2e` |
| `server/tsconfig.json` | 360 | `ee7e74580b7ec508813bbb0bc0d4626f945006f94897a5045155d9d6dfd2ae4d` |
| `skills-lock.json` | 308 | `5b9d23d8937d1857f941b7b52ea846e9153ff356b71c932c3c652318c0b90c86` |
| `web/index.html` | 560 | `564ae0d5113f3158349834434ddacf1ea4f3487b84b4d8916b64cf7300662de6` |
| `web/package.json` | 455 | `43a651966d0e523858b070fe2bb4a0adb89e683403a3d8c8ec188c8b6e343b46` |
| `web/src/App.css` | 2671 | `c40f5634ac666240ade71fdc692870cecd544152259d142cb7eccf0677e7a111` |
| `web/src/App.tsx` | 3619 | `acb984040af18e44984805065222e1e41e102c60c7b743eb7ce0f9415b9bc77f` |
| `web/src/main.tsx` | 231 | `d9071664010b2a3fe74fcfe71565773a290357e1451f72116a95d4c360322365` |
| `web/tsconfig.json` | 509 | `43797bbc3258d9363a3a76a7d93abebcff0e84f42687fe5376f9e1a1f84af356` |
| `web/tsconfig.node.json` | 213 | `9e2abb169ea87b7190613a1d4da57ca608463a453bd4231fa3aeee5e308370dd` |
| `web/vite.config.ts` | 370 | `e1b5206545bc69bc4e1f69a4e0192b6e35ee2022328255f4aadefbfaeae2c88a` |
| `worker/package.json` | 302 | `c1fbe4edf4c9312848e233bc3e692fed1d9615e91e153f5693bfd3c779067b85` |
| `worker/src/index.ts` | 12832 | `4eab645fb387b771e23498576e7169a7eb395a10f1ddc52d8fe8f2a8b34b73ab` |
| `worker/tests/worker.test.ts` | 19676 | `8005272eb1b3017bfc6b8190d7a241c69ea71ee703313b7a6ee9762199933621` |
| `worker/tsconfig.json` | 287 | `490b9da6bc8fcff22e384d285b878bc1ae3bb849fe833eaff5021e6a07a58a40` |
| `worker/wrangler.jsonc` | 506 | `a27d8b259ff209da9dc2849fb8b82e31e436fb18d5b4ef8fec365d5ca256078d` |
