# Task Decomposition — V4 All Phases

**Status:** 🔄 In Progress — Phase 1 ✅, Phase 2 ✅, Phase 3 ✅, Phase 4 ✅, Phase 5 next
**Scope:** Phase 1 (Carryover Quick Fixes), Phase 2 (Kiosk Startup + Event ID Settings), Phase 3 (Per-Module Customization — Types + Kiosk), Phase 4 (Per-Module Customization — Dashboard), Phase 5 (Dashboard Consolidation), Phase 6 (Analytics), Phase 7 (Electron Auto-Update)

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

### V4-5.1 — Move asset upload slots into flow builder module panels

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

### V4-5.2 — Move module-specific config into flow builder panels; remove standalone tabs

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

### V4-6.1 — Add analytics server function and dashboard page

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

> **Before starting Phase 7:** Verify that the Electron build is already code-signed (required for auto-update on macOS/Windows). Check `apps/frontend/forge.config.ts` (or `package.json` forge config). If code signing is not configured, this phase requires additional setup outside of this codebase (Apple Developer account, Windows code signing certificate).

### V4-7.1 — Implement Electron auto-update with GitHub Releases

**What:** Add `update-electron-app` to the frontend app. On startup (after the loading screen completes), silently check for updates. If a new version is available, show an operator-dismissible banner.

**Files:**
- Read first: `apps/frontend/src/main.ts`
- Read first: `apps/frontend/forge.config.ts` (or `package.json` forge config) — verify build setup
- `apps/frontend/package.json` (add `update-electron-app` dependency)
- `apps/frontend/src/main.ts` (call `updateElectronApp()`, listen for `update-downloaded`, send IPC to renderer)
- `apps/frontend/src/preload.ts` (expose `electronAPI.onUpdateDownloaded(callback)`)
- `apps/frontend/src/components/StartupLoader.tsx` or App root (render update banner when IPC fires)

**Input:** V4 Phase 6 complete (kiosk and dashboard are stable; no dependency on analytics specifically). GitHub repository configured with Releases and code signing is confirmed working (`pnpm fe make` produces a signed installer).

**Output:**
- `updateElectronApp({ updateInterval: '1 hour' })` is called in `main.ts` after startup completes.
- When `autoUpdater` emits `update-downloaded`:
  - Main process sends IPC: `'update-downloaded'` with `{ version: string }`
  - Renderer shows a non-blocking banner at the bottom of the screen: "Version X.Y.Z is ready to install. Restart the kiosk to apply the update." + "Restart Now" (calls `autoUpdater.quitAndInstall()`) + "Later" (dismisses banner)
- The banner is operator-facing (styled differently from guest-facing UI — use a distinct color, small text).
- If the kiosk is in the middle of a guest session when the update banner appears, the banner is non-intrusive and the guest flow continues unaffected.

**Verification:**
- Layer 1: Lint all changed files — no errors
- Layer 2: n/a
- Layer 3: Publish a test release on GitHub tagged with a higher version than the current build; launch the kiosk (production build, not dev) — confirm the update banner appears within ~1 minute

**Risk:** High. Auto-update requires code signing, a GitHub release, and a production build — none of which can be tested in the dev server environment. Run `pnpm fe make` to produce a signed installer before testing. If code signing is not yet configured, complete that setup first and document it before marking this task done.
