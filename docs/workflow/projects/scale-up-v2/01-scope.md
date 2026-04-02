# scale-up-v2 — Project Scope

**Milestone:** V2 — Modular Pipeline
**Status:** 🔄 In Progress — Phases 1–4 complete ✅ · Phase 5 next
**Depends on:** `scale-up-v1` complete ✅

---

## What This Project Delivers

The kiosk's guest flow becomes a runtime-rendered pipeline of configurable modules, assembled per event from the dashboard — not a hardcoded sequence of React Router routes.

One sentence: **This project replaces the hardcoded 5-step kiosk flow with a dynamic module pipeline driven entirely by `EventConfig`.**

---

## Definition of Done

- `moduleFlow: ModuleConfig[]` is a fully typed array (no longer a stub)
- The kiosk reads `moduleFlow` and renders each module component in sequence — no hardcoded routes drive the flow
- Flow builder exists in the dashboard (add, remove, reorder modules; configure each)
- At least one new non-core module is built on the system (Mini Quiz is the target)
- Session model is complete: rows are created on session start, include `module_outputs`
- All V1 carryover items from the backlog are resolved or explicitly deferred to V3

---

## Architecture Decisions (Resolved)

All four decisions are settled. Do not reopen without a strong technical reason.

---

### A — Module rendering strategy

**Decision: Index-based state machine pipeline. No XState. No per-step routes.**

The guest flow is driven by a `currentIndex` integer in React state, not by React Router URLs. Three new pieces are introduced:

**`PipelineContext`** — holds pipeline state, mounted above the router:

```typescript
interface PipelineContextType {
  sessionId: string | null;
  currentIndex: number;
  moduleOutputs: Record<string, unknown>;
  advance: (output?: Record<string, unknown>) => void;
  back: () => void;
  reset: () => void;
}
```

**`PipelineRenderer`** — rendered at route `/`. Reads `moduleFlow` from `EventConfig`, looks up the component for `moduleFlow[currentIndex]` in the module registry, renders it with a standard props interface:

```typescript
interface ModuleProps {
  config: ModuleConfig;
  outputs: Record<string, unknown>;   // all prior module outputs, accumulated
  onComplete: (output?: Record<string, unknown>) => void;
  onBack: () => void;
}
```

**Module registry** — a static map in the frontend, updated when new modules are added:

```typescript
const MODULE_REGISTRY: Record<string, React.ComponentType<ModuleProps>> = {
  'welcome':          WelcomeModule,
  'theme-selection':  ThemeSelectionModule,
  'camera':           CameraModule,
  'ai-generation':    AiGenerationModule,
  'form':             FormModule,
  'result':           ResultModule,
  'mini-quiz':        MiniQuizModule,   // V2 new module
}
```

**React Router becomes thin** — only admin routes remain as real routes:

```
Route "/"      → <PipelineRenderer />   ← all guest flow, state-driven
Route "/data"  → <DataPage />
Route "/test"  → <TestPage />
```

The 6 existing route files (`index.tsx`, `select.tsx`, `camera.tsx`, `form.tsx`, `loading.tsx`, `result.tsx`) are rewritten as module components. They swap `navigate('/next')` for `onComplete(output)` and stop calling `usePhotobooth()`.

**Inactivity timeout** moves to the pipeline level: fires `reset()` which sets `currentIndex` back to 0 and clears `moduleOutputs`. The per-route suppression logic is removed.

**What this removes:** URL-per-step in the guest flow (no `/camera`, `/form` etc). Acceptable — Electron does not show a URL bar to guests. Developer mitigation: a `DEV_START_MODULE` env var can be added to start the pipeline at a given index without having to tap through preceding steps.

---

### B — Session lifecycle

**Decision: Session row created when WelcomeModule calls `onComplete` (guest taps "Start").**

Before advancing to index 1, the pipeline calls `POST /api/session/start`. This returns a `sessionId` that is stored in `PipelineContext` and flows into downstream modules via `outputs`.

```
Guest taps "Start"
    │
    ├── WelcomeModule calls onComplete()
    │
    ├── PipelineRenderer calls POST /api/session/start → { sessionId }
    │
    ├── currentIndex advances to 1
    └── sessionId stored in PipelineContext, injected into moduleOutputs as { sessionId }
```

**Why this matters:** The session row exists in Supabase from the moment the guest starts. If the app crashes mid-flow, the session is detectable as `status: 'in_progress'` and is recoverable. This directly resolves RISK-02 from the V1 backlog.

**New endpoint required:** `POST /api/session/start`
- Input: `{ eventId }`
- Creates row in `sessions` table: `{ id, eventId, status: 'in_progress', started_at }`
- Returns: `{ sessionId: string }`

---

### C — `PhotoboothContext` migration

**Decision: Clean cut. `PhotoboothContext` is deleted and replaced by `PipelineContext`.**

No backwards-compatibility bridge. Since no kiosk is live, a bridge only adds complexity and deferred cleanup.

`PipelineContext` holds generic pipeline state (defined in decision A). Modules do not read from context — they receive all data through the `outputs` prop and write through `onComplete(output)`.

**Module output accumulation:**

```
After welcome:          moduleOutputs = { sessionId: 'sess_...' }
After theme-selection:  moduleOutputs = { sessionId: '...', selectedTheme: { id: 'f1', label: 'F1' } }
After camera:           moduleOutputs = { ..., originalPhoto: 'base64...' }
After ai-generation:    moduleOutputs = { ..., finalPhoto: 'base64...' }
After form:             moduleOutputs = { ..., userInfo: { name, email, phone } }
```

The `result` module receives the full accumulated `outputs` object and handles save, upload, and print.

**`eventId` handling:** Already available via `useEventConfig()`. Modules that need it read from `EventConfigContext`, not from pipeline outputs.

---

### D — `ModuleConfig` type design

**Decision: `aiConfig` is removed from the top-level `EventConfig`. AI config (provider + themes) moves into `AiGenerationModuleConfig`. Full `ModuleConfig` discriminated union is defined below.**

#### `ModuleConfig` union type

```typescript
type ModulePosition =
  | 'fixed-first'
  | 'pre-photo'
  | 'fixed-camera'
  | 'post-photo'
  | 'fixed-last'
  | 'flexible'

interface BaseModuleConfig {
  moduleId: string
  position: ModulePosition
  outputKey?: string          // key this module writes into moduleOutputs
}

interface WelcomeModuleConfig extends BaseModuleConfig {
  moduleId: 'welcome'
  position: 'fixed-first'
}

interface CameraModuleConfig extends BaseModuleConfig {
  moduleId: 'camera'
  position: 'fixed-camera'
  outputKey: 'originalPhoto'
  maxRetakes: number          // default: 2
}

interface ThemeSelectionModuleConfig extends BaseModuleConfig {
  moduleId: 'theme-selection'
  position: 'pre-photo'
  outputKey: 'selectedTheme'
  themes: Array<{
    id: string
    label: string
    previewImageUrl: string
  }>
}

interface AiGenerationModuleConfig extends BaseModuleConfig {
  moduleId: 'ai-generation'
  position: 'post-photo'
  outputKey: 'finalPhoto'
  provider: 'replicate' | 'google'
  themes: AiThemeConfig[]     // moved here from top-level aiConfig
}

interface FormModuleConfig extends BaseModuleConfig {
  moduleId: 'form'
  position: 'post-photo'
  outputKey: 'userInfo'
}

interface ResultModuleConfig extends BaseModuleConfig {
  moduleId: 'result'
  position: 'fixed-last'
}

interface MiniQuizModuleConfig extends BaseModuleConfig {
  moduleId: 'mini-quiz'
  position: 'flexible'
  outputKey: 'quizAnswer'
  questions: Array<{
    text: string
    options: string[]
  }>
}

type ModuleConfig =
  | WelcomeModuleConfig
  | CameraModuleConfig
  | ThemeSelectionModuleConfig
  | AiGenerationModuleConfig
  | FormModuleConfig
  | ResultModuleConfig
  | MiniQuizModuleConfig
```

**`ThemeSelectionModuleConfig` vs `AiGenerationModuleConfig` themes:** Both reference themes by the same `id`. The theme-selection module carries display data only (id, label, previewImageUrl). The AI generation module carries full generation config per theme (template URL, prompt, frame, canvas dimensions). The flow builder links them by id — editing a theme in one panel updates both. The `AiGenerationModule` component reads `moduleOutputs.selectedTheme.id` and finds the matching full theme in its own `config.themes`.

#### Updated `EventConfig`

```typescript
interface EventConfig {
  eventId: string
  branding: BrandingConfig
  moduleFlow: ModuleConfig[]    // replaces stub string[]; aiConfig removed
  formFields: FormFieldsConfig
  techConfig: TechConfig
}
```

#### Type sharing strategy

Types are duplicated across both apps. Canonical source: `apps/web/src/types/module-config.ts`. Mirror: `apps/frontend/src/types/module-config.ts`. Both files carry a comment header: `// MIRRORED — keep in sync with apps/web/src/types/module-config.ts`. A shared `packages/types` workspace can consolidate these in V3 when the duplication becomes painful.

#### Backend migration required

Existing `event_configs` rows must be migrated: move `aiConfig.provider` and `aiConfig.themes` into the `ai-generation` entry inside `moduleFlow`. This is a one-time Supabase SQL migration that runs before V2 goes live. The `AiThemeConfig` shape is preserved — only its location in the document changes.

---

## Rough Phase Plan

This is directional — full task decomposition goes in `02-backlog.md`.

| Phase | Focus |
|-------|-------|
| V2-Phase 1 | Type system — define `ModuleConfig` types in both apps; replace `moduleFlow: string[]` stub; run DB migration |
| V2-Phase 2 | Session model — `POST /api/session/start`; `module_outputs` column in sessions table |
| V2-Phase 3 | Module pipeline renderer — `PipelineContext`, `PipelineRenderer`, module registry; migrate all 6 existing routes to module components; delete `PhotoboothContext`; move inactivity timeout to pipeline level |
| V2-Phase 4 | Flow builder UI — dashboard ordered list with add/remove; per-module config panels inline |
| V2-Phase 5 | First new module — Mini Quiz, built on the V2 module system |
| V2-Phase 6 | V1 carryover closure — all remaining tech debt from `02-backlog.md` Part A |

---

## What This Project Does NOT Cover

These are V3 scope (do not plan them in scale-up-v2):

- `organizations` table / multi-tenancy
- Client dashboard access
- Email delivery (TASK-B.14 is carryover from V1 — completing it here is acceptable, but the full email pipeline design is V3)
- Asset upload via dashboard (frames, templates)
- Form field builder (custom fields beyond name/email/phone)
- Guest portal V2 (social share, multiple result items, brand CTA)
- Shared `packages/types` workspace (V3, when type duplication becomes a maintenance burden)
