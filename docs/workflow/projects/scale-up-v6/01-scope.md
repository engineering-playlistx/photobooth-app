# scale-up-v6 — Project Scope

**Milestone:** V6 — Multi-Event Seamlessness
**Status:** Planning 🔜
**Depends on:** `scale-up-v5` complete ✅

---

## What This Project Delivers

One sentence: **This project fixes the critical event-creation regression (new events have no config row), repairs any broken existing events, and makes module behavior smarter by auto-skipping the theme-selection screen when only one theme is configured — improving the operator experience for running multiple events.**

---

## Definition of Done

- Creating a new event via the dashboard immediately produces a working config page (no 500)
- Creating a new event via the dashboard immediately produces a working flow builder (no 500)
- Existing events with no `event_configs` row are repaired via SQL migration
- When a `theme-selection` module has exactly 1 theme, the kiosk skips the selection screen and auto-selects the single theme — guest goes directly to the next module
- All existing kiosk flows with 2+ themes are unaffected

---

## Architecture Decisions (Resolved)

### A — Default event_configs value on event creation

**Decision: insert a minimal default `EventConfig` inline in `createEvent`.**

When a new event is created, immediately insert into `event_configs`:

```json
{
  "eventId": "<new-event-id>",
  "branding": {
    "logoUrl": null,
    "primaryColor": "#ffffff",
    "secondaryColor": "#000000",
    "fontFamily": null,
    "backgroundUrl": null,
    "portalHeading": null,
    "screenBackgrounds": null
  },
  "moduleFlow": [],
  "formFields": { "name": true, "email": true, "phone": true, "consent": true },
  "techConfig": {
    "printerName": "",
    "inactivityTimeoutSeconds": 60,
    "guestPortalEnabled": false
  }
}
```

An empty `moduleFlow` is intentional — the operator configures the flow via the flow builder. An empty flow will render "Pipeline Error" on the kiosk, which is acceptable since the event won't be launched until the flow is configured.

**Rationale:** Keeping the default minimal avoids hardcoding Shell-specific defaults into the platform layer. Each new event starts as a blank slate.

---

### B — Auto-skip is automatic, not a config flag

**Decision: when `themes.length === 1` in a `theme-selection` module, always skip — no flag needed.**

There is no reason to ever show a theme selection screen with exactly one option. The behavior is unconditional.

**Implementation:** In `PipelineRenderer.tsx`, add a `useLayoutEffect` that fires when `currentIndex` changes. If `currentModule.moduleId === 'theme-selection'` and `themes.length === 1`, immediately call `handleComplete({ selectedTheme: { id: themes[0].id, label: themes[0].label } })`. `useLayoutEffect` is used (not `useEffect`) to prevent a one-frame flash of the theme-selection UI before the skip executes.

**Edge cases:**
- `themes.length === 0`: already handled in `ThemeSelectionModule` (shows error UI) — not affected
- `themes.length >= 2`: no change in behavior

**No TypeScript type change required.** `ThemeSelectionModuleConfig` already supports single-item arrays — this is purely runtime behavior.

---

### C — Repair migration uses safe LEFT JOIN pattern

**Decision: repair SQL inserts defaults only for events with no existing config row.**

```sql
INSERT INTO event_configs (event_id, config_json)
SELECT e.id, jsonb_build_object(...)
FROM events e
LEFT JOIN event_configs ec ON ec.event_id = e.id
WHERE ec.event_id IS NULL;
```

Safe to run on a live database. Idempotent — running it twice produces no duplicates (no event can be in the `WHERE` clause twice once the first run fills the gap).

---

## Rough Phase Plan

| Phase | Focus | Items |
|-------|-------|-------|
| V6-Phase 0 | Bug fixes | BUG-01, BUG-02 |
| V6-Phase 1 | Per-module conditional behavior | CUSTOM-04 |

---

## What This Project Does NOT Cover

These are V7+ scope (do not plan them in scale-up-v6):

- Client dashboard login or per-client auth (CLIENT-01)
- Nested routing restructure (`/orgs/:orgId/events/:eventId/...`) — explicitly deferred; the flat routing with org labels from V5 is sufficient for current operator-only use
- Automated reporting or scheduled email delivery (REPORT-01)
- AI provider fallback chain (CARRY-01)
- Config version history (CARRY-02)
- Session crash recovery (GAP-01)
- Operator error dashboard (GAP-03)
- Per-module layout templates, visual CSS builder, guest portal V2, form field builder
- Any other per-module conditional behavior beyond single-theme auto-skip (creator said to define further — these become V7 backlog items once defined)
