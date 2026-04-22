# RCA — {YY-MM-DD_HH-MM}

> **File name:** `rca-{YY-MM-DD_HH-MM}.md`
> **Triggered by:** Orchestrator (after Alt Worker failure or audit block) or Planner (manual).
> **Written by:** Orchestrator. Reviewed and acted on by Planner.

---

## Work Done

<!-- All Beads items completed in the session or phase that ended in this incident. -->
<!-- Include only items completed before the failure; in-progress items go in Issues. -->

| ID | Type | Name | Description |
|---|---|---|---|
| `{epic-001}` | Epic | {Epic name} | {1-liner} |
| `{task-001}` | Task | {Task name} | {1-liner} |
| `{task-002}` | Task | {Task name} | {1-liner} |
| {Add row} | | | |

---

## Issues Met

<!-- What went wrong. One row per distinct issue. -->
<!-- Be specific: which task, which command, which assertion failed. -->

### Issue 1 — {Short Label}

**Task ID:** `{task-id}`
**Agent:** {Primary Worker / Alt Worker / Orchestrator}
**Command or step that failed:** `{exact command or step reference}`

**Observed behaviour:**
{Describe what actually happened.}

**Expected behaviour:**
{Describe what should have happened.}

---

### Issue 2 — {Short Label}

*(Repeat block as needed.)*

---

## Fixes Applied

<!-- What was done to resolve the issues above. -->
<!-- One fix can resolve multiple issues — use the issue labels to link them. -->

### Fix 1 — {Short Label}

**Resolves:** Issue 1 {, Issue 2, …}
**Change made:**
{Describe the fix concisely. Include file name or command if applicable.}

**Outcome:** {Did it resolve the issue? Partially? Workaround only?}

---

### Fix 2 — {Short Label}

*(Repeat block as needed.)*

---

## Prevention

<!-- How to avoid this class of issue in future sessions. -->
<!-- Each item is a concrete rule or check, not a vague aspiration. -->

1. {Prevention measure — actionable, specific.}
2. {Prevention measure — actionable, specific.}
3. {Add as needed.}

---

## Where to Persist

<!-- For each prevention measure above, recommend exactly where to record it. -->
<!-- Choose the level of generality that matches the scope of the lesson. -->
<!-- Options: AGENTS.md (pattern learnings), a specific .pi/skills/*.md, -->
<!--          general/ARCHITECTURE.md (invariant or constraint), -->
<!--          modules/{module-name}/architecture.md, modules/{module-name}/specs.md, -->
<!--          .pi/prompts/planner-prompt.md, scripts/context-builder.sh, etc. -->

| Prevention # | Persist in | Rationale |
|---|---|---|
| 1 | `{file path}` | {Why this location — e.g., "system-wide pattern" / "module-specific constraint"} |
| 2 | `{file path}` | {Rationale} |
| {Add row} | | |