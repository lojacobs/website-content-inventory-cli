# Specs — {Module Name}

> **Location:** `modules/{module-name}/specs.md`
> **Updated by:** Planner.
> **Read by:** Orchestrator (audit mode), Workers (task context).
> Relationships and data flow → `modules/{module-name}/architecture.md`.
> UI/UX detail → `general/DESIGN.md`.

---

## Module Purpose

<!-- 1–2 sentences: what problem this module solves and who uses it. -->
{Describe the module's reason for existing and its primary user or consumer.}

---

## Functional Requirements

<!-- Numbered, testable statements. -->
<!-- Use "The system shall …" phrasing. -->
<!-- Each item must be verifiable by a test or an acceptance criterion. -->

1. The system shall {observable, testable behaviour}.
2. The system shall {observable, testable behaviour}.
3. The system shall {observable, testable behaviour}.
<!-- Add as needed. -->

---

## Non-Functional Requirements

<!-- Measurable thresholds only. Avoid "fast", "secure", "reliable" without numbers. -->

| Category | Requirement | Threshold |
|---|---|---|
| Performance | {E.g.: API response time under load} | {E.g.: p95 ≤ 200 ms at 100 req/s} |
| Security | {E.g.: All endpoints require authentication} | {E.g.: 401 returned on missing token} |
| Accessibility | {E.g.: UI components meet WCAG} | {E.g.: WCAG 2.1 AA} |
| Reliability | {E.g.: Task retry on transient failure} | {E.g.: ≤ 3 retries, exponential backoff} |
| {Add row} | | |

---

## Out of Scope

<!-- Explicit exclusions that prevent scope creep. -->
<!-- Workers must not implement anything listed here without a Planner instruction. -->

- {Feature or behaviour explicitly excluded from this module.}
- {Feature or behaviour explicitly excluded from this module.}
- {Add as needed.}

---

## Data Structures / Entities

<!-- Entities owned by this module. -->
<!-- Reference architecture.md for full relationship diagram — do not duplicate it here. -->

### {EntityName}

| Field | Type | Required | Notes |
|---|---|---|---|
| `{field}` | `{type}` | Yes / No | {Constraint or default} |
| `{field}` | `{type}` | Yes / No | {Constraint or default} |
| {Add row} | | | |

> Full relationships → `modules/{module-name}/architecture.md § Domain Model`

---

<!-- Repeat EntityName block for each entity owned by this module. -->

---

## Integration Points

### Consumed from other modules

| Module | What is consumed | Reference |
|---|---|---|
| `{module-name}` | {Data structure or event} | `modules/{module-name}/architecture.md` |
| {Add row} | | |

### Exposed to other modules

| Consumer | What is exposed | Reference |
|---|---|---|
| `{module-name}` | {Data structure, API, or event} | `modules/{module-name}/architecture.md` |
| {Add row} | | |

---

## Design Reference

<!-- Pointer into general/DESIGN.md. No design detail inline here. -->

- **Flows:** {Flow 1 — {name}, Flow 2 — {name}} → `general/DESIGN.md § User Flows`
- **Components:** {ComponentName, ComponentName} → `general/DESIGN.md § Component Inventory`
- *(Leave blank if this module has no UI.)*

---

## Open Questions

<!-- Unresolved decisions that are blocking or could affect implementation. -->
<!-- Workers do not make assumptions about open items — they escalate to Planner. -->

| # | Question | Blocking? | Owner | Notes |
|---|---|---|---|---|
| SQ-01 | {Describe the unresolved decision} | Yes / No | {Name or role} | {Context} |
| SQ-02 | {Describe the unresolved decision} | Yes / No | {Name or role} | {Context} |
| {Add row} | | | | |
