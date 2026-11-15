# QuickBite Development Instructions

These rules apply to all AI agents and sessions working in this repository.

## 1. Project Documents
Always read the project documentation before undertaking any work. The specifications are approved and authoritative; do not re-open requirements discovery:
- [docs/PROJECT.md](docs/PROJECT.md): Project overview, constraints, goals.
- [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) (v2.1): Authoritative product rules, state machine, credit ledger, cutoff, time calculations (IST / Asia/Kolkata).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Technical design, modular monolith, transactional outbox, schema, error handling, deployment.
- [docs/BACKLOG.md](docs/BACKLOG.md): Incremental milestones, scope, test expectations, acceptance criteria.
- [docs/HANDOFF.md](docs/HANDOFF.md): Source of truth for project status, implemented work, verified results, and the immediate next task.

## 2. Core Work Principles
- **One Milestone at a Time**: Work strictly on the current milestone as defined in `docs/BACKLOG.md` and `docs/HANDOFF.md`. Do not implement future features prematurely.
- **Spec Compliance**: Never invent requirements or bypass approved business rules. Refer to `docs/BUSINESS_RULES.md` for edge cases.
- **Verification First**: Verify all changes with automated tests and real evidence before declaring a milestone complete. Follow TDD and verification before completion.
- **Update HANDOFF.md & Review Packages**: At the completion of any milestone or session, update `docs/HANDOFF.md` with exact implemented work, verified results, resolved dependencies, and the immediate next task. After each milestone, update HANDOFF.md, generate current review reports and create a sanitized review ZIP using docs/REVIEW_PROCESS.md. Never mark unexecuted checks as passed.
- **Preserve Constraints**: Solo M.Tech project, ₹0 budget on free tiers, Asia/Kolkata timezone, Docker is not required for the MVP, server-enforced deadlines, transactional integrity.
