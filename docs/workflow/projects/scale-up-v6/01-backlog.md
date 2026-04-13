# scale-up-v6 — Backlog

**Purpose:** Issues and improvements carried over from V5, plus new items from creator feedback, triaged against V6 scope.

**Status:** Triaged 2026-04-13 against V6 scope decisions in `00-creator-feedback.md`.

---

## How to use this document

Each entry has:
- **ID** — reference for task decomposition
- **Category** — Security / Data / UX / Perf / Code / Scale / Ops / Resilience
- **Issue** — what the problem is
- **Context** — where it was found and why it matters
- **Suggested fix** — directional recommendation (not a spec)

---

## Part A — New Items for V6 (from creator feedback)

### BUG-01 — Config page returns 500 on any event created via the V5 New Event form

**Category:** Data / UX
**Issue:** Navigating to `/dashboard/events/:eventId/config` for an event created via the V5 New Event form throws a 500 error: "Cannot coerce the result to a single JSON object." The same error hits the flow builder (`/dashboard/events/:eventId/flow`).
**Context:** Root cause confirmed via codebase read. `createEvent` in `apps/web/src/routes/dashboard/_layout.index.tsx:43–59` inserts into `events` but never seeds a corresponding `event_configs` row. Both the config route and flow route call `.from('event_configs').select().eq('event_id', eventId).single()` — which returns PGRST116 (no rows) and throws. All events created before V5's New Event form had configs seeded via manual migration. This is a regression introduced in V5.
**Suggested fix:** In `createEvent`, after the successful `events` insert, also insert a minimal default `event_configs` row for the new event ID.

---

### BUG-02 — Existing events created via V5 form have no event_configs row (data repair needed)

**Category:** Data
**Issue:** Any event created via the V5 New Event form between V5 launch and BUG-01 fix will have no `event_configs` row. BUG-01 fixes new events going forward, but existing broken events need a repair migration.
**Context:** Identified as a consequence of BUG-01. Events with no `event_configs` row are unrecoverable from the dashboard without direct SQL access.
**Suggested fix:** Write a repair SQL migration that inserts a default `event_configs` row for any event that doesn't have one. Safe to run on a live database (uses `LEFT JOIN ... WHERE IS NULL` pattern).

---

### CUSTOM-04 — Theme-selection module shown even when only one theme is configured

**Category:** UX
**Issue:** When a `theme-selection` module is configured with exactly one theme, the kiosk still shows the theme selection screen — forcing the guest to tap a single option before proceeding. There is no user choice, so the screen is wasted friction.
**Context:** From creator feedback: "the most urgent one is to skip ai theme selection page when the theme is only one." `ThemeSelectionModuleConfig.themes` is an `Array<{ id, label, previewImageUrl }>`. The downstream module (`ai-generation`) needs `moduleOutputs.selectedTheme = { id, label }`, which is what `ThemeSelectionModule.handleSelectTheme` sets.
**Suggested fix:** In `PipelineRenderer.tsx`, when the current module is `theme-selection` and `themes.length === 1`, auto-advance with `{ selectedTheme: { id: themes[0].id, label: themes[0].label } }` via a `useEffect` — skipping the UI entirely. No config flag needed; this is always the correct behavior.

---

## Part B — Carried Over from V5 (explicitly deferred to V6+)

These items were deferred from V5. Subset relevant to V6 "multi-event seamlessness" goal listed here.

| ID | Issue | V6 decision |
|----|-------|-------------|
| CARRY-02 | Config version history + rollback snapshots | ⏸️ Defer to V7 — low urgency, no client accounts yet |
| GAP-03 | Operator-facing error dashboard | ⏸️ Defer to V7 |
| CLIENT-01 | Client dashboard login + self-serve access | ⏸️ Defer to V7 |
| REPORT-01 | Automated reporting + scheduled email delivery | ⏸️ Defer to V7 (depends on CLIENT-01) |
| CARRY-01 | AI provider fallback chain | ⏸️ Defer to V7 |
| CUSTOM-03 | Per-module layout template selection | ⏸️ Defer to V7 — complex UX |
| CSS-01 | Visual CSS builder in dashboard | ⏸️ Defer to V7 |
| GUEST-01 | Guest portal V2 | ⏸️ Defer to V7 |
| FIELD-01 | Form field builder | ⏸️ Defer to V7 |
| GAP-01 | Session crash recovery (SQLite mid-flow) | ⏸️ Defer — still low urgency |
| GAP-05 | SQLite offline sync-back to Supabase | ⏸️ Defer — depends on GAP-01 |
| QR-01 | QR kiosk pairing | ⏸️ Defer — PIN screen sufficient |
| PERF-01 | `getSession()` JWT 1-hour revocation window | ⏸️ Defer — low risk until client accounts exist |
