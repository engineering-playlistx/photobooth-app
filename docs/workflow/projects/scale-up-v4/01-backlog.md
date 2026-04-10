# scale-up-v4 — Backlog

**Purpose:** Issues and improvements accumulated during V3 execution, plus direct creator feedback from post-V3 testing. Use this as the starting input for V4 planning.

**Status:** Accumulated 2026-04-05. Triaged against V4 scope.

---

## How to use this document

Each entry has:
- **ID** — reference for task decomposition
- **Category** — Security / Data / UX / Perf / Code / Scale / Ops
- **Issue** — what the problem is
- **Context** — where it was found and why it matters
- **Suggested fix** — a directional recommendation (not a spec)

---

## Part A — Creator Feedback (Post-V3 Testing)

These items came directly from the creator after testing the kiosk and dashboard following V3 deployment. See `00-creator-feedback.md` for the raw notes.

### LOAD-01 — No startup loading screen on kiosk

**Category:** UX / Ops
**Issue:** When the kiosk app opens, it immediately attempts to configure itself (fetch remote config, load assets) with no visual feedback. There is no loading bar, no status messages, and no graceful handling of failure cases. The operator cannot tell if the app is starting correctly or frozen.
**Context:** Creator feedback post-V3.
**Suggested fix:** Add a dedicated startup screen that runs before the first module is displayed. It should: (1) show a progress bar while fetching `EventConfig` and downloading assets, (2) show meaningful error messages for backend errors, network disconnection, or DB errors, (3) only advance to the first module when the app is fully ready.

---

### LOAD-02 — Module backgrounds not pre-loaded: flicker on first module render

**Category:** UX
**Issue:** When the kiosk arrives at the first module (e.g. Welcome screen), the background image URL is available in `EventConfig` but the image has not been downloaded yet. The module renders with no background for 1–2 seconds, then the background image pops in.
**Context:** Creator feedback post-V3. Background images can be several MB, causing a noticeable visual flicker.
**Suggested fix:** During the startup loading screen (LOAD-01), pre-fetch all asset URLs from `EventConfig` (module backgrounds, logo, theme preview images, AI slideshow images) and cache them as Blob URLs or as DOM `<link rel="preload">` tags. When modules mount, the browser already has the images in cache.

---

### CUSTOM-01 — No per-module CSS or copy customization from the dashboard

**Category:** UX / Config
**Issue:** Module appearance (CTA text, font, size, color, margin, button text) is hardcoded in the kiosk React components. There is no way to customize module copy or styling from the dashboard without a code change and redeployment.
**Context:** Creator feedback. Examples: welcome screen CTA text, button label on any module, heading style per module.
**Suggested fix:** Add a `customization` field to each module config type:
```typescript
interface ModuleCustomization {
  inlineCss?: string;               // raw CSS applied to module root
  copy?: Record<string, string>;    // keyed strings: ctaText, headingText, etc.
}
```
V4 delivers inline CSS textarea + copy fields in the dashboard flow builder. A visual CSS builder is deferred to a future version.

---

### CUSTOM-02 — AI loading screen slideshow content is not configurable

**Category:** UX / Config
**Issue:** The AI generation loading screen shows a static UI while waiting for AI results. The images and text shown during the wait cannot be changed from the dashboard — they are hardcoded.
**Context:** Creator feedback. Different events need different loading screen content (brand messaging, tips, countdown graphics).
**Suggested fix:** Add `slideshowItems: { imageUrl?: string; caption?: string }[]` to `AiGenerationModuleConfig`. The loading screen cycles through these items during generation. Dashboard: AI generation module panel has a slideshow editor (add/remove/reorder items, preview). If `slideshowItems` is empty/absent, the existing static loading UI is shown as a fallback.

---

### CUSTOM-03 — Per-module layout template selection not supported

**Category:** UX / Config
**Issue:** Each module has one fixed layout. For example, the theme selection page always shows a card grid — there is no list layout option.
**Context:** Creator feedback (acknowledged as advanced future vision). Example: Theme Selection has Layout A (cards) and Layout B (list); after choosing a layout, the admin customizes its CSS.
**Status: Deferred to V5.** In V4, inline CSS customization (CUSTOM-01) already allows significant visual adaptation without a full layout-switching system. Track as a V5 item.

---

### CUSTOM-04 — Result page features not configurable per event

**Category:** Config
**Issue:** The result page always shows email sending, QR code, and print options, even for events where some of these are not applicable. Disabling any of them requires a code change.
**Context:** Creator feedback. Examples: outdoor events without a printer, events where the client doesn't want guest emails sent.
**Suggested fix:** Add to `ResultModuleConfig`:
```typescript
emailEnabled: boolean;   // default: true
qrCodeEnabled: boolean;  // default: true
printEnabled: boolean;   // default: true
```
All default to `true` for backward compatibility. Dashboard: result module panel shows three toggles. Kiosk: result module checks each flag before executing the action.

---

### DASH-01 — Asset management lives on a separate page from the flow builder

**Category:** Dashboard UX
**Issue:** When configuring an event, the operator must navigate to a separate "Assets" page to upload module backgrounds, frames, and templates. This creates unnecessary context-switching: if you're configuring a module in the flow builder, you should also be able to upload its assets from the same panel.
**Context:** Creator feedback post-V3. The V3 scope (decision D) deliberately placed assets on a separate page as an interim solution.
**Suggested fix:** Move all asset upload slots into their respective module panels in the flow builder. Remove the standalone "Assets" route from the navigation. The flow builder becomes the single page for configuring everything about a module: config, assets, copy, and CSS.

---

### DASH-02 — Separate event config pages exist outside the flow builder

**Category:** Dashboard UX
**Issue:** Standalone config tabs exist for Branding, Form Fields, AI Config, and Tech Config. Most of this config is already per-module (printer name belongs to the Result module; form fields belong to the Form module; AI settings belong to the AI Generation module). The split fragments configuration across too many places.
**Context:** Creator feedback. Current state: separate tabs. Target state: all module-specific config lives inline in the flow builder module panel.
**Suggested fix:** Move all module-specific config into the relevant module's panel in the flow builder. A single "Branding" tab remains at the event level for global branding (logo, color palette) — this is genuinely event-level, not module-level. Remove the standalone AI Config, Form Fields, and Tech Config tabs.

---

### ANALYTICS-01 — No easy way to see total visit count

**Category:** Dashboard UX / Data
**Issue:** There is no analytics view. To see total event visits, an operator must manually count rows in the guests table or infer from photo count. There is no aggregate stat, no chart, and no trend visible at a glance.
**Context:** Creator feedback. Operators need a simple way to report on event engagement to clients.
**Suggested fix:** Add an "Analytics" card/section to the event detail page showing: total visit count, unique guests, returning guests (visit_count > 1), daily visit trend (bar chart). This is the V4 baseline. More advanced analytics (time-of-day breakdown, theme popularity, funnel drop-off) are V5+.

---

### MULTI-01 — Kiosk event ID requires manual kiosk.config.json editing

**Category:** Ops / UX
**Issue:** To pair a kiosk with an event, an operator must manually edit `kiosk.config.json` on the device — a technical and error-prone step, especially in the field.
**Context:** Creator feedback. Multi-event deployments require re-pairing kiosks; manual JSON editing is impractical for non-technical operators.
**Suggested fix:** Add an admin settings screen to the kiosk (accessible via a hidden keyboard shortcut or long-press gesture, protected by a PIN). The operator inputs the event ID on-screen; it is written persistently to `kiosk.config.json` (or Electron `userData`). On restart, the kiosk uses the saved event ID. Full organizations/client hierarchy is V5 scope.

---

### AUTO-01 — Electron auto-update not implemented

**Category:** Ops
**Issue:** Kiosk updates require manual USB install — the operator physically brings a USB drive to each kiosk, installs a new build. This is operationally expensive and creates version drift risk (some kiosks miss updates).
**Context:** Tracked as GAP-02 since V2. Re-flagged by creator in V4 feedback.
**Status: ⏸️ Parked.** Full plan (architecture, code, release pipeline) lives at [`docs/workflow/projects/[parked]-auto-update/01-plan.md`](../../[parked]-auto-update/01-plan.md). Blocked on Windows code signing certificate. Uses `update-electron-app@^3.x` with `UpdateSourceType.StaticStorage` against Supabase S3 — not GitHub Releases.

---

## Part B — Deferred from V3

These items were explicitly marked out-of-scope in `scale-up-v3/01-scope.md`.

### CARRY-01 — AI provider fallback chain

**Category:** Resilience
**Issue:** When Replicate fails, AI generation fails with no fallback to Google or another provider.
**Status:** Deferred to V5. Requires `ai_jobs` table and API contract changes — scope exceeds V4.

---

### CARRY-02 — Config version history and rollback snapshots

**Category:** Ops
**Issue:** No rollback mechanism if an operator saves a bad EventConfig.
**Status:** Deferred to V5. Low urgency while one operator manages all configs.

---

### GAP-01 — Session state not persisted to SQLite mid-flow

**Category:** Resilience
**Issue:** A crash between camera capture and the result screen loses the captured photo.
**Status:** Deferred to V5. CLAUDE.md constraint explicitly deferred this for Phase 0–2.

---

### GAP-05 — SQLite offline backup has no sync-back mechanism

**Category:** Resilience / Data
**Issue:** If Supabase is unavailable during an event, sessions saved locally are never uploaded after connectivity returns.
**Status:** Deferred to V5.

---

### GAP-03 — No operator-facing error dashboard

**Category:** Ops
**Issue:** Print failures, save failures, and email failures are only visible in Electron DevTools logs. Operators at events have no visibility.
**Status:** Deferred to V5.

---

## Part D — Post-V5 Field Issues (Found During Testing 2026-04-06)

### ~~AIGen-FIX-01 — AI generation hangs silently on slow network (no fetch timeout)~~ ✅ Done (V4-8.1)

**Category:** Resilience / UX
**Issue:** When the AI generation response body is slow to stream (large base64 image on a degraded network), `AiGenerationModule` freezes on the loading screen indefinitely with no error, no timeout, and no escape. Root cause: `createResponse.json()` at line 174 of `AiGenerationModule.tsx` blocks until the full response body arrives — but there is no `AbortController` or timeout guarding the `fetch` call. The response headers arrive quickly (HTTP 200 is logged), giving the false impression of success, while the multi-MB body streams infinitely slowly. Since no exception is thrown (a stalled stream ≠ a dropped connection), the catch block never fires.

**Observed log pattern:**
```
[AI Generate] Create response — status: 200 (15.1s)
<nothing further — UI frozen>
```

**Context:** Reproduced live: second session in a two-session test run. Network was already flagged slow by the browser ("Slow network detected"). First session completed fine (10.4s); second session stalled. The 60-second AI-generation SLA in CLAUDE.md (`Core Constraints`) cannot be enforced without an explicit timeout.

**Suggested fix:** Wrap the entire `fetch` call in an `AbortController` with a `setTimeout` of 60 seconds. Pass the `signal` to `fetch(url, { signal })` — this aborts both the request and any in-progress body read if the timeout fires. Throw a user-friendly error on abort: `"Generation timed out. Please try again."` (matches the existing timeout message already in the catch path).

---

### ~~AIGen-UX-01 — No escape hatch while AI generation is loading~~ ✅ Done (V4-8.2)

**Category:** UX / Resilience
**Issue:** During AI generation the UI is a full-screen slideshow with a progress bar and no interactive controls. If generation stalls (slow network, backend issue, or any hang), the guest is completely stuck — there is no way to cancel, retry, or go back to the home screen without an operator physically restarting the kiosk. Even after AIGen-FIX-01 is applied (60s abort), a guest must wait the full 60 seconds before the error state and Retry/Back buttons appear.

**Context:** Companion to AIGen-FIX-01. Found during the same 2026-04-06 test session. The kiosk was stuck with no escape for the duration of the session.

**Suggested fix:** Show a "Cancel / Start Over" button on the loading screen after a configurable delay (e.g., 30 seconds — half the 60s timeout). The button is hidden initially and fades in after the delay. Tapping it aborts the fetch (via the same `AbortController` from AIGen-FIX-01) and calls `onBack()` to return the guest to the home screen. This gives guests agency without cluttering the loading UI during normal fast completions.

---

## Part C — V3 Backlog Items Triaged for V4

| ID | Issue | V4? |
|----|-------|-----|
| UX-01 | Print button disabled while saving, no tooltip explaining why | ✅ V4 Phase 1 |
| GAP-06 | Result page reset/back has no confirmation — guest can accidentally lose result | ✅ V4 Phase 1 |
| SCALE-01 | ZIP download cap: shows `window.alert()` instead of proper in-page UX | ✅ V4 Phase 1 |
| CODE-01 | `no-control-regex` ESLint rule forces inline disable comments on `sanitizeName` | ✅ V4 Phase 1 |
| GAP-07 | No in-memory or SQLite config cache on kiosk — every session start hits network | ✅ V4 Phase 2 |
| PERF-01 | `getSession()` JWT has 1-hour revocation window (background `getUser()` fix) | 🔜 V5 (low priority) |
| SCALE-02 | Photos page fetches all Storage metadata on every page navigation | 🔜 V5 (acceptable at current scale) |
| CODE-02 | Supabase Storage discriminated union note (lint behavior is correct) | 🔜 V5 (doc-only update) |
| OFFLINE-01 | `POST /api/session/start` fires on every session start and fails hard when offline — needs fail-silently / offline-skip behaviour | 🔜 V5 |
| PRELOAD-01 | Local static assets bundled with Electron (`/images/theme-*.png` etc.) are not pre-loaded by `preloadAssets` — they're served over Vite dev HTTP so they fail in simulated-offline dev; harmless in prod Electron but worth unifying | 🔜 V5 (low priority — non-issue in prod) |
