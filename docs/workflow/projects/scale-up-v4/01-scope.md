# scale-up-v4 — Project Scope

**Milestone:** V4 — Platform Polish + Deep Customization
**Status:** ✅ Complete (2026-04-10)
**Depends on:** `scale-up-v3` complete ✅

---

## What This Project Delivers

One sentence: **This project delivers a polished kiosk startup experience with asset pre-loading, deep per-module customization from the dashboard, a unified flow builder, basic analytics, kiosk event ID persistence, and Electron auto-update — moving the product toward a client-ready, self-serve event platform.**

---

## Definition of Done

- Kiosk shows a startup loading screen with a progress bar; EventConfig and all module assets are fetched and cached before the first module renders — no background image flicker
- Kiosk handles all negative startup cases (network error, backend error, DB error) with clear on-screen messages and a Retry button
- Kiosk has an admin settings screen for entering and persisting event ID — no manual `kiosk.config.json` edits required
- Result module has per-event feature toggles: email sending, QR code display, and printing can each be enabled/disabled from the dashboard flow builder
- AI loading screen slideshow content (images and captions) is configurable per event from the dashboard
- Each module supports per-event copy customization (heading text, CTA text, button labels) and raw inline CSS from the dashboard flow builder panel
- Dashboard flow builder is the single configuration hub: asset upload slots and module-specific config (form fields, printer name, AI settings) are inline in module panels — no separate Assets, Form Fields, AI Config, or Tech Config tabs
- Basic analytics view exists in the dashboard: total visits, unique guests, returning guests, and a daily visit trend chart per event
- Electron auto-update is implemented: kiosk silently checks for new versions on startup and shows an operator-dismissible update prompt

---

## Architecture Decisions (Resolved)

### A — Module customization field (`ModuleCustomization`)

**Decision: Each module exposes a predefined set of named UI elements. Each element can be independently customized with its own CSS and copy override.**

```typescript
interface ElementCustomization {
  copy?: string;   // text override for this element (if it renders text)
  css?: string;    // raw CSS applied to this specific element
}

interface ModuleCustomization {
  elements?: Record<string, ElementCustomization>;  // keyed by element name
}
```

Each module defines which elements are customizable and their canonical keys. The kiosk applies each element's `css` via a scoped `<style>` tag targeting a stable `pb-<moduleId>-<elementKey>` class on that element. This means any valid CSS works — including `hover:`, `transition`, `::placeholder`, pseudo-elements — with no parsing required. Each element's `copy` overrides the default hardcoded string for that element.

**Example — Welcome module elements:** `ctaButton`
**Example — Camera module elements:** `header`, `retakeButton`, `captureButton`, `nextButton`
**Example — Form module elements:** `header`, `submitButton`

The full element catalog per module is defined during V4-3.1 (read the actual component files to identify every customizable element before finalising the keys).

Dashboard: each module panel has a "Customization" section listing each element by name, with a CSS textarea and a copy text input per element.

**Explicit non-goal for V4:** A visual CSS builder or element picker. The per-element textarea approach is fast to implement and gives precise control. A visual builder is deferred to a future version.

---

### B — Result module feature flags

**Decision: Add three boolean flags to `ResultModuleConfig`.**

```typescript
interface ResultModuleConfig extends BaseModuleConfig {
  // existing fields...
  emailEnabled: boolean;    // default: true — send result email to guest
  qrCodeEnabled: boolean;   // default: true — show QR code for guest portal
  printEnabled: boolean;    // default: true — trigger DS-RX1 print
}
```

All flags default to `true` so existing event configs are unaffected. The result module in the kiosk reads each flag at runtime before executing the corresponding action. Dashboard: result module panel shows three labeled toggles.

---

### C — AI loading slideshow config

**Decision: Add an optional `slideshowItems` array to `AiGenerationModuleConfig`.**

```typescript
interface AiGenerationModuleConfig extends BaseModuleConfig {
  // existing fields...
  slideshowItems?: {
    imageUrl?: string;
    caption?: string;
  }[];
}
```

If `slideshowItems` is undefined or empty, the loading screen falls back to the existing static UI (no regression). The kiosk cycles through items at a fixed interval while AI generation is in progress. Dashboard: AI Generation module panel has a slideshow items editor (add/remove/reorder, image upload, caption text).

---

### D — Dashboard: Flow Builder as the single configuration hub

**Decision: The Flow Builder page absorbs assets and all module-specific config. Standalone Assets, Form Fields, AI Config, and Tech Config tabs are removed.**

Before V4:
- Flow Builder → module pipeline ordering + basic per-module config
- Assets → upload frames, templates, backgrounds, logo (separate page, added in V3)
- Branding → logo, colors (separate tab)
- Form Fields → toggle/reorder form fields (separate tab)
- AI Config → provider, themes, prompts (separate tab)
- Tech Config → printer, inactivity timeout (separate tab)

After V4:
- **Flow Builder** → the single config hub for the entire kiosk experience:
  - Add/remove/reorder modules (existing)
  - Each module card expands to show: basic config, asset upload slots, copy fields, CSS textarea
  - Result module panel: email/QR/print toggles + printer device name
  - Form module panel: field toggles + field order
  - AI Generation module panel: provider, themes, prompts, frame images, template images, slideshow config
  - Welcome module panel: CTA copy, background image upload, inline CSS
  - All other modules: background image upload + copy + inline CSS
- **Branding tab** remains (logo, global color palette, font) — genuinely event-level, not per-module
- **Assets route** is removed or redirects to Flow Builder
- Standalone Form Fields, AI Config, Tech Config tabs are removed from the event detail navigation

---

### E — Kiosk startup loading screen

**Decision: Add a dedicated `StartupLoader` component that owns config fetch, asset pre-loading, and error handling. The first module does not mount until all blocking assets are ready.**

V4 startup sequence:

```
App launches
    │
    ├── Show StartupLoader (full-screen splash + progress bar)
    │
    ├── Read kiosk.config.json → { eventId, apiBaseUrl, apiClientKey }
    │   └── If eventId missing/invalid → redirect to KioskSettings screen
    │
    ├── GET /api/config?eventId=<id> (25% progress)
    │   ├── On network error → show "No internet connection" error state + Retry button
    │   ├── On 4xx (config not found) → show "Event config not found — check event ID in Settings" + Settings button
    │   └── On 5xx / timeout → show "Cannot reach backend — contact your operator" + Retry button
    │
    ├── Pre-load all module assets (25% → 100%):
    │   - branding.screenBackgrounds (all module background images)
    │   - branding.logoUrl
    │   - ThemeSelection: previewImageUrl per theme
    │   - AiGeneration: slideshowItems[].imageUrl
    │   Asset failures are non-blocking (logged, not shown to operator)
    │
    └── Transition to first module in moduleFlow (fade animation)
```

Error states are operator-facing (not guest-facing — this runs before any guest session).

---

### F — Kiosk event ID settings screen

**Decision: Add a `KioskSettings` screen accessible via `Ctrl+Shift+S` (or configurable keyboard shortcut). It reads and writes `kiosk.config.json`.**

The settings screen:
- Shows the current event ID
- Input field for a new event ID  
- "Save & Reconnect" button → persists to `kiosk.config.json`, re-runs the startup loading flow
- Simple 4-digit PIN gate (PIN is either hardcoded in the build or set via a `KIOSK_ADMIN_PIN` env var at build time)
- Accessible from the startup error screen ("check event ID in Settings" button → bypasses PIN gate in that context)

This is the V4 multi-tenancy foundation. An `organizations` table, client account management, and a pairing QR code flow are V5 scope.

---

### G — Electron auto-update

**Status: ⏸️ Parked — moved out of V4 scope.**

Blocked on Windows code signing (certificate not yet obtained). Full architecture decisions and task specs live at [`docs/workflow/projects/[parked]-auto-update/01-plan.md`](../[parked]-auto-update/01-plan.md).

Key decisions captured there:
- Use `update-electron-app@^3.x` with `UpdateSourceType.StaticStorage` (Supabase S3, not GitHub Releases)
- Windows-only initially; macOS deferred until notarization is set up
- Unblock condition: EV or OV code signing certificate obtained + signed installer verified

---

## Rough Phase Plan

| Phase | Focus | Backlog Items | Status |
|-------|-------|---------------|--------|
| V4-Phase 1 | Carryover quick fixes | UX-01, GAP-06, SCALE-01, CODE-01 | ✅ |
| V4-Phase 2 | Kiosk startup loading + event ID settings | LOAD-01, LOAD-02, GAP-07, MULTI-01 | ✅ |
| V4-Phase 3 | Per-module customization — types + kiosk | CUSTOM-01, CUSTOM-02, CUSTOM-04 | ✅ |
| V4-Phase 4 | Per-module customization — dashboard | CUSTOM-01 (dashboard), CUSTOM-02 (dashboard), CUSTOM-04 (dashboard) | ✅ |
| V4-Phase 5 | Dashboard consolidation | DASH-01, DASH-02 | ✅ |
| V4-Phase 6 | Analytics | ANALYTICS-01 | ✅ |
| V4-Phase 7 | Electron auto-update | AUTO-01 | ⏸️ Parked — see [`[parked]-auto-update`](../[parked]-auto-update/01-plan.md) |
| V4-Phase 8 | AI generation resilience (field issues 2026-04-06) | AIGen-FIX-01, AIGen-UX-01 | ✅ |

---

## What This Project Does NOT Cover

These are V5 scope (do not plan them in scale-up-v4):

- `organizations` table, client account hierarchy, full multi-tenancy
- Client dashboard login and self-serve access
- Automated reporting or scheduled email delivery
- Config version history and rollback snapshots (CARRY-02)
- AI provider fallback chain (CARRY-01)
- Session crash recovery — SQLite mid-flow persistence (GAP-01)
- SQLite offline sync-back to Supabase (GAP-05)
- Operator-facing error dashboard (GAP-03)
- Form field builder (custom fields beyond name/email/phone)
- Guest portal V2 (social share, multiple result items)
- Per-module layout template selection (CUSTOM-03) — too complex for V4, deferred
- Visual CSS builder in dashboard (CUSTOM-01 advanced) — deferred
- Background auto-install of updates (auto-update with user confirmation is V4; silent install is V5)
- Pairing kiosk to event via QR code (kiosk settings screen with PIN is V4; QR pairing is V5)
