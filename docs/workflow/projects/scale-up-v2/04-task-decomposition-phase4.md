# Task Decomposition — V2 Phase 4 (Flow Builder)

**Status:** 🔜 Not started
**Scope:** V2-Phase 4 — Flow Builder (Dashboard)
**Depends on:** Phases 1, 2, 3 complete ✅ · V2-1.5 DB migration confirmed run ✅

**Format per task:** What · Files · Input · Output · Verification · Risk
**Per-task workflow:** read → change → lint → test → commit → mark done (see CLAUDE.md)

---

## Goal

Operator can view, reorder, add, remove, and configure modules in the kiosk flow without touching code. A new "Flow Builder" dashboard page reads and writes `event_configs.config_json.moduleFlow`.

---

## Architecture Decisions for Phase 4

### Save strategy
The flow builder uses a TanStack Start `createServerFn` colocated in `flow.tsx` (same pattern as `config.tsx`). The server function receives `{ eventId, moduleFlow }`, reads the current `config_json` from Supabase, replaces only the `moduleFlow` key, and writes the full object back. This prevents overwriting branding/tech/form changes made via `config.tsx`.

### Reorder UI
Up/down arrow buttons on non-fixed module cards. No drag-and-drop for Phase 4. Fixed modules (`fixed-first`, `fixed-camera`, `fixed-last`) cannot be reordered. No module can cross `fixed-camera` (pre-photo modules stay before it; post-photo and flexible stay after it).

### Theme ID sync
`ai-generation` module is the authoritative source of theme IDs. When the `ai-generation` module is in the flow:
- The `theme-selection` config panel shows IDs from `ai-generation.themes` as **read-only**. The operator edits only `label` and `previewImageUrl` per theme.
- Adding or removing a theme in the `ai-generation` panel automatically adds/removes the corresponding entry in the `theme-selection` module.

If no `ai-generation` module is in the flow, `theme-selection` manages its own theme list independently (IDs fully editable).

### File structure
The flow builder is a new separate dashboard page — `config.tsx` stays for Branding / Tech / Form Fields editing.

---

## Dependency Chain

```
V2-4.0 (config.tsx cleanup)
  ↓
V2-4.1 (flow builder: read + display)
  ↓
V2-4.2 (reorder: up/down buttons)
  ↓
V2-4.3 (remove non-fixed modules)
  ↓
V2-4.4 (add module action)
  ↓
V2-4.5 (config panels: Camera / Form / Welcome / Result)
  ↓
V2-4.6 (config panel: ThemeSelection)
  ↓
V2-4.7 (config panel: AiGeneration + theme sync)
  ↓
V2-4.8 (config panel: MiniQuiz)
  ↓
V2-4.9 (save server function + validation + UI wiring)
  ↓
V2-4.10 (event index: add Flow Builder nav card)
```

V2-4.10 can be done as early as after V2-4.1 (the route exists), but is listed last to ensure the page is fully functional before linking to it from the event overview.

---

## Tasks

---

### V2-4.0 — config.tsx: remove LegacyEventConfig, drop AI Config section

**What:**
1. Remove the `LegacyEventConfig` type definition and the `// TEMP` comment block from `config.tsx`.
2. Change `getEventConfig` and `saveEventConfig` to use `EventConfig` (from `event-config.ts`) directly instead of `LegacyEventConfig`.
3. Remove the "AI Config" `<Section>` and all related handlers and state: `updateAiProvider`, `updateTheme`, `validationErrors['theme[*].*']`.
4. Remove AI-theme validation logic from `validateConfig` — keep only Branding and TechConfig validation.
5. Remove the now-unused `AiThemeConfig` import.

The config editor retains: Branding, Tech Config, Form Fields. The save handler continues to write the full `config_json` (unchanged behavior — it just no longer includes `aiConfig`).

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx`

**Input:** V2-1.5 confirmed run (DB has no `aiConfig` key). `EventConfig` type in `apps/web/src/types/event-config.ts` has no `aiConfig` field.

**Output:**
- `config.tsx` uses `EventConfig` directly; no `LegacyEventConfig` type.
- No AI Config section in the UI.
- `validateConfig` validates Branding + TechConfig only.
- File lints cleanly.

**Verification:**
- Layer 1: `git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint` — no new errors.
- Layer 2: n/a — no new business logic.
- Layer 3:
  1. Open event dashboard → Config in browser.
  2. Confirm Branding, Tech Config, Form Fields sections render correctly.
  3. Confirm no AI Config section.
  4. Edit primary color → Save → confirm saves successfully.

**Risk:** Low. The AI Config section was already broken (DB has no `aiConfig` data). Removal is cleanup only.

---

### V2-4.1 — Flow builder page: scaffold + read + display moduleFlow

**What:**
1. Create `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`.
2. `getModuleFlow` server function (`createServerFn`): reads `event_configs.config_json.moduleFlow` for the given `eventId`. Returns `ModuleConfig[]`.
3. Route: `createFileRoute('/dashboard/_layout/events/$eventId/flow')`. Loader calls `getModuleFlow`.
4. Component renders an ordered list of module cards. Each card shows:
   - Module label (human-readable: "Welcome Screen", "Theme Selection", "Camera", "Form", "AI Generation", "Result", "Mini Quiz").
   - `moduleId` badge in monospace.
   - Position badge.
   - Lock icon for fixed modules (position `fixed-first`, `fixed-camera`, `fixed-last`).
5. Display only — no interactions yet (no reorder, no remove, no config).
6. Add a breadcrumb: `← {eventId}` / `Flow Builder`.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx` (new)

**Input:** V2-4.0 complete. Route file does not yet exist.

**Output:**
- Route `/dashboard/events/:eventId/flow` loads and displays the module pipeline as a static ordered list.

**Verification:**
- Layer 1: Lint the new file — no errors.
- Layer 2: n/a.
- Layer 3:
  1. Navigate to `/dashboard/events/:eventId/flow` in browser.
  2. Confirm 6 module cards render in correct order (welcome → theme-selection → camera → form → ai-generation → result).
  3. Confirm fixed modules show a lock indicator.
  4. Confirm no JS errors in console.

**Risk:** Low. New file, read-only.

---

### V2-4.2 — Flow builder: reorder (up/down buttons)

**What:**
1. Convert the route data to local React state: `const [flow, setFlow] = useState<ModuleConfig[]>(routeData)`.
2. Add `moveUp(index: number)` and `moveDown(index: number)` handlers that swap adjacent modules. Rules:
   - Fixed modules (`fixed-first`, `fixed-camera`, `fixed-last`) cannot be moved — no buttons shown.
   - No module can move before index 0 or past the last index.
   - No module can cross `fixed-camera`: modules before camera stay before it; modules after camera stay after it.
3. Show up/down arrow buttons on non-fixed module cards. Disable up-button when at boundary; disable down-button when at boundary.
4. Show an "Unsaved changes" indicator when `flow` !== `initialFlow`.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**Input:** V2-4.1 complete.

**Output:**
- Non-fixed module cards show up/down buttons.
- Clicking updates local state.
- Fixed modules show no arrows.
- Unsaved changes indicator is visible when flow differs from initial.

**Verification:**
- Layer 1: Lint.
- Layer 2: n/a — reorder logic is simple index swapping.
- Layer 3:
  1. Click up on `form` module → confirm it swaps position with `ai-generation` (both are post-camera).
  2. Confirm `camera` card has no arrows.
  3. Confirm `form` cannot move above `camera`.

**Risk:** Low. Client state only.

---

### V2-4.3 — Flow builder: remove non-fixed modules

**What:**
1. Add a remove button (×) to each non-fixed, removable module card.
2. `removeModule(index: number)`: filters out the module at that index from `flow`.
3. Fixed modules (`fixed-first`, `fixed-camera`, `fixed-last`) show no remove button.
4. Add a confirmation prompt before removing a module that has a non-empty config (e.g., removing an ai-generation with themes configured).

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**Input:** V2-4.2 complete.

**Output:**
- Non-fixed module cards have a remove button.
- Clicking remove (with confirmation if applicable) removes the card from local state.

**Verification:**
- Layer 1: Lint.
- Layer 3:
  1. Click remove on `form` module → confirm it disappears from the list.
  2. Confirm `camera`, `welcome`, `result` have no remove button.
  3. Confirm unsaved changes indicator is shown after removal.

**Risk:** Low. Client state only.

---

### V2-4.4 — Flow builder: add module action

**What:**
1. Add an "Add Module" button (shown below the module list).
2. Clicking opens an inline picker panel listing the addable module types:
   - `theme-selection`, `ai-generation`, `form`: each limited to **one** per flow. Gray out and disable if already present.
   - `mini-quiz`: always available (can have multiple).
3. Selecting a module type inserts it at the correct position in `flow`:
   - `pre-photo` (`theme-selection`): last position before `fixed-camera`.
   - `post-photo` (`ai-generation`, `form`): last position before `fixed-last`, after any existing post-photo modules.
   - `flexible` (`mini-quiz`): last position before `fixed-last`.
4. New modules get a minimal default config:
   - `theme-selection`: `{ moduleId: 'theme-selection', position: 'pre-photo', outputKey: 'selectedTheme', themes: [] }`
   - `ai-generation`: `{ moduleId: 'ai-generation', position: 'post-photo', outputKey: 'finalPhoto', provider: 'replicate', themes: [] }`
   - `form`: `{ moduleId: 'form', position: 'post-photo', outputKey: 'userInfo' }`
   - `mini-quiz`: `{ moduleId: 'mini-quiz', position: 'flexible', outputKey: 'quizAnswer', questions: [] }`

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**Input:** V2-4.3 complete.

**Output:**
- "Add Module" button renders below the module list.
- Picker panel appears on click.
- Already-present single-instance modules are disabled in the picker.
- Selecting inserts at the correct position in local state.

**Verification:**
- Layer 1: Lint.
- Layer 3:
  1. Remove `theme-selection` from flow → click Add Module → confirm `theme-selection` is available.
  2. Add it → confirm it appears before `camera`.
  3. Confirm `theme-selection` is disabled in picker when it's already in flow.
  4. Add `mini-quiz` twice → confirm two appear in flow.

**Risk:** Low-medium. Insertion position logic has constraints.

---

### V2-4.5 — Flow builder: config panels for Camera, Form, Welcome, Result

**What:**
1. Add a "Configure" expand/collapse toggle (chevron) to every module card. Clicking expands an inline config panel below the card header.
2. **Welcome**: Panel shows "No configurable options for V2."
3. **Result**: Panel shows "No configurable options for V2."
4. **Form**: Panel shows "No configurable options for V2."
5. **Camera**: Panel shows:
   - `Max Retakes` — number input, min 1, max 10, integer. Editing updates `flow[index].maxRetakes`.

This establishes the expand/collapse pattern and the `updateModule(index, patch)` handler that all subsequent config panels use.

**`updateModule` helper:**
```typescript
const updateModule = (index: number, patch: Partial<ModuleConfig>) =>
  setFlow(f => f.map((m, i) => i === index ? { ...m, ...patch } : m))
```

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**Input:** V2-4.4 complete.

**Output:**
- Every module card has a "Configure" toggle.
- Camera expands to show `maxRetakes` field; others expand to show "no options" text.
- Changing `maxRetakes` updates local flow state.

**Verification:**
- Layer 1: Lint.
- Layer 3:
  1. Click "Configure" on camera card → `maxRetakes` field appears.
  2. Change value to 3 → confirm `flow[camera index].maxRetakes === 3`.
  3. Click "Configure" on result card → "No configurable options" text appears.

**Risk:** Low.

---

### V2-4.6 — Flow builder: ThemeSelection config panel

**What:**
Expand `theme-selection` card to show a theme list editor.

**Sync mode** (when `ai-generation` module exists in `flow`):
- Read theme IDs from `(flow.find(m => m.moduleId === 'ai-generation') as AiGenerationModuleConfig).themes`.
- For each ai-generation theme ID, show a row with:
  - Theme ID: displayed as static text (read-only).
  - `Label`: text input — edits `theme-selection.themes[i].label`.
  - `Preview Image URL`: text input — edits `theme-selection.themes[i].previewImageUrl`.
- Auto-fill any missing theme-selection entries when the panel opens (ai-generation may have added themes that theme-selection doesn't know about yet).
- A note: "Theme IDs are controlled by the AI Generation module."
- No add/remove buttons in sync mode (ai-generation controls the list).

**Standalone mode** (no `ai-generation` in `flow`):
- Show a full editable theme list: id (text input), label, previewImageUrl per row.
- Add theme button (appends `{ id: '', label: '', previewImageUrl: '' }`).
- Remove button per theme.

**`updateThemeSelectionTheme` helper:**
Edits `flow[tsIndex].themes[i]` via `updateModule`.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**Input:** V2-4.5 complete.

**Output:**
- ThemeSelection card expands showing theme rows.
- In sync mode: IDs read-only, label/previewImageUrl editable.
- In standalone mode: full editing.

**Verification:**
- Layer 1: Lint.
- Layer 3:
  1. Expand theme-selection panel → confirm 3 theme rows (pitcrew, motogp, f1) with read-only IDs.
  2. Edit label for pitcrew → confirm flow state updates.
  3. Remove ai-generation from flow → expand theme-selection → confirm standalone mode (IDs editable).

**Risk:** Low-medium. Sync mode logic reads across two modules in state.

---

### V2-4.7 — Flow builder: AiGeneration config panel

**What:**
Expand `ai-generation` card to show:
1. **Provider** dropdown: `replicate` | `google`. Edits `flow[aiIndex].provider`.
2. **Per-theme config list**: one expandable subsection per theme, showing all `AiThemeConfig` fields:
   - `id` — text input. Editing an ID must also update the corresponding entry in `theme-selection.themes[i].id` (if theme-selection exists in flow).
   - `label`, `prompt` (textarea), `previewImageUrl`, `frameImageUrl`, `templateImageUrl` — text/textarea inputs.
   - `canvasWidth`, `canvasHeight`, `photoWidth`, `photoHeight`, `photoOffsetX`, `photoOffsetY` — number inputs (positive integers).
3. **Add theme** button: appends a blank `AiThemeConfig` entry to `ai-generation.themes` AND adds a corresponding `{ id: '', label: '', previewImageUrl: '' }` entry to `theme-selection.themes` (if theme-selection exists in flow).
4. **Remove theme** button per theme: removes from `ai-generation.themes` AND from `theme-selection.themes` (by matching id) if theme-selection exists in flow.

**`syncThemeSelectionId(oldId, newId)` helper:**
When a theme ID is renamed, find the entry in `theme-selection.themes` with `id === oldId` and update it to `newId`.

**`addTheme()` handler:**
Adds blank entry to both modules atomically (single `setFlow` call).

**`removeTheme(aiThemeIndex)` handler:**
Removes by id from both modules atomically.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**Input:** V2-4.6 complete.

**Output:**
- AiGeneration card expands with provider select and per-theme expandable config.
- Adding a theme updates both ai-generation and theme-selection.
- Removing a theme updates both.
- Editing a theme ID updates both.

**Verification:**
- Layer 1: Lint.
- Layer 3:
  1. Expand ai-generation card → provider dropdown shows; 3 theme subsections show.
  2. Edit prompt for `pitcrew` → confirm flow state updates.
  3. Click "Add theme" → confirm new blank row in ai-generation AND new row in theme-selection.
  4. Remove that new theme → confirm removed from both.
  5. Rename `pitcrew` id to `pitcrew2` → expand theme-selection → confirm theme-selection also shows `pitcrew2`.

**Risk:** Medium. Theme sync across two modules in `flow` state. Use a single `setFlow` call for all multi-module operations to avoid stale state.

---

### V2-4.8 — Flow builder: MiniQuiz config panel

**What:**
Expand `mini-quiz` card to show a question editor:
1. Ordered list of questions. Each question shows:
   - `Question text` — text input. Edits `flow[mqIndex].questions[i].text`.
   - Ordered list of `Options` — text inputs per option. Edits `flow[mqIndex].questions[i].options[j]`.
   - "Add option" button per question (appends `''`).
   - "Remove option" button per option (disabled if ≤ 2 options remain).
   - "Remove question" button.
2. "Add question" button: appends `{ text: '', options: ['', ''] }` (two blank options as minimum).

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**Input:** V2-4.5 complete (can be done after V2-4.5 independently of V2-4.6/4.7).

**Output:**
- MiniQuiz card expands with question/option editing.

**Verification:**
- Layer 1: Lint.
- Layer 3:
  1. Add a `mini-quiz` module via Add Module.
  2. Expand it → click "Add question" → confirm a question row appears with 2 blank options.
  3. Fill in question text and options.
  4. Confirm flow state reflects changes.

**Risk:** Low. Nested list editing but no cross-module sync.

---

### V2-4.9 — Flow builder: save server function + validation + UI wiring

**What:**

**Server function `saveModuleFlow`:**
```
input: { eventId: string, moduleFlow: ModuleConfig[] }
1. Read current config_json from event_configs WHERE event_id = eventId
2. Replace config_json.moduleFlow with input moduleFlow
3. Update event_configs SET config_json = merged, updated_at = now()
4. Return void (throw on error)
```

**`validateModuleFlow(moduleFlow: ModuleConfig[]): Record<string, string>`:**
Rules (non-exhaustive list — implement all):
- Exactly one `welcome` module → error `'flow': 'Flow must have exactly one Welcome module'`
- Exactly one `camera` module → error `'flow': 'Flow must have exactly one Camera module'`
- Exactly one `result` module → error `'flow': 'Flow must have exactly one Result module'`
- At most one `theme-selection` → error
- At most one `ai-generation` → error
- At most one `form` → error
- If both `theme-selection` and `ai-generation` present: their theme IDs must match exactly → error `'themes': 'Theme IDs in Theme Selection must match those in AI Generation'`
- Camera `maxRetakes` must be a positive integer (≥ 1) → error `'camera.maxRetakes': '...'`
- Each ai-generation theme: non-empty id, label, prompt, previewImageUrl, frameImageUrl, templateImageUrl; canvas/photo dims are positive integers → errors keyed as `'aiTheme[i].fieldName'`
- Each mini-quiz question: non-empty text; at least 2 options; no empty options → errors keyed as `'quiz[i].question'`, `'quiz[i].options'`

**UI wiring:**
- "Save Flow" and "Discard" buttons appear when `isDirty` (flow !== initialFlow).
- `handleSave()`: validate → show errors if any → confirm dialog → call server function → setStatus('saved') or setStatus('error').
- Validation errors displayed above the module list.
- A `<SaveStatus />` component shows saved/error state.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**Input:** V2-4.7 and V2-4.8 complete.

**Output:**
- Save/Discard buttons visible when dirty.
- Validation errors block save.
- Successful save persists `moduleFlow` to Supabase without overwriting branding/tech/form.

**Verification:**
- Layer 1: Lint.
- Layer 2: Unit test `validateModuleFlow`:
  - Missing welcome → validation error on `'flow'` key.
  - Missing result → error.
  - Theme IDs mismatch between theme-selection and ai-generation → error.
  - Camera `maxRetakes = 0` → error.
  - AI theme with empty prompt → error keyed correctly.
  - Valid fully-configured flow → empty error object.
- Layer 3:
  1. Reorder a module → click Save → confirm dialog → confirm Supabase `config_json.moduleFlow` reflects the new order (check via Supabase dashboard).
  2. Verify branding/tech/form fields are unchanged in Supabase after saving moduleFlow.
  3. Remove all theme-selection themes except one, leave ai-generation with three → click Save → confirm validation error about ID mismatch blocks save.

**Risk:** Medium. The server function must do a safe read-modify-write. Use Supabase `.update()` with the merged object, not a raw SQL partial update, to stay consistent with existing patterns.

---

### V2-4.10 — Event index: add Flow Builder navigation card

**What:**
1. Add a fourth navigation card "Flow Builder" to `_layout.events.$eventId.index.tsx`.
   - Title: `"Flow Builder"`
   - Description: `"View and configure the kiosk module pipeline"`
   - Links to `/dashboard/events/$eventId/flow`
2. Update the existing "Config" card description from `"Edit branding, themes, and tech settings"` → `"Edit branding, form fields, and tech settings"`.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.index.tsx`

**Input:** V2-4.1 complete (route exists).

**Output:**
- Event dashboard shows 4 navigation cards: Guests, Photos, Config, Flow Builder.
- Config card description is accurate.

**Verification:**
- Layer 1: Lint.
- Layer 3:
  1. Open event dashboard in browser.
  2. Confirm 4 cards render.
  3. Click "Flow Builder" → confirm navigation to flow builder page.

**Risk:** Low.

---

## Summary Table

| Task | What | Files | Depends on |
|------|------|-------|------------|
| V2-4.0 | Remove LegacyEventConfig + AI Config section from config.tsx | `_layout.events.$eventId.config.tsx` | V2-1.5 done |
| V2-4.1 | Flow builder page: scaffold + display moduleFlow (read-only) | `_layout.events.$eventId.flow.tsx` (new) | V2-4.0 |
| V2-4.2 | Flow builder: reorder with up/down buttons | flow.tsx | V2-4.1 |
| V2-4.3 | Flow builder: remove non-fixed modules | flow.tsx | V2-4.2 |
| V2-4.4 | Flow builder: add module action + picker | flow.tsx | V2-4.3 |
| V2-4.5 | Config panels: Camera (maxRetakes), Form/Welcome/Result (no-op) | flow.tsx | V2-4.4 |
| V2-4.6 | Config panel: ThemeSelection (sync + standalone modes) | flow.tsx | V2-4.5 |
| V2-4.7 | Config panel: AiGeneration (provider + themes + sync) | flow.tsx | V2-4.6 |
| V2-4.8 | Config panel: MiniQuiz (questions + options) | flow.tsx | V2-4.5 |
| V2-4.9 | Save server function + validateModuleFlow + UI wiring | flow.tsx | V2-4.7, V2-4.8 |
| V2-4.10 | Event index: add Flow Builder nav card | `_layout.events.$eventId.index.tsx` | V2-4.1 |

---

## Notes

- **`flow.tsx` is the only non-trivial new file.** All interactive work (V2-4.1 through V2-4.9) touches this one file. The file will grow large — that's acceptable for a single self-contained dashboard page. If it exceeds ~600 lines, consider extracting sub-components (e.g., `AiGenerationPanel.tsx`) but do not prematurely split.
- **No REST API endpoint needed.** The server function in `flow.tsx` handles the Supabase write directly (same pattern as `config.tsx`). The existing `GET /api/config` kiosk endpoint is unchanged.
- **Kiosk reads the updated `moduleFlow` on next session start.** No kiosk restart is required — the config is fetched on each session.
- **Race condition between flow.tsx and config.tsx saves.** If both are open simultaneously and saved independently, the last write wins (overwriting the other's changes). This is an acceptable risk for Phase 4 — no concurrent operator use is expected in practice.
