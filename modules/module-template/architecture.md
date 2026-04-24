# Architecture — {System or Module Name}

> **Audience:** Planner (Claude), Orchestrator, Auditor.
> **Constraint:** Keep this file under 400 tokens when processed by Context Builder.
> Extended details belong in `modules/{module-name}/architecture.md`, `modules/{module-name}/specs.md`, or `general/DESIGN.md` — never inline here.

---

## Domain Model

<!-- 1 paragraph. Name every core entity and its key relationships. No implementation detail. -->
<!-- Example: -->
<!-- The system manages **Projects**, each owning one or more **Modules**. A Module contains -->
<!-- **Tasks** tracked in the Beads ledger. Each Task has exactly one **Owner** (an agent) and -->
<!-- zero-or-more **Dependencies** on other Tasks. A **RCA Record** is produced whenever a Task -->
<!-- fails after exhausting all worker retries. -->

{Describe entities and relationships in one paragraph.}

---

## Data Flow — Happy Path

<!-- One numbered sequence covering the critical path only. -->
<!-- Full per-module flows live in modules/{module-name}/architecture.md. -->
<!-- Example (replace with real system flow): -->
<!-- 1. Planner reads context-slice.json + ARCHITECTURE.md → produces task-batch.json -->
<!-- 2. validate-task.sh rejects malformed tasks before they enter Beads -->
<!-- 3. Orchestrator pulls task via `bv --robot-next`, assigns to Primary Worker -->
<!-- 4. Worker writes code; Orchestrator runs test_plan commands -->
<!-- 5. On pass: `bd done` + commit. On fail ×2: reassign to Alt Worker -->
<!-- 6. On Alt Worker failure: RCA written; Planner escalated -->

1. {Step one}
2. {Step two}
3. {Step three}
<!-- Add steps as needed. Keep to the happy path. -->

---

## Invariants

<!-- Rules the system must NEVER violate. Auditor checks these at every audit cycle. -->
<!-- These are hard constraints — not guidelines. -->

- {INV-01} {State a rule that must always hold. E.g.: "Only the Pi harness writes to the codebase."}
- {INV-02} {E.g.: "No model name is hardcoded outside .pi/configs/models.config."}
- {INV-03} {E.g.: "AGENTS.md is append-only during Pi sessions; full rewrites are human-only."}
- {INV-04} {E.g.: "A Task may not enter the Beads ledger without passing validate-task.sh."}

---

## Constraints

<!-- Performance, security, and compatibility ceilings. -->
<!-- Specific per-module thresholds live in modules/{module-name}/architecture.md. -->
<!-- Examples: -->
<!-- - context-slice.json must not exceed 8 KB to stay inside worker context budgets -->
<!-- - All shell scripts must be POSIX-compatible or explicitly target Bash ≥ 5 -->
<!-- - No secrets committed to the repo; use environment variables or vault references -->

- {PERF} {E.g.: "Planning sessions must complete within the 5-hour Claude Pro usage window."}
- {SEC}  {E.g.: "API keys are never written to task files, AGENTS.md, or RCA records."}
- {COMPAT} {E.g.: "Scripts prefer Bun or plain bash; Node is avoided unless no alternative exists."}

---

## Naming Conventions

<!-- Short, unambiguous rules that the Auditor enforces during drift detection. -->

| Scope | Convention | Example |
|---|---|---|
| Task IDs | `{module-prefix}-{NNN}` | `auth-001` |
| RCA files | `rca-{YY-MM-DD_HH-MM}.md` | `rca-25-04-21_14-30.md` |
| Context slices | `context-slice.json` (gitignored) | — |
| Config variables | `SCREAMING_SNAKE_CASE` | `ORCHESTRATOR_MODEL` |
| Module folders | `kebab-case` | `user-auth` |
| {Add row} | {Convention} | {Example} |

---

## Extended Details

- Module-level data flows and constraints → `modules/{module-name}/architecture.md`
- Functional and non-functional requirements → `modules/{module-name}/specs.md`
- UI/UX source of truth → `general/DESIGN.md`
- Agent runtime config → `.pi/AGENTS.md` + `.pi/skills/`
