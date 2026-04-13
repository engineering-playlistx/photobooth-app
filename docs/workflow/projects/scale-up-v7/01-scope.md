# scale-up-v7 — Project Scope

**Milestone:** V7 — Polish
**Status:** In Progress 🔄
**Depends on:** `scale-up-v6` complete ✅

---

## What This Project Delivers

One sentence: **This project is a polish pass across the full platform — refining the dashboard experience (guest/photo model, event and org CRUD, flow builder validation), hardening the kiosk feel (camera feedback, sounds, inactivity modal, download/print UX), aligning AI generation polling, and adding font customization via Supabase Storage.**

---

## Definition of Done

### Dashboard
- Dashboard cards show both **total guests** and **total photos** as separate metrics
- Analytics counts both guests and photos (not just guests)
- Event status field is **removed from the frontend** — no display, no toggle (backend field kept, no enforcement)
- Events can be **renamed, have their status toggled, and deleted** from the dashboard
- Deleting an event requires confirmation; deletion is blocked if the event has any photo records (configurable guard)
- Organizations can be **deleted** from the dashboard; deletion is blocked with a clear error if the org has any events
- Guest portal is verified working end-to-end; its config location is documented

### Flow Builder
- Saving a flow with an AI Generation module but no Theme Selection module **shows a validation warning** (non-blocking or hard error — decided per ARCH-03)
- Printer name in the Result module **cannot be saved empty** when print is enabled
- The Result module has a **`retryEnabled` boolean** config field; the checkbox is disabled in the flow builder when no AI Generation module is in the flow

### Kiosk App
- Camera feed displays a **loading spinner** while `getUserMedia` is initializing
- A **countdown sound** plays on each tick (3, 2, 1)
- A **flash overlay** and **shutter sound** play at the moment of capture
- Google AI generation uses the **same polling pattern as Replicate** (no stuck-then-sudden progress bar)
- Inactivity handling uses a **two-timer system**: inactivity timer triggers a warning modal; modal timer triggers redirect
- Download and print are **separate buttons** (not combined)
- The "processing" button freeze after closing the download/print modal is **fixed**
- Retry result button visibility is **config-driven** (`retryEnabled` in Result module)

### Font Customization
- Event config supports a `fontUrl` field (Supabase Storage public URL) and a `fontFamily` name
- The kiosk app loads the custom font **once at app startup** via a `@font-face` injection into `<head>` — not on every route change
- Supported formats: `.woff2`, `.woff`, `.ttf`, `.otf`
- The dashboard event config page has an upload field for the font file

---

## Architecture Decisions (Resolved)

### ARCH-01 — Event status is a UI label only

**Decision:** Event status (`draft` / `active`) is not enforced by any backend logic. Remove the status display from the frontend entirely for V7. The database column is kept but no code gates on it.

**Rationale:** No current use case requires enforcement. Removing the display eliminates operator confusion without any backend risk.

---

### ARCH-02 — Guest vs Photo: show both, no data model change

**Decision:** Do not change the data model. A **guest** = a form submission (only recorded when a Form module is in the flow). A **photo** = a completed photobooth result (always recorded). Surface both counts on the dashboard and in analytics with clear labels. Add inline copy: *"Guests are only recorded when the flow includes a Form module."*

**Rationale:** The confusion is a display problem, not a schema problem. No migration needed.

---

### ARCH-03 — Flow builder validation: warn on save, hard block on invalid printer config

**Decision:**
- **AI gen + no Theme Selection:** non-blocking warning on save ("Your flow has AI Generation but no Theme Selection — guests won't be able to pick a theme"). Does not prevent save.
- **Print enabled + empty printer name:** hard validation error. Cannot save until printer name is filled.

**Rationale:** Theme selection absence is a configuration choice the operator might be intentional about (e.g. theme is pre-set via other logic). Printer name empty with print enabled is unambiguously broken.

---

### ARCH-04 — Font loading: one-time injection at app startup

**Decision:** On app startup, read `fontUrl` and `fontFamily` from the kiosk event config. If `fontUrl` is set, inject a single `<style>` tag with a `@font-face` rule into `document.head`. Because the kiosk is a React SPA (HashRouter), there are no full page reloads between routes — the font is cached by Chromium for the entire session after the first fetch.

**Supported formats:** `.woff2`, `.woff`, `.ttf`, `.otf`. Validated on upload in the dashboard.

**Rationale:** Injecting once at startup avoids re-fetching on every route transition. The offline-first constraint is relaxed for font loading — the kiosk already requires internet for AI generation.

---

### ARCH-05 — Google AI polling aligned with Replicate

**Decision:** Implement polling for Google AI generation using the same architecture as the Replicate path: create a prediction job, return a job ID, poll `/api/ai-generate-status` on an interval. This fixes the "stuck early, sudden jump" loading bar behaviour.

---

### ARCH-06 — Inactivity: two-timer system

**Decision:** Two separate configurable values:
- `inactivityTimeoutSeconds` — existing field; triggers the warning modal (not the redirect)
- `inactivityWarningSeconds` — new field; time the modal stays open before redirecting to home

The modal shows a countdown. If the guest taps "I'm still here", both timers reset. If the modal timer expires, redirect to home.

---

### ARCH-07 — Retry button is config-driven

**Decision:** Add `retryEnabled: boolean` to `ResultModuleConfig`. In the flow builder, the checkbox is disabled (with a tooltip: "Requires an AI Generation module in the flow") if no AI Generation module exists in the current `moduleFlow`. On the kiosk, the retry button renders only when `retryEnabled === true`.

---

### ARCH-08 — Org delete: blocked if org has events

**Decision:** Attempting to delete an organization that has one or more events returns a clear error: *"This organization has N event(s). Remove all events before deleting the organization."* No cascading delete. The user must manually delete events first.

---

## Phase Plan

| Phase | Focus | Key Items |
|-------|-------|-----------|
| V7-Phase 0 | Dashboard data model display | Guest + photo counts, analytics, event status removal |
| V7-Phase 1 | Event + org CRUD | Event rename/delete, org delete with guard |
| V7-Phase 2 | Flow builder hardening | Validation (AI gen + theme), printer name required, retry button config |
| V7-Phase 3 | Kiosk feel | Camera spinner, countdown/shutter sounds, flash overlay |
| V7-Phase 4 | Kiosk UX | Inactivity modal, download/print split, button freeze fix, Google AI polling |
| V7-Phase 5 | Font customization | Supabase Storage upload, font injection at startup |
| V7-Phase 6 | Guest portal verification | Test end-to-end, document config location, fix if broken |

---

## What This Project Does NOT Cover

- Event status backend enforcement (no gating logic, no middleware changes)
- Per-client dashboard login or per-client auth
- Session crash recovery (SQLite mid-session persistence)
- Config version history
- AI provider fallback chain
- Visual CSS builder / per-module layout templates
- Any new modules beyond what is configured via existing `moduleFlow` system
- Automated reporting or scheduled email delivery
- Electron auto-update (parked — blocked on Windows code signing)
