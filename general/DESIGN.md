# Design — {System or Module Name}

> **Source of truth for:** UI/UX decisions, visual language, component inventory, user flows.
> **Updated by:** Claude.ai ideation, Claude Design exports, or Stitch exports.
> **Read by:** Planner (context), Workers (task context when UI-bearing).
> Workers reference component names and flow step numbers — never screenshot dependencies.

---

## Visual Language

<!-- Use design token names only. Never paste hex values or raw pixel numbers here. -->
<!-- Token definitions live in the design system / style dictionary, not in this file. -->

### Colour Tokens

| Role | Token | Notes |
|---|---|---|
| Primary action | `color.action.primary` | Buttons, links, key CTAs |
| Destructive action | `color.action.destructive` | Delete, remove, irreversible ops |
| Surface default | `color.surface.default` | Page / panel background |
| Surface raised | `color.surface.raised` | Cards, modals |
| Text primary | `color.text.primary` | Body copy |
| Text muted | `color.text.muted` | Labels, secondary info |
| Border default | `color.border.default` | Dividers, input borders |
| {Add row} | `{token}` | {Note} |

### Typography Tokens

| Role | Token | Notes |
|---|---|---|
| Display heading | `type.display` | Hero titles |
| Section heading | `type.heading.lg` | H1-level sections |
| Subheading | `type.heading.sm` | H2-level sections |
| Body | `type.body.md` | Default prose |
| Caption | `type.caption` | Labels, helper text |
| Code | `type.mono` | Inline code, snippets |

### Spacing Tokens

| Scale | Token | Notes |
|---|---|---|
| 4 px | `space.1` | Micro gaps (icon + label) |
| 8 px | `space.2` | Tight intra-component spacing |
| 16 px | `space.4` | Default padding inside components |
| 24 px | `space.6` | Section breathing room |
| 32 px | `space.8` | Between major sections |
| 48 px | `space.12` | Page-level margins |

---

## Component Inventory

<!-- List of UI components needed for this system or module. -->
<!-- No implementation detail — name + single-line purpose only. -->
<!-- Workers use these names when generating code; keep them consistent. -->

| Component | Purpose | Status |
|---|---|---|
| `{ComponentName}` | {What it does — 1 sentence} | `draft \| ready \| deprecated` |
| `{ComponentName}` | {What it does — 1 sentence} | `draft \| ready \| deprecated` |
| {Add row} | | |

---

## User Flows

<!-- Numbered steps. One flow per subsection. -->
<!-- Screenshots are not required — text steps are enough for agent context. -->
<!-- Reference component names from the inventory above. -->

### Flow 1 — {Flow Name}

**Entry point:** {Where the user starts}
**Goal:** {What the user wants to accomplish}

1. User {action}
2. System displays `{ComponentName}` with {state or data}
3. User {action}
4. System {response — validation, navigation, mutation}
5. User arrives at {end state}

**Error path:** {What happens when step N fails — 1 sentence}

---

### Flow 2 — {Flow Name}

**Entry point:** {Where the user starts}
**Goal:** {What the user wants to accomplish}

1. {Step}
2. {Step}
3. {Step}

**Error path:** {What happens on failure}

---

<!-- Add flows as needed. -->

---

## Open Questions

<!-- Unresolved design decisions that could affect implementation. -->
<!-- Workers must not make assumptions about open items — they escalate to Planner. -->

| # | Question | Blocking? | Owner | Notes |
|---|---|---|---|---|
| DQ-01 | {Describe the unresolved decision} | Yes / No | {Name or role} | {Context} |
| DQ-02 | {Describe the unresolved decision} | Yes / No | {Name or role} | {Context} |
| {Add row} | | | | |