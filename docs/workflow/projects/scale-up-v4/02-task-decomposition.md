# Task Decomposition — V4 All Phases

**Status:** 🔄 In Progress — Phase 1 ✅, Phase 2 ✅, Phase 3 ✅, Phase 4 ✅, Phase 5 ✅, Phase 6 ✅, Phase 7 next
**Scope:** Phase 1 (Carryover Quick Fixes), Phase 2 (Kiosk Startup + Event ID Settings), Phase 3 (Per-Module Customization — Types + Kiosk), Phase 4 (Per-Module Customization — Dashboard), Phase 5 (Dashboard Consolidation), Phase 6 (Analytics), Phase 7 (Electron Auto-Update — Supabase S3 via update-electron-app v3 StaticStorage), Phase 8 (AI Generation Resilience — field issues 2026-04-06)

**Format per task:** What · Files · Input · Output · Verification · Risk
**Per-task workflow:** read → change → lint → test → commit → mark done (see CLAUDE.md)

> **Note on Phases 4–7:** These phases involve significant dashboard or infrastructure work. Before starting each phase, read the relevant files first to verify the current state — the task specs below are directional and assume the Phase 3 type changes are in place. Refine the exact file list and steps at the start of each phase.

---

## Phase 1 — Carryover Quick Fixes

### ~~V4-1.1 — UX-01: Show tooltip when Print & Download button is disabled~~ ✅

**What:** The result module disables the "Print & Download" button while `isSaving` is true, but shows no explanation. A guest who taps immediately after the result screen loads gets no feedback. Add a tooltip or inline message that appears only when the button is tapped while disabled.

**Files:**
- `apps/frontend/src/modules/ResultModule.tsx`

**Input:** V3 complete.

**Output:**
- When the button is in a disabled state (`isSaving === true`) and the user taps it, show a brief message: e.g. render a `<p>` below the button that says "Still saving — please wait a moment." and auto-hides after 2 seconds.
- Alternatively: make the saving indicator (already present in muted text) bolder/animated while saving — whichever is simpler given the current component structure. Read the file before deciding.

**Verification:**
- Layer 1: Lint changed file — no errors
- Layer 2: n/a
- Layer 3: On the result screen, tap the button immediately after it loads (while saving is in progress) — confirm a visible message appears

**Risk:** Low. UI-only, no logic change.

---

### ~~V4-1.2 — GAP-06: Add confirmation before resetting session on result page~~ ✅

**What:** The result page has "Retry Result" and/or "Back to Home" buttons that both call `reset()` — a guest can accidentally lose their result before printing or downloading. Add a confirmation dialog ("Are you sure? Your result photo will be lost.") before the reset executes.

**Files:**
- `apps/frontend/src/modules/ResultModule.tsx`

**Input:** V4-1.1 complete.

**Output:**
- When a guest taps "Back to Home" or "Retry Result", render a confirmation overlay/modal: "You haven't printed or downloaded yet. Leave anyway?" with "Go Back" (cancel) and "Yes, leave" (confirm → calls `reset()`) buttons.
- Note: the photo is already saved to Supabase and SQLite by the time the result screen is visible — the warning is about printing/downloading, not data loss.
- The modal should be styled consistently with the kiosk UI (full-screen overlay, large touch targets).

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: n/a
- Layer 3: On the result screen, tap Back to Home — confirm dialog appears; tap cancel → stays on result; tap confirm → resets

**Risk:** Low. Additive UI. No logic change to reset behavior.

---

### ~~V4-1.3 — SCALE-01: Replace window.alert() with in-page banner for ZIP download limit~~ ✅

**What:** When an event has more than 25 photos, the "Download ZIP" button triggers a `window.alert()` telling the operator to use the CLI script. Replace this with a proper in-page informational banner.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx`

**Input:** V4-1.2 complete.

**Output:**
- Remove `window.alert(...)` call.
- When `downloadPhotosZip` returns `{ tooLarge: true }`, render an inline dismissible info banner below the download button:
  ```
  This event has more than 25 photos. Use the bulk download script for large exports:
  npx download-photos --event <eventId>
  See docs/download-photos-guide.md for instructions.
  ```
- The banner is styled as a yellow/amber info block (not an error — the data is fine, just the channel is different).
- The existing Download ZIP button should still work for ≤ 25 photos.

**Verification:**
- Layer 1: Lint changed file — no errors
- Layer 2: n/a
- Layer 3: In an event with more than 25 photos, click Download ZIP — confirm in-page banner appears instead of a browser alert

**Risk:** Low. UI-only change, no backend change.

---

### ~~V4-1.4 — CODE-01: Extract control-character regex into a named constant~~ ✅

**What:** The `sanitizeName` function in `api.photo.ts` uses an inline regex with control characters (`\x00–\x1F`, `\x7F`), which triggers the `no-control-regex` ESLint rule. The inline `eslint-disable-line` comment placement is fragile when Prettier reformats the file. Extract the regex into a named constant built via `new RegExp(...)` to sidestep the rule entirely.

**Files:**
- `apps/web/src/routes/api.photo.ts`

**Input:** V4-1.3 complete.

**Output:**
- Before the route handler, add:
  ```typescript
  const CONTROL_CHAR_REGEX = new RegExp('[\x00-\x1F\x7F]', 'g')
  ```
- Replace the inline regex usage in `sanitizeName` with `CONTROL_CHAR_REGEX`.
- Remove any existing `// eslint-disable` comments for `no-control-regex` in this file.

**Verification:**
- Layer 1: `git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint` — no `no-control-regex` errors
- Layer 2: `pnpm wb test` — existing tests pass
- Layer 3: `curl -X POST .../api/photo` with a name containing control characters — confirm they are stripped

**Risk:** Low. Pure refactor — behavior is unchanged.

---

## Phase 2 — Kiosk Startup Loading + Event ID Settings

### ~~V4-2.1 — Add `StartupLoader` component with loading bar~~ ✅

**What:** Create a full-screen startup loading component that is shown when the kiosk app first launches. It fetches `EventConfig`, reports progress, and only advances to the first module when ready. This is the entry point for all V4 kiosk startup work.

**Files:**
- Read first: `apps/frontend/src/App.tsx` (or equivalent root component — understand current startup flow and how `EventConfigContext` is populated)
- Read first: `apps/frontend/src/contexts/EventConfigContext.tsx` (understand how config is currently fetched)
- `apps/frontend/src/components/StartupLoader.tsx` (new)
- `apps/frontend/src/App.tsx` (modify to mount StartupLoader before the module pipeline)

**Input:** V4-1.4 complete.

**Output:**
- `StartupLoader.tsx` is a new full-screen component that:
  1. Reads `kiosk.config.json` via `electronAPI` (or however it's currently read) to get `{ eventId, apiBaseUrl, apiClientKey }`
  2. If `eventId` is missing → render "Setup Required" state with a button to open `KioskSettings` (V4-2.4)
  3. Calls the config fetch (currently in `EventConfigContext`) — progress: 0% → 30%
  4. On network/backend error → render an error state with a Retry button (see error state spec below)
  5. On success → proceed to asset pre-loading phase (V4-2.2 will extend this step) — progress: 30% → 100%
  6. On completion → fade out and let the module pipeline render

- Error states (operator-facing only — this runs before any guest session):

  | Error | Message | Action |
  |-------|---------|--------|
  | Network unreachable | "No internet connection. Check the network and try again." | Retry button |
  | Backend 5xx / timeout | "Unable to reach the backend. Contact your event operator." | Retry button |
  | 404 (config not found) | "Event config not found. Check the event ID in Settings." | Retry + Settings buttons |

- The loading bar is a simple CSS-animated progress bar (no external library needed).
- Styling: full-screen dark background (matching kiosk theme), centered logo (from `kiosk.config.json` or a hardcoded app logo), progress bar below, status text below that.

**Verification:**
- Layer 1: Lint new and changed files — no errors
- Layer 2: n/a (startup flow is integration-only; not worth mocking Electron IPC)
- Layer 3: Launch the kiosk — confirm loading screen appears before the first module; confirm it disappears after a short delay with a successful config fetch

**Risk:** Medium. Modifies the startup flow. If this blocks the app from launching, all kiosk functionality is broken. Test thoroughly before committing.

---

### ~~V4-2.2 — Pre-load all module background assets during startup~~ ✅

**What:** Extend `StartupLoader` to pre-fetch all image assets from `EventConfig` after the config fetch succeeds. Images are fetched and stored as Blob URLs (or browser-cached via `new Image()` preload). Modules that mount afterward will get instant renders.

**Files:**
- `apps/frontend/src/components/StartupLoader.tsx` (extend from V4-2.1)
- `apps/frontend/src/utils/preloadAssets.ts` (new utility)

**Input:** V4-2.1 complete.

**Output:**
- Create `preloadAssets(config: EventConfig): Promise<void>` in a new utility:
  - Collects all image URLs from:
    - `config.branding.screenBackgrounds` (all values)
    - `config.branding.logoUrl`
    - Each module's theme `previewImageUrl` (ThemeSelection)
    - Each `slideshowItems[].imageUrl` in AiGeneration (when V4-3.2 is done — skip gracefully if field doesn't exist yet)
  - For each URL: `new Image()` with `src = url` → `onload` resolves, `onerror` logs a warning (non-blocking)
  - Returns a `Promise.allSettled(...)` so all images are attempted regardless of individual failures
- `preloadAssets` accepts an `onProgress(percent: number) => void` callback. As each image settles (load or error), call `onProgress(30 + (++loaded / total) * 70)` to advance the bar incrementally from 30% to 100%. If there are no images to load, jump straight to 100%.
- In `StartupLoader`, pass a progress setter to `preloadAssets` and update the bar as each image resolves.
- Asset loading failures are non-blocking: log a console warning, do not halt the startup.

**Verification:**
- Layer 1: Lint new and changed files — no errors
- Layer 2: n/a
- Layer 3: Set a module background via the dashboard; open the kiosk; navigate to that module — confirm the background is visible immediately with no flicker

**Risk:** Low. Non-blocking pre-fetch. If it fails, the startup still completes and modules degrade gracefully.

---

### ~~V4-2.3 — Add in-memory EventConfig cache to kiosk (GAP-07)~~ ✅

**What:** Currently, the kiosk re-fetches `EventConfig` from the backend on every new guest session start. With `StartupLoader` now owning the initial fetch, extend `EventConfigContext` to hold the config in memory and only re-fetch when explicitly refreshed. This removes the per-session network dependency and makes the kiosk resilient to brief network interruptions mid-event.

**Files:**
- Read first: `apps/frontend/src/contexts/EventConfigContext.tsx`
- `apps/frontend/src/contexts/EventConfigContext.tsx` (modify)

**Input:** V4-2.1 complete (StartupLoader owns the initial fetch).

**Output:**
- `EventConfigContext` stores the last-fetched config in memory (React state or a module-level variable).
- The context exposes a `refreshConfig()` function that re-fetches from the backend — this is called by `StartupLoader` at startup.
- On each guest session start (Welcome screen tap), the kiosk uses the in-memory config — no new network call.
- The context does NOT auto-refresh on a timer in V4 — refreshing is explicit (startup only). This is a deliberate simplification.

**Verification:**
- Layer 1: Lint changed file — no errors
- Layer 2: n/a
- Layer 3: Start the kiosk; disconnect the network cable; complete a full guest session — confirm the session runs without config-fetch errors (uses cached config)

**Risk:** Low. The in-memory config is exactly what was already fetched. No staleness risk — the operator can always restart the kiosk if they need to pick up a new config mid-event.

---

### ~~V4-2.4 — Add KioskSettings screen for event ID selection (MULTI-01)~~ ✅

**What:** Add an admin-only settings screen accessible via `Ctrl+Shift+S`. The operator can enter the event ID and save it to `kiosk.config.json`. This eliminates manual JSON file editing for event pairing.

**Files:**
- Read first: `apps/frontend/src/main.ts` (understand how keyboard shortcuts are currently handled)
- Read first: `apps/frontend/src/preload.ts` (IPC bridge — understand what `electronAPI` exposes)
- `apps/frontend/src/components/KioskSettings.tsx` (new)
- `apps/frontend/src/main.ts` (register `Ctrl+Shift+S` global shortcut → IPC to renderer to open settings)
- `apps/frontend/src/preload.ts` (expose `electronAPI.openSettings()` and `electronAPI.saveKioskConfig(config)`)

**Input:** V4-2.1 complete.

**Output:**
- `KioskSettings` is a full-screen overlay (rendered on top of the current screen, not a new route).
- It renders:
  - Current event ID (read-only)
  - Current API base URL (read-only)
  - Input field for new event ID
  - "Save & Reconnect" button → calls `electronAPI.saveKioskConfig({ eventId: newId })` → triggers `StartupLoader` to re-run (re-fetch config with new event ID)
  - "Close" button (or press Escape) to dismiss without saving
- PIN gate: on opening, prompt for a 4-digit PIN. The PIN is set via `KIOSK_ADMIN_PIN` env var at build time (default: `0000`). Three failed attempts lock the screen for 30 seconds.
- If `KIOSK_ADMIN_PIN` is not set at build time (i.e. the value is `0000`), log a `console.warn('KIOSK_ADMIN_PIN is using the default value — set it before deploying to production')` in `main.ts` on startup. This makes it obvious in dev logs if the env var was forgotten.
- `electronAPI.saveKioskConfig(updates)` in `main.ts` reads `kiosk.config.json`, merges `updates`, and writes back.

**Verification:**
- Layer 1: Lint all changed files — no errors
- Layer 2: n/a (Electron IPC is not unit-testable here)
- Layer 3: Press `Ctrl+Shift+S` during a running session; enter PIN; change event ID; confirm app re-fetches config for the new event; confirm the old event's flow is no longer shown

**Risk:** Medium. Modifies `main.ts` (Electron main process) and the IPC bridge. Test on the actual Electron build — Vite dev server may behave differently.

---

## Phase 3 — Per-Module Customization — Types + Kiosk

### ~~V4-3.1 — Add `ModuleCustomization` type and define element catalogs per module~~ ✅

**What:** Add the `ElementCustomization` and `ModuleCustomization` interfaces to `@photobooth/types`. Add an optional `customization` field to every module config type. Also define the canonical element key catalog per module (the named UI elements each module exposes for customization).

**Files:**
- Read first: all six module files to identify every rendered element that should be customizable:
  - `apps/frontend/src/modules/WelcomeModule.tsx`
  - `apps/frontend/src/modules/ThemeSelectionModule.tsx`
  - `apps/frontend/src/modules/CameraModule.tsx`
  - `apps/frontend/src/modules/AiGenerationModule.tsx`
  - `apps/frontend/src/modules/FormModule.tsx`
  - `apps/frontend/src/modules/ResultModule.tsx`
- `packages/types/src/module-config.ts`

**Input:** V4-2.4 complete.

**Output:**

Add to `module-config.ts`:
```typescript
export interface ElementCustomization {
  copy?: string;   // text override for this element (if it renders text)
  css?: string;    // raw CSS string applied to this specific element
}

export interface ModuleCustomization {
  elements?: Record<string, ElementCustomization>;  // keyed by element name
}
```

Add `customization?: ModuleCustomization` to every module config interface (or to `BaseModuleConfig` — read the file to decide which is cleaner).

After reading all six module files, produce the canonical element key catalog as a code comment block in `module-config.ts`. Example (verify against actual components):
```typescript
// Element key catalogs per module:
// WelcomeModule:        ctaButton
// ThemeSelectionModule: header, themeCard (applies to all theme cards)
// CameraModule:         header, captureButton, retakeButton, nextButton
// AiGenerationModule:   header, statusText
// FormModule:           header, submitButton
// ResultModule:         header, downloadButton, printButton, qrLabel
```
The actual keys must match what's in the components — derive them from reading the files, not from this spec.

TypeScript compiles in both apps with no new errors.

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: `pnpm wb test` — all existing tests pass
- Layer 3: n/a (no runtime effect yet)

**Risk:** Low. Additive optional field. No runtime changes.

---

### ~~V4-3.2 — Add `slideshowItems` and result feature flags to module config types~~ ✅

**What:** Add `slideshowItems` to `AiGenerationModuleConfig` and add `emailEnabled`, `qrCodeEnabled`, `printEnabled` to `ResultModuleConfig`.

**Files:**
- `packages/types/src/module-config.ts`

**Input:** V4-3.1 complete.

**Output:**

In `AiGenerationModuleConfig`, add:
```typescript
slideshowItems?: {
  imageUrl?: string;
  caption?: string;
}[];
```

In `ResultModuleConfig`, add:
```typescript
emailEnabled?: boolean;    // undefined treated as true (backward compatible)
qrCodeEnabled?: boolean;   // undefined treated as true
printEnabled?: boolean;    // undefined treated as true
```

Type them as `boolean | undefined` (`?:`) so TypeScript is honest about the fact that existing DB configs will not have these fields. The kiosk coerces: `config.emailEnabled ?? true`. Do NOT type them as `boolean` — that would lie to TypeScript and cause errors at the coercion site.

New event configs created after V4 should explicitly set all three to `true` in the event creation/seeding flow (tracked in V4-4.2).

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: `pnpm wb test` — all existing tests pass
- Layer 3: n/a (runtime effect comes in V4-3.3 and V4-3.4)

**Risk:** Low. Additive optional fields. `?:` is the correct typing — no TypeScript coercion issues.

---

### ~~V4-3.3 — Apply per-element `customization` (css + copy) in kiosk module components~~ ✅

**What:** Each module component reads `moduleConfig.customization.elements` and applies each element's `css` and `copy` to the corresponding rendered element. The element keys were defined in V4-3.1 by reading the actual component files.

**Files:**
- `apps/frontend/src/modules/WelcomeModule.tsx`
- `apps/frontend/src/modules/ThemeSelectionModule.tsx`
- `apps/frontend/src/modules/CameraModule.tsx`
- `apps/frontend/src/modules/AiGenerationModule.tsx`
- `apps/frontend/src/modules/FormModule.tsx`
- `apps/frontend/src/modules/ResultModule.tsx`
- `apps/frontend/src/hooks/useElementCustomization.ts` (new utility hook)

**Input:** V4-3.1 complete (types and element key catalog defined).

**Output:**

**Mechanism: scoped `<style>` tag injection per element.**

Each customizable element has a stable, deterministic class name in the format `pb-<moduleId>-<elementKey>` (e.g. `pb-welcome-ctaButton`, `pb-camera-retakeButton`). This class is added alongside the element's existing Tailwind classes. A `<style>` tag injected at the top of each module renders the user's raw CSS string targeting that class:

```tsx
// inside WelcomeModule:
const ctaButtonCss = config.customization?.elements?.ctaButton?.css
const ctaButtonCopy = config.customization?.elements?.ctaButton?.copy ?? 'Tap to Start'

return (
  <div>
    {ctaButtonCss && (
      <style>{`.pb-welcome-ctaButton { ${ctaButtonCss} }`}</style>
    )}
    <button className="pb-welcome-ctaButton ...existing tailwind classes...">
      {ctaButtonCopy}
    </button>
  </div>
)
```

This approach requires zero parsing — the browser handles the CSS as-is, including `hover:`, `transition`, `::placeholder`, and any other valid CSS. The `pb-` prefix and deterministic class names ensure the injected styles never bleed into other elements.

Create `useElementCustomization(customization, moduleId, elementKey, defaultCopy?)` as a small hook that returns `{ copy: string; styleTag: React.ReactNode }`:
- `copy`: `customization?.elements?.[elementKey]?.copy ?? defaultCopy ?? ''`
- `styleTag`: a `<style>` element if `customization?.elements?.[elementKey]?.css` is set, else `null`

Each module calls this hook once per customizable element and renders the returned `styleTag` alongside the element.

If `customization` is absent or a key has no entry, behavior is fully unchanged — the default copy is used and no `<style>` tag is rendered.

**Verification:**
- Layer 1: Lint all changed files — no errors
- Layer 2: n/a
- Layer 3: Manually set `customization.elements.ctaButton.copy = "Touch to Begin"` and `customization.elements.ctaButton.css = "background-color: red; border-radius: 0; color: white;"` in the event config JSON in Supabase for the Welcome module; launch the kiosk — confirm the button shows "Touch to Begin" with a red background; confirm no other elements are affected

**Risk:** Low. Additive — no `<style>` tag is rendered if `css` is absent. The `pb-` prefixed class name on each element is a purely additive class alongside existing Tailwind classes.

---

### ~~V4-3.4 — Apply result feature flags and AI loading slideshow in kiosk~~ ✅

**What:** Wire up the V4-3.2 type fields in the kiosk. Result module gates email/QR/print on the config flags. AI Generation module renders `slideshowItems` during loading.

**Files:**
- `apps/frontend/src/modules/ResultModule.tsx`
- `apps/frontend/src/modules/AiGenerationModule.tsx`

**Input:** V4-3.2 complete.

**Output:**

**ResultModule.tsx:**
- Read `emailEnabled`, `qrCodeEnabled`, `printEnabled` from the module config (coerce `undefined → true`).
- Wrap each action in a conditional: only call the email API / show QR / trigger print if the respective flag is `true`.
- If `printEnabled === false`, do not call `electronAPI.print()`. If `qrCodeEnabled === false`, hide the QR code element. If `emailEnabled === false`, skip the email submission.

**AiGenerationModule.tsx:**
- Read `slideshowItems` from the module config.
- If `slideshowItems` has ≥ 1 item: render an animated slideshow (cycling through items at a fixed interval, e.g. 4s per item). Show `imageUrl` as a full-bleed image (if present) and `caption` as overlay text.
- When AI generation completes, navigate to the result immediately — do not wait for the current slideshow item to finish. The slideshow is decorative; the result is the priority.
- If `slideshowItems` is empty/undefined: render the existing static loading UI (no regression).

**Verification:**
- Layer 1: Lint changed files — no errors
- Layer 2: n/a
- Layer 3a: Set `printEnabled: false` in an event config; run a session on the kiosk — confirm no print is triggered on result screen
- Layer 3b: Add a slideshow item with an image URL; run a session through AI generation — confirm the slideshow appears while waiting for the result

**Risk:** Low. Conditionally applying existing logic. The print flag is the most critical — verify it doesn't print when disabled.

---

## Phase 4 — Per-Module Customization — Dashboard

> **Before starting Phase 4:** Read the flow builder route file and each module's config panel component to understand the current dashboard implementation. The tasks below assume a panel-based architecture (each module card expands inline). Adjust file list if the actual implementation differs.

### ~~V4-4.1 — Add per-element customization panels to each module in the flow builder~~ ✅

**What:** Add a collapsible "Customization" section to each module's config panel in the flow builder. It lists each of that module's named elements (from the catalog defined in V4-3.1) with a copy text input and a CSS textarea per element.

**Files:**
- Read first: `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx` (or equivalent flow builder route)
- Read first: each module config panel component (if they are separate components)

**Input:** V4-3.3 complete (kiosk side is wired up). Element key catalog is defined in `packages/types/src/module-config.ts`.

**Output:**
- Each module panel gains a collapsible "Customization" section (collapsed by default).
- Inside: one row per customizable element, labeled with a human-readable name (e.g. "CTA Button", "Header", "Retake Button"). Each row has:
  - A text input for `copy` (placeholder: current default text, e.g. "Tap to Start")
  - A `<textarea>` for `css` (placeholder: `color: red; font-size: 20px`)
- On change: updates `moduleConfig.customization.elements[elementKey].copy` and `.css` in the local draft; saved via the existing PATCH config mechanism.
- Empty/unset fields are not written to the config (do not set `copy: ""` — omit the key entirely so the kiosk uses its default).

**Verification:**
- Layer 1: Lint changed files — no errors
- Layer 2: n/a
- Layer 3: Open the flow builder for a test event; expand the Welcome module panel; open the Customization section; set the CTA Button copy to "Touch to Begin" and css to `background-color: navy`; save; open the kiosk — confirm the button shows the new text with a navy background

**Risk:** Medium. Requires understanding the current panel component structure before editing. The element catalog must match what V4-3.1 defined — do not introduce new element keys here.

---

### ~~V4-4.2 — Add result feature flag toggles to the result module panel~~ ✅

**What:** Add email/QR/print toggles to the Result module's config panel in the flow builder.

**Files:**
- Read first: flow builder route / result module panel component

**Input:** V4-3.4 complete.

**Output:**
- Result module panel shows three toggles: "Send email to guest", "Show QR code", "Enable printing".
- Each toggle maps to `resultModuleConfig.emailEnabled`, `qrCodeEnabled`, `printEnabled`.
- Defaults to `true` for any new event.
- Also update the new-event creation/seeding flow (read the event creation code to find where default `moduleFlow` is built) to explicitly set all three flags to `true` on the Result module. This ensures new events are consistent rather than relying on `undefined → true` coercion.

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: n/a
- Layer 3a: Toggle printing off in the dashboard; run a kiosk session — confirm no print
- Layer 3b: Create a new event from scratch; confirm its result module config in Supabase has `emailEnabled: true`, `qrCodeEnabled: true`, `printEnabled: true` explicitly set

**Risk:** Low. Additive UI for an already-implemented kiosk behavior. The new-event seeding change is the only non-obvious file to find — read the code first.

---

### ~~V4-4.3 — Add AI loading slideshow editor to the AI generation module panel~~ ✅

**What:** Add a slideshow items editor to the AI Generation module's config panel. Supports adding, removing, and reordering items (image URL and caption per item).

**Files:**
- Read first: flow builder route / AI generation module panel component

**Input:** V4-3.4 complete.

**Output:**
- AI Generation module panel has a "Loading Screen Slideshow" section (below the themes config).
- Each item shows: an image URL input field + optional upload button (using the existing `POST /api/assets/upload` endpoint), and a caption text input.
- "Add item" button appends a new empty item. "Remove" button removes a row.
- For reordering: check `apps/web/package.json` first. If a drag library (e.g. `@dnd-kit/core`, `react-beautiful-dnd`) is already used by the flow builder's module reordering — use the same one. If none exists, use simple up/down arrow buttons instead — do not add a new dependency for this one feature.
- Saved to `moduleConfig.slideshowItems` via the existing PATCH config mechanism.

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: n/a
- Layer 3: Add two slideshow items (images + captions) in the dashboard; run a kiosk session through AI generation — confirm the slideshow cycles through both items during loading

**Risk:** Low. UI-only addition to an existing panel pattern.

---

## Phase 5 — Dashboard Consolidation

> **Before starting Phase 5:** Read the event detail page and all current tab/section routes (`config.tsx`, `assets.tsx`, flow builder) to understand the full current navigation structure. The tasks below specify the target state — map the delta against what currently exists before touching any files.

### ~~V4-5.1 — Move asset upload slots into flow builder module panels~~ ✅

**What:** Move all asset upload functionality from the standalone Assets page into the relevant module panels in the flow builder. The Assets page is then removed.

**Files:**
- Read first: `apps/web/src/routes/dashboard/_layout.events.$eventId.assets.tsx`
- Read first: flow builder route
- **Before writing any code:** check if `AssetSlot` is already a standalone reusable component or if it is inlined into the assets route. If it is inlined, extract it into `apps/web/src/components/AssetSlot.tsx` as a first step — then move it into the flow builder panels. Do not try to move and extract in a single pass.
- `apps/web/src/components/AssetSlot.tsx` (new, if extraction is needed)
- Flow builder route (modify)
- `apps/web/src/routes/dashboard/_layout.events.$eventId.assets.tsx` (delete or redirect)
- Event detail index page (remove Assets card/link)

**Input:** V4-4.3 complete.

**Output:**
- Background image upload → moves into each module's panel (using the same `<AssetSlot>` component pattern from the assets page)
- Frame image, template image, preview image uploads → move into the AI Generation and Theme Selection module panels
- Logo upload → stays on the Branding tab (it is event-level, not module-level)
- The `/dashboard/events/$eventId/assets` route either returns a redirect to the flow builder or is deleted entirely
- The "Assets" card is removed from the event detail overview page

**Verification:**
- Layer 1: Lint all changed files — no errors
- Layer 2: n/a
- Layer 3: Navigate to the event detail page — confirm no Assets card; open the flow builder — confirm background image upload is available in each module panel; upload a background image and verify it saves correctly

**Risk:** High. Significant dashboard refactor — moving existing functionality to a new location. Verify every asset slot is accessible after the move. Do not delete the assets route until all slots are confirmed working in the flow builder.

---

### ~~V4-5.2 — Move module-specific config into flow builder panels; remove standalone tabs~~ ✅

**What:** Move form fields, printer config, and AI provider config from their standalone tabs into the relevant module panels. Remove the standalone AI Config, Form Fields, and Tech Config tabs from the event detail navigation.

**Files:**
- Read first: `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx` (or equivalent tabs)
- Read first: flow builder route
- Flow builder route (modify — add Form Fields section to Form module panel, printer config to Result module panel, AI provider to AI Generation module panel)
- Remove or redirect the standalone config route(s)
- Event detail index/layout (remove navigation links to removed tabs)

**Input:** V4-5.1 complete.

**Output:**
- Form module panel: field toggles (name/email/phone on/off) and field order (if reorder is implemented)
- Result module panel: printer device name input (moved from Tech Config)
- AI Generation module panel: AI provider toggle (Google / Replicate) — already present in some form, verify
- Inactivity timeout: move to the Branding tab as a standalone field (it is event-level, not tied to any single module — Branding is the remaining event-level tab after consolidation)
- The standalone AI Config, Form Fields, and Tech Config routes either redirect to flow builder or are removed

**Verification:**
- Layer 1: Lint all changed files — no errors
- Layer 2: n/a
- Layer 3: Navigate to the event detail page — confirm only Overview, Flow Builder, Branding, Guests, Photos remain; open flow builder — confirm all previously-standalone config is accessible inline

**Risk:** High. This is the most disruptive dashboard change. Back up affected routes before editing. Verify that every previously-configurable field is still reachable in the new structure.

---

## Phase 6 — Analytics

### ~~V4-6.1 — Add analytics server function and dashboard page~~ ✅

**What:** Create an analytics section in the event detail page showing: total visits, unique guests, returning guests, and a daily visit trend (last 30 days).

**Files:**
- Read first: `apps/web/src/routes/dashboard/_layout.events.$eventId.guests.tsx` (understand how guest data is queried — analytics reuses the `users` table)
- `apps/web/src/routes/dashboard/_layout.events.$eventId.analytics.tsx` (new route)
- `apps/web/src/routes/dashboard/_layout.events.$eventId.index.tsx` (add Analytics card/link)

**Input:** V4-5.2 complete.

**Output:**

Server function `getEventAnalytics({ eventId })`:

The Supabase JS client does not support `GROUP BY` or aggregate functions natively. Use an `.rpc()` call to a Postgres function:

```sql
-- Run in Supabase SQL editor and commit as a migration file:
CREATE OR REPLACE FUNCTION get_event_analytics(p_event_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_visits',     COALESCE(SUM(visit_count), 0),
    'unique_guests',    COUNT(*),
    'returning_guests', COUNT(*) FILTER (WHERE visit_count > 1),
    'daily_trend',      (
      SELECT json_agg(row_to_json(d) ORDER BY d.date)
      FROM (
        SELECT
          DATE(created_at AT TIME ZONE 'UTC')::text AS date,
          SUM(visit_count)::int AS visits
        FROM users
        WHERE event_id = p_event_id
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ) d
    )
  ) INTO result
  FROM users
  WHERE event_id = p_event_id;

  RETURN result;
END;
$$;
```

The TypeScript server function calls `.rpc('get_event_analytics', { p_event_id: eventId })` and returns the result. Zero-fill missing days in the server function or in the server-side handler before sending to the client (iterate over last 30 dates, merge with DB result, default missing days to 0).

Analytics page (`/dashboard/events/$eventId/analytics`):
- Stat cards: Total Visits, Unique Guests, Returning Guests
- A bar chart for the daily visit trend. **Use CSS-only bars unless a chart library already exists in `apps/web/package.json` — check before adding any new dependency.** A CSS bar chart: a `<div>` per day, height proportional to max daily visits, with a date label below.
- The chart shows the last 30 days, zero-filled for days with no visits.

Event detail overview index: add an "Analytics" card alongside the existing cards.

**Verification:**
- Layer 1: Lint new and changed files — no errors
- Layer 2: n/a
- Layer 3: For a test event with known visit data (e.g. 3 guests, 1 returning → total_visits: 4, unique: 3, returning: 1), navigate to the Analytics page — confirm stat cards match; confirm the trend chart renders with the correct day highlighted

**Risk:** Low-medium. Read-only data display. No writes. The RPC function must be deployed to Supabase before the code — run in SQL editor first, verify with `SELECT get_event_analytics('evt_test')`, then commit the migration file.

---

## Phase 7 — Electron Auto-Update

> **Architecture note:** Updates are served from Supabase S3-compatible static storage. Use `update-electron-app@^3.x` with `UpdateSourceType.StaticStorage` — this reads static manifest files (e.g., `RELEASES` on Windows) directly from a public S3 URL, no dedicated update server required. Do NOT use `electron-updater` (adds an unnecessary dependency from the `electron-builder` ecosystem); do NOT use `update-electron-app@^2.x` which required a dynamic Squirrel-protocol server. The v3 `StaticStorage` mode is the correct, minimal choice here.

> **Key design rule:** The update URL is constructed by a shared `getUpdateBaseUrl()` function used in **both** `forge.config.ts` (build-time, embedded into the installer) and `auto-update.ts` (runtime check). These two paths must produce identical URLs or updates will silently fail. Never hardcode the URL in one place and derive it in another.

---

### V4-7.0 — Code signing setup (hard prerequisite for V4-7.1 and V4-7.2)

**What:** Configure code signing in `forge.config.ts` for Windows. macOS signing is deferred (see V4-7.2 scope note). Without a signed Windows installer, Squirrel.Windows will refuse to auto-update — this blocks V4-7.1 and V4-7.2 from being verified end-to-end.

**What needs to happen outside of code (business prerequisites):**
- Obtain a Windows code signing certificate. Options:
  - **EV certificate** (Extended Validation) — required for zero-SmartScreen-warning installs. Vendors: DigiCert, Sectigo, GlobalSign. Cost: ~$300–500/year. Requires company verification (3–10 business days).
  - **Standard OV certificate** — cheaper but triggers SmartScreen on first installs until reputation builds. Not recommended for kiosk deployments.
- The certificate is issued as a `.pfx` file + password. Store these securely — never commit to git.

**Files:**
- `apps/frontend/forge.config.ts`
- `apps/frontend/.gitignore` (ensure `*.pfx` and `.env.secret` are listed)

**Output — `apps/frontend/forge.config.ts` additions:**

```typescript
// Windows code signing — runs during `electron-forge make`
// Certificate path and password come from .env.secret (never bundled into the app)
new MakerSquirrel((arch) => ({
  // ... existing options (remoteReleases etc. added in V4-7.2) ...
  certificateFile: process.env.WIN_CERT_PATH,          // path to .pfx file
  certificatePassword: process.env.WIN_CERT_PASSWORD,  // pfx password
})),
```

Add to `.env.secret`:
```
WIN_CERT_PATH=/path/to/certificate.pfx
WIN_CERT_PASSWORD=your-pfx-password
```

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: n/a
- Layer 3: Run `pnpm fe make` on a Windows machine (or Windows CI). Open the produced installer — Windows should NOT show a SmartScreen "Unknown publisher" warning (EV cert) or show it only once (OV cert). Confirm the installer runs without UAC bypass errors. Do NOT proceed to V4-7.1 or V4-7.2 until this passes.

**Risk:** High. This task has non-code dependencies (certificate purchase, company verification). It cannot be unblocked by code changes alone. Plan for 1–2 weeks lead time for EV certificate issuance.

---

### V4-7.1 — Implement auto-update in the app (update-electron-app + IPC + banner)

**What:** Add `update-electron-app` v3 to the frontend app. On startup (production builds only), silently check for updates against the Supabase S3 bucket. If a new version is available and downloaded, send an IPC event to the renderer to show a non-intrusive operator-facing banner. Expose `checkForUpdatesManually()` via IPC for the admin page. Do NOT use `notifyUser: true` — native dialogs interrupt guest sessions.

**Packages to add:**
- `update-electron-app@^3.1.2` → `dependencies`
- `electron-log` → `dependencies` (logger for `update-electron-app`)
- `dotenv` → `dependencies` (loads bundled `.env` into `process.env` in the main process at runtime)

**Files:**
- Read first: `apps/frontend/src/main.ts`
- Read first: `apps/frontend/src/preload.ts`
- Read first: `apps/frontend/forge.config.ts`
- New: `apps/frontend/src/utils/auto-update.ts`
- `apps/frontend/package.json` (add packages above)
- `apps/frontend/src/main.ts` (call `setupAutoUpdater()` on app ready, production only; add IPC handlers)
- `apps/frontend/src/preload.ts` (expose `onUpdateDownloaded`, `checkForUpdates`, `quitAndInstall`)
- `apps/frontend/src/App.tsx` or app root (render update banner when `onUpdateDownloaded` fires)

**Input:** V4 Phase 6 complete. Code signing confirmed working (`pnpm fe make` produces a signed installer). Supabase S3 bucket exists with paths defined in V4-7.2.

**Output — `apps/frontend/src/utils/auto-update.ts`:**
```typescript
import { updateElectronApp, UpdateSourceType } from "update-electron-app";
import { autoUpdater } from "electron";
import log from "electron-log";

/** Constructs the base public update URL from env vars.
 *  Used at runtime. Must produce the same path as forge.config.ts getUpdateBaseUrl(). */
function getUpdateBaseUrl(): string | null {
  const supabaseUrl = process.env.VITE_SUPABASE_URL; // e.g. https://xxx.supabase.co
  const bucket = process.env.SUPABASE_S3_BUCKET;
  if (!supabaseUrl || !bucket) return null;
  try {
    const url = new URL(supabaseUrl);
    return `${url.protocol}//${url.host}/storage/v1/object/public/${bucket}/app-updates`;
  } catch {
    return null;
  }
}

export function setupAutoUpdater(
  onUpdateDownloaded: (version: string) => void
): void {
  const base = getUpdateBaseUrl();

  if (!base) {
    log.info("[auto-update] VITE_SUPABASE_URL or SUPABASE_S3_BUCKET not set — skipping");
    return;
  }

  const updateUrl = `${base}/${process.platform}/${process.arch}`;

  if (!updateUrl.startsWith("https://")) {
    log.warn("[auto-update] Update URL is not HTTPS — skipping");
    return;
  }

  log.info(`[auto-update] Setting up with URL: ${updateUrl}`);

  updateElectronApp({
    updateSource: { type: UpdateSourceType.StaticStorage, baseUrl: updateUrl },
    updateInterval: "1 hour",
    notifyUser: false, // intentional — we show a custom kiosk banner instead
    logger: log,
  });

  autoUpdater.on("update-downloaded", (_event, _notes, releaseName) => {
    log.info(`[auto-update] Update downloaded: ${releaseName}`);
    onUpdateDownloaded(releaseName ?? "");
  });
}

export function checkForUpdatesManually(): void {
  const base = getUpdateBaseUrl();

  if (!base) {
    log.warn("[auto-update] checkForUpdatesManually: env vars not set");
    return;
  }

  const updateUrl = `${base}/${process.platform}/${process.arch}`;

  if (!updateUrl.startsWith("https://")) {
    log.warn("[auto-update] checkForUpdatesManually: URL is not HTTPS");
    return;
  }

  autoUpdater.checkForUpdates();
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
```

**Output — `apps/frontend/src/main.ts`:**

> **Critical:** `auto-update.ts` reads `process.env.VITE_SUPABASE_URL` and `process.env.SUPABASE_S3_BUCKET` from the main process. In a packaged Electron app, `extraResource` files land on disk at `process.resourcesPath` but are **not** automatically parsed into `process.env` — the Node.js main process has no knowledge of Vite's env injection. You must load them with `dotenv` before any `process.env` read. Add `dotenv` to `dependencies` in `apps/frontend/package.json`.

- At the very top of `main.ts`, immediately after the existing imports, add:
  ```typescript
  import dotenv from "dotenv";

  // In packaged builds, load the bundled .env from extraResource into process.env.
  // Must happen before any process.env read (KIOSK_ADMIN_PIN, auto-update env vars, etc.)
  // Dev: Vite handles env vars via import.meta.env — do not run dotenv in dev.
  if (process.env.NODE_ENV !== "development") {
    dotenv.config({ path: path.join(process.resourcesPath, ".env") });
  }
  ```
  Use `process.env.NODE_ENV !== "development"` directly here (not `isDev`) because `isDev` is defined later in the file using this same value.

- Import from `auto-update.ts` and call after `createWindow()`, in the `app.on("ready", ...)` handler:
  ```typescript
  if (!isDev) {
    setupAutoUpdater((version) => {
      const [win] = BrowserWindow.getAllWindows();
      if (win) win.webContents.send("update-downloaded", { version });
    });
  }
  ```
- Add IPC handlers (alongside the existing handlers at the bottom of `main.ts`):
  ```typescript
  ipcMain.handle("check-for-updates", () => {
    checkForUpdatesManually();
  });
  ipcMain.handle("quit-and-install", () => {
    quitAndInstall();
  });
  ```

**Output — `apps/frontend/src/preload.ts`:**
- Add to the `contextBridge.exposeInMainWorld("electronAPI", { ... })` object:
  ```typescript
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on("update-downloaded", (_event, info: { version: string }) => callback(info));
    return () => ipcRenderer.removeAllListeners("update-downloaded");
  },
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
  ```

**Output — update banner (app root or layout component):**
- Add `updateInfo: { version: string } | null` state (default `null`).
- On mount: call `window.electronAPI?.onUpdateDownloaded((info) => setUpdateInfo(info))`.
- When `updateInfo !== null`, render a banner **fixed to the bottom of the screen**:
  - Text: `"Version {version} is ready. Restart the kiosk to apply."` (small font)
  - "Restart Now" button → calls `window.electronAPI?.quitAndInstall()`
  - "Later" button → `setUpdateInfo(null)` (dismisses)
  - Style: operator-facing — dark background, small text, distinct from guest UI
  - Must not block guest interaction — use `pointer-events: none` on the wrapper and `pointer-events: auto` only on the banner element itself; keep `z-index` high enough to appear above all guest screens.

**Env vars (bundled into packaged app via `.env` in `packagerConfig.extraResource`):**
```
VITE_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_S3_BUCKET=photobooth-bucket
```
These are public infrastructure constants — same across all kiosks. They belong in the bundled `.env`, not in `kiosk.config.json`.

> **Side-benefit:** The dotenv loading added above also fixes the existing `KIOSK_ADMIN_PIN` read in `main.ts` — it was previously always defaulting to `"0000"` in packaged builds because the bundled `.env` was never loaded into `process.env`.

**Verification:**
- Layer 1: Lint all changed files — no errors
- Layer 2: n/a
- Layer 3: Cannot fully verify without a signed build + published release (see V4-7.2). Verify wiring by code review: `setupAutoUpdater()` is only called when `!isDev`, IPC channels are registered, banner renders correctly by temporarily forcing `updateInfo` to a test value in a dev build. Check `electron-log` output in a production build to confirm `[auto-update] Setting up with URL: https://...` is logged (not the "env vars not set — skipping" path).

**Risk:** High. Cannot be tested end-to-end without code signing and a production build. The `notifyUser: false` path means any bug in the IPC wiring silently produces no banner — verify the `update-downloaded` event fires by checking `electron-log` output during a test update cycle.

---

### V4-7.2 — Release pipeline: forge config + S3 publisher + `release.ts` script

**What:** Configure `@electron-forge/publisher-s3` in forge config with the correct Supabase-specific options (including `s3ForcePathStyle: true` — required for Supabase), embed the update URL into the installer at build time, and write an interactive `scripts/release.ts` CLI that bumps the version, publishes, and rolls back `package.json` on failure. After this task, `pnpm fe release` is the single command to cut a release.

**Packages to add (devDependencies):**
- `@electron-forge/publisher-s3@^7.10.2`

**Files:**
- Read first: `apps/frontend/forge.config.ts`
- Read first: `apps/frontend/package.json`
- `apps/frontend/forge.config.ts` (add `publishers`, update makers with build-time URL, add `getUpdateBaseUrl()`)
- `apps/frontend/package.json` (add `release` script)
- New: `apps/frontend/scripts/release.ts` (interactive release CLI)
- `apps/frontend/.gitignore` (add `.env.secret`)

**Supabase bucket prerequisite — public read access for `app-updates/`:**

Before publishing, the `photobooth-bucket` in Supabase Storage must have a public read policy on `app-updates/**`. Kiosks fetch the `RELEASES` manifest and installer without credentials — a 401/403 here silently blocks all updates.

Run this in the Supabase SQL editor:
```sql
-- Allow anyone to read files under app-updates/ in photobooth-bucket
CREATE POLICY "public read app-updates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photobooth-bucket' AND name LIKE 'app-updates/%');
```

Or in the Supabase dashboard: Storage → `photobooth-bucket` → Policies → Add policy → "Allow public read on app-updates path".

Verify: after the first publish, open the `RELEASES` URL in a browser (no auth). It must return the manifest content, not a 403.

**S3 bucket folder structure:**
```
photobooth-bucket/
└── app-updates/
    ├── darwin/
    │   └── arm64/
    │       ├── RELEASES                ← macOS manifest (update-electron-app reads this)
    │       └── photobooth-app-X.Y.Z-arm64-mac.zip
    └── win32/
        └── x64/
            ├── RELEASES                ← Squirrel.Windows manifest (update-electron-app reads this)
            ├── photobooth-app-X.Y.Z Setup.exe
            └── photobooth-app-X.Y.Z-full.nupkg
```

**Output — `apps/frontend/forge.config.ts` additions:**

Add a `getUpdateBaseUrl()` helper at the top of the file (mirrors the one in `auto-update.ts` — both must produce the same URL):
```typescript
import dotenv from "dotenv";
// .env contains the public build-time vars (VITE_SUPABASE_URL, SUPABASE_S3_BUCKET).
// .env.secret contains S3 credentials — gitignored, only needed at publish time.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.secret", override: false });

function getUpdateBaseUrl(): string | undefined {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const bucket = process.env.SUPABASE_S3_BUCKET;
  if (!supabaseUrl || !bucket) return undefined;
  try {
    const url = new URL(supabaseUrl);
    return `${url.protocol}//${url.host}/storage/v1/object/public/${bucket}/app-updates`;
  } catch {
    return undefined;
  }
}

const updateBaseUrl = getUpdateBaseUrl();
// Use an explicit PUBLISHING flag rather than NODE_ENV so that running
// `electron-forge publish` directly (without going through release.ts)
// does not silently embed a wrong/missing URL into the installer.
// release.ts sets PUBLISHING=true in the execSync env.
const isPublishing = process.env.PUBLISHING === "true";
```

Update makers to embed the URL into the installer at build time:

> **Merge note:** V4-7.0 adds `certificateFile` and `certificatePassword` to `MakerSquirrel`. When implementing this task, merge both sets of options into a single function-form constructor — do not overwrite the signing config:

```typescript
// Windows: merge signing config (from V4-7.0) + update URL (from V4-7.2)
new MakerSquirrel((arch) => ({
  certificateFile: process.env.WIN_CERT_PATH,
  certificatePassword: process.env.WIN_CERT_PASSWORD,
  remoteReleases:
    isPublishing && updateBaseUrl
      ? `${updateBaseUrl}/win32/${arch}`
      : undefined,
})),

// macOS: tells autoUpdater where the manifest lives
new MakerZIP((arch) => ({
  macUpdateManifestBaseUrl:
    isPublishing && updateBaseUrl
      ? `${updateBaseUrl}/darwin/${arch}`
      : undefined,
})),
```

Add `publishers` array:
```typescript
import { PublisherS3 } from "@electron-forge/publisher-s3";

publishers: [
  new PublisherS3({
    bucket: process.env.SUPABASE_S3_BUCKET!,
    endpoint: process.env.SUPABASE_S3_ENDPOINT!,   // S3-compatible API endpoint, e.g. https://<project>.supabase.co/storage/v1/s3
    region: process.env.SUPABASE_S3_REGION!,        // e.g. ap-southeast-1
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY!,
    s3ForcePathStyle: true,  // REQUIRED for Supabase — without this the SDK uses virtual-hosted URLs that Supabase doesn't support
    public: true,
    keyResolver: (filename, platform, arch) =>
      `app-updates/${platform}/${arch}/${filename}`,
  }),
],
```

**Output — `apps/frontend/scripts/release.ts`:**

Interactive CLI with version bump, git commit + tag, and full rollback on failure:
```typescript
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const pkgPath = new URL("../package.json", import.meta.url).pathname;

function git(cmd: string): void {
  execSync(`git ${cmd}`, { stdio: "inherit" });
}

async function main() {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
  const [major, minor, patch] = pkg.version.split(".").map(Number);

  const rl = readline.createInterface({ input, output });
  const bumpType = await rl.question(
    `Current version: ${pkg.version}\nBump type (patch/minor/major): `
  );

  let newVersion: string;
  if (bumpType === "major") newVersion = `${major + 1}.0.0`;
  else if (bumpType === "minor") newVersion = `${major}.${minor + 1}.0`;
  else newVersion = `${major}.${minor}.${patch + 1}`;

  const confirm = await rl.question(
    `Bump to ${newVersion} and publish? (y/N): `
  );
  rl.close();

  if (confirm.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  // Write new version
  const updated = { ...pkg, version: newVersion };
  writeFileSync(pkgPath, JSON.stringify(updated, null, 2) + "\n");
  console.log(`Bumped package.json to ${newVersion}`);

  // Commit and tag before publishing so the release is traceable in git history.
  // If either step fails, revert package.json before exiting.
  try {
    git(`add "${pkgPath}"`);
    git(`commit -m "chore: release v${newVersion}"`);
    git(`tag v${newVersion}`);
    console.log(`Tagged v${newVersion}`);
  } catch (err) {
    console.error("Git commit/tag failed — reverting package.json");
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    process.exit(1);
  }

  try {
    execSync("pnpm run publish --platform=win32", {
      stdio: "inherit",
      env: { ...process.env, PUBLISHING: "true" },
    });
    console.log(`Released ${newVersion} successfully.`);
  } catch (err) {
    console.error("Publish failed — reverting package.json, commit, and tag");
    // Revert the tag and the commit so the repo is back to pre-release state
    try { git(`tag -d v${newVersion}`); } catch { /* ignore */ }
    try { git("reset --hard HEAD~1"); } catch { /* ignore */ }
    process.exit(1);
  }
}

void main();
```

**Output — `apps/frontend/package.json`:**
- Add script: `"release": "tsx scripts/release.ts"`

**Env file separation:**

`.env` — already exists; already bundled via `packagerConfig.extraResource` in `forge.config.ts`. No rename needed. Add the two update-related vars:
```
VITE_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_S3_BUCKET=photobooth-bucket
```
These are public constants — same across all kiosks. The `forge.config.ts` dotenv call (`dotenv.config({ path: ".env" })`) and the runtime `main.ts` dotenv call (`dotenv.config({ path: path.join(process.resourcesPath, ".env") })`) both read from this same file — at build time and at runtime respectively.

`.env.secret` — new file, gitignored. Only needed by the person running `pnpm fe release`. **Never** add to `extraResource`. Contains S3 credentials for uploading:
```
SUPABASE_S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3
SUPABASE_S3_REGION=ap-southeast-1
SUPABASE_S3_ACCESS_KEY_ID=...
SUPABASE_S3_SECRET_ACCESS_KEY=...
WIN_CERT_PATH=/path/to/certificate.pfx     ← from V4-7.0
WIN_CERT_PASSWORD=your-pfx-password        ← from V4-7.0
```

Add `.env.secret` to `apps/frontend/.gitignore`. The S3 secret key must never appear in `extraResource` — the packaged app only needs the public Supabase URL to check for updates, not credentials to upload them.

**Current scope: Windows-only publish.** The `release.ts` script runs `--platform=win32`. macOS builds are not yet published to S3 (auto-update inactive for macOS in production). This is intentional — tackle macOS code signing and notarization as a separate task when required.

> **Cross-compile dependency (macOS → Windows):** Building a Windows Squirrel installer (`MakerSquirrel`) from macOS or Linux requires `wine` and `mono` to be installed on the build machine. On macOS, install with `brew install --cask wine-stable`. Without these, `electron-forge make --platform=win32` will fail with a `wine` not found error. For CI, use a Windows runner or a Docker image that includes `wine`. Verify with `wine --version` before attempting a cross-compile release.

**Verification:**
- Layer 1: Lint all changed files — no errors
- Layer 2: n/a
- Layer 3: Run `pnpm fe release` (on macOS or Linux — not Windows due to known path issue). Confirm `RELEASES`, installer, and `.nupkg` appear in Supabase bucket at `app-updates/win32/x64/`. Launch a signed production build with a lower version — confirm update banner appears after `update-electron-app` fetches the manifest.

**Risk:** High. `s3ForcePathStyle: true` is easy to forget and causes silent upload failures (requests go to the wrong host). The build-time URL embedded in the installer (via `remoteReleases` / `macUpdateManifestBaseUrl`) must exactly match the runtime URL from `getUpdateBaseUrl()` — a mismatch means users get no updates silently. Verify both URLs by logging them during a test build before declaring the task done.

**Bad-release rollback procedure:**

If a broken build is published and kiosks have already downloaded it, `quitAndInstall()` will apply the broken build on next restart. To roll back:

1. **Do not restart the kiosks** — instruct operators to dismiss the update banner ("Later") until the rollback is in place.
2. Hotfix the code, bump to a new patch version (e.g. `v1.2.3` → `v1.2.4`), and run `pnpm fe release`.
3. The new `RELEASES` manifest in S3 will point to `v1.2.4`. Kiosks will download and apply the fix on the next check interval (up to 1 hour), or immediately when "Restart Now" is clicked.
4. If the broken build was already applied (kiosk restarted), install the hotfix manually via USB until remote update delivers it.

> There is no mechanism to "push" an update or force an immediate check — the 1-hour polling interval is the minimum delivery window. For critical breaks, USB install is the only immediate path.

---

## Phase 8 — AI Generation Resilience (Field Issues 2026-04-06)

> **Priority note:** These tasks address a production-impacting bug observed during live testing (session 2 of 2 stuck indefinitely). Recommend doing Phase 8 before or alongside Phase 6. See backlog entries `AIGen-FIX-01` and `AIGen-UX-01` for full context.

### ~~V4-8.1 — AIGen-FIX-01: Add AbortController timeout to AI generation fetch~~ ✅

**What:** The `fetch` call in `AiGenerationModule` has no timeout. On slow networks the HTTP 200 status arrives quickly (headers received) but `createResponse.json()` then waits indefinitely for the large response body to stream. Add an `AbortController` with a 60-second timeout so the entire operation (connection + body read) is cancelled and a user-visible error is thrown if it takes too long.

**Root cause:** `createResponse.json()` at line 174 of `AiGenerationModule.tsx` blocks until the full ~2679KB base64 body streams in. There is no `AbortController`, no signal, and no timeout anywhere in the fetch path. A stalled TCP stream does not throw an error on its own — it silently hangs. The 60-second SLA defined in `CLAUDE.md` (`Core Constraints`) has no enforcement mechanism.

**Files:**
- `apps/frontend/src/modules/AiGenerationModule.tsx`

**Input:** V4-5.2 complete.

**Output:**
- Before the `fetch` call, create: `const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 60_000);`
- Pass `signal: controller.signal` to the `fetch(url, { ... })` options.
- After `await createResponse.json()` resolves (success path), call `clearTimeout(timeoutId)`.
- In the `catch` block, detect abort: `if (err instanceof Error && err.name === 'AbortError')` → re-throw with message `"Generation timed out. Please try again."`.
- The `finally` block should also call `clearTimeout(timeoutId)` to prevent the timer leaking on error paths.
- No change to the error UI — the existing "Try Again" / "Back to Home" buttons already render on error.

**Verification:**
- Layer 1: Lint changed file — no errors
- Layer 2: n/a
- Layer 3: Normal fast session — confirm it still completes successfully (timeout does not fire). Slow-network simulation is optional (can throttle in DevTools); at minimum verify the AbortController is wired up by code review.

**Risk:** Low. Additive guard only. Does not change happy-path behavior. The only risk is accidentally aborting the wrong operation — verify `clearTimeout` is called before `onComplete`.

---

### ~~V4-8.2 — AIGen-UX-01: Show "Cancel / Start Over" button after 30s on loading screen~~ ✅

**What:** The AI generation loading screen has no escape hatch. If generation stalls, guests are stuck until the 60s AbortController fires (V4-8.1) — a 60-second wait with a frozen UI and no feedback that something is wrong. Add a "Cancel / Start Over" button that fades in after 30 seconds, allowing the guest to abort and return home immediately.

**Files:**
- `apps/frontend/src/modules/AiGenerationModule.tsx`

**Input:** V4-8.1 complete (the `AbortController` ref must be accessible to the cancel button handler).

**Output:**
- Add a `showCancelButton` state (boolean, default `false`).
- After the AI generation effect starts, start a separate `setTimeout` of 30 seconds that sets `showCancelButton = true`. Clear this timer if generation completes or errors before 30s.
- Store the `AbortController` in a `useRef` so the cancel handler can call `.abort()` on it.
- Render: when `showCancelButton && !error`, show a "Cancel / Start Over" button overlaid on the loading UI (above the progress bar, centered). Style: semi-transparent white or secondary color, large touch target (same sizing as existing error buttons), with a brief label: "Cancel / Start Over".
- On click: call `controller.abort()` (which triggers the AbortError catch path in the effect) then call `onBack()` to return to home. Do not show the error state before navigating — just go home.
- The button must not appear once the error state is shown (error has its own "Back to Home" button).

**Verification:**
- Layer 1: Lint changed file — no errors
- Layer 2: n/a
- Layer 3a: Run a normal fast session — confirm the cancel button does NOT appear (generation completes in < 30s).
- Layer 3b: To test the button UI without waiting: temporarily reduce the 30s delay to 3s in a dev build, confirm the button appears and clicking it returns to home.

**Risk:** Low. Additive UI element. The `AbortController` ref threading is the only non-trivial part — verify the ref is populated before the button can be tapped (generation effect always starts before 30s elapses, so the ref will be set).
