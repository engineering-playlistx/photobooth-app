# Task Decomposition — V2 Phases 1 & 2

**Status:** ✅ Phases 1, 2, and 3 complete
**Scope:** Phase 1 (Type System + DB Migration), Phase 2 (Session Model), and Phase 3 (Module Pipeline Renderer).
Phase 4 decomposition: see `04-task-decomposition-phase4.md`.

**Format per task:** What · Files · Input · Output · Verification · Risk
**Per-task workflow:** read → change → lint → test → commit → mark done (see CLAUDE.md)

---

## Phase 1 — Type System + DB Migration

### ~~V2-1.1 — Define `ModuleConfig` union type in `apps/web`~~ ✅

**What:** Create `apps/web/src/types/module-config.ts`. Canonical source of truth for the module type system. Define exactly as specified in `01-scope.md` decision D: `ModulePosition`, `BaseModuleConfig`, and the seven specific module config interfaces, plus the `ModuleConfig` discriminated union.

**Files:**
- `apps/web/src/types/module-config.ts` (new)

**Input:** `01-scope.md` architecture decisions finalized ✅

**Output:**
- `ModulePosition` union type: `'fixed-first' | 'pre-photo' | 'fixed-camera' | 'post-photo' | 'fixed-last' | 'flexible'`
- `BaseModuleConfig` interface with `moduleId`, `position`, `outputKey?`
- Seven specific interfaces extending `BaseModuleConfig`: `WelcomeModuleConfig`, `CameraModuleConfig`, `ThemeSelectionModuleConfig`, `AiGenerationModuleConfig`, `FormModuleConfig`, `ResultModuleConfig`, `MiniQuizModuleConfig`
- `ModuleConfig` discriminated union of all seven
- File compiles with no TypeScript errors
- All types are exported

**Verification:**
- Layer 1: `git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint` — no new errors
- Layer 2: n/a — types only, zero runtime impact
- Layer 3: n/a

**Risk:** Low. New file — nothing imports it yet.

---

### ~~V2-1.2 — Mirror `ModuleConfig` type in `apps/frontend`~~ ✅

**What:** Create `apps/frontend/src/types/module-config.ts` as an exact structural copy of V2-1.1. Add a sync comment at the top.

**Files:**
- `apps/frontend/src/types/module-config.ts` (new)

**Input:** V2-1.1 complete.

**Output:**
- File begins with: `// MIRRORED — keep in sync with apps/web/src/types/module-config.ts`
- Identical type definitions to V2-1.1
- File compiles with no TypeScript errors

**Verification:**
- Layer 1: Lint new file — no errors
- Layer 2: n/a
- Layer 3: n/a

**Risk:** Low. New file — nothing imports it yet.

---

### ~~V2-1.3 — Update `EventConfig` in `apps/web` — type `moduleFlow`, remove `aiConfig`~~ ✅

**What:** Edit `apps/web/src/types/event-config.ts`:
1. Add import: `import type { ModuleConfig } from './module-config'`
2. Change `moduleFlow: Array<string>` → `moduleFlow: ModuleConfig[]`
3. Delete the `AiConfig` interface
4. Remove `aiConfig: AiConfig` from the `EventConfig` interface

`AiThemeConfig` stays — it is now used inside `AiGenerationModuleConfig` in the module type.

**Files:**
- `apps/web/src/types/event-config.ts`

**Input:** V2-1.1 complete.

**Output:**
- `EventConfig.moduleFlow` is `ModuleConfig[]`
- `AiConfig` interface is gone
- `aiConfig` field is gone from `EventConfig`
- `AiThemeConfig` interface is unchanged
- This file compiles cleanly

Note: Removing `aiConfig` will cause TypeScript errors in `apps/web/src/routes/api.ai-generate.ts` (line 55: `config.aiConfig.themes`). This is expected — those errors are resolved in V2-1.6. Do not fix them in this task.

**Verification:**
- Layer 1: Lint only the changed file (`apps/web/src/types/event-config.ts`) — no new errors in that file specifically. Errors in `api.ai-generate.ts` are tracked and resolved in V2-1.6.
- Layer 2: n/a
- Layer 3: n/a

**Risk:** Low for this file. The TypeScript errors in `api.ai-generate.ts` are non-crashing at runtime (Cloudflare Workers ignores TS errors — they don't affect the running endpoint). Fix before the next deploy via V2-1.6.

---

### ~~V2-1.4 — Update `EventConfig` in `apps/frontend` — type `moduleFlow`, keep `aiConfig`~~ ✅

**What:** Edit `apps/frontend/src/types/event-config.ts`:
1. Add import: `import type { ModuleConfig } from './module-config'`
2. Change `moduleFlow: string[]` → `moduleFlow: ModuleConfig[]`

Do **not** remove `aiConfig` or `AiConfig` in this task. The existing routes `routes/select.tsx` and `routes/loading.tsx` still read `config.aiConfig.themes` — removing it now would break compilation of live code. Full removal happens in V2-3.15 when those routes are deleted.

**Files:**
- `apps/frontend/src/types/event-config.ts`

**Input:** V2-1.2 complete.

**Output:**
- `EventConfig.moduleFlow` is `ModuleConfig[]`
- `aiConfig: AiConfig` and `AiConfig` interface remain unchanged
- File compiles with no TypeScript errors
- Existing frontend routes are unaffected

**Verification:**
- Layer 1: Lint changed file — no errors
- Layer 2: n/a
- Layer 3: n/a

**Risk:** Low. Minimal change — one field type updated, nothing removed.

---

### ~~V2-1.5 — SQL migration: restructure `event_configs.config_json` to V2 shape~~ ✅

**What:** Update the Shell event's `event_configs.config_json` in Supabase:
- Expand `moduleFlow` from the current stub string array to the fully typed 6-module array
- Move AI config (provider + full themes) into the `ai-generation` module entry
- Remove the top-level `aiConfig` key

Run in the Supabase dashboard SQL editor.

**Files:** Supabase SQL (run in dashboard — not a code file)

**Input:**
- V2-1.1 complete (type shape needed to write correct JSON)
- Current `event_configs.config_json` in hand — the actual theme URLs, prompts, and canvas dimensions live there

**Step 1 — Pull current values (run first, keep the output open):**
```sql
SELECT config_json->'aiConfig' AS current_ai_config
FROM event_configs
WHERE event_id = 'evt_shell_001';
```
Copy the output. You will paste the `themes` array and `provider` value into Step 2.

**Step 2 — Run the migration (fill `<...>` placeholders with values from Step 1):**
```sql
UPDATE event_configs
SET config_json = (
  jsonb_set(
    config_json,
    '{moduleFlow}',
    '[
      {"moduleId": "welcome", "position": "fixed-first"},
      {
        "moduleId": "theme-selection",
        "position": "pre-photo",
        "outputKey": "selectedTheme",
        "themes": [
          {"id": "pitcrew", "label": "Pit Crew", "previewImageUrl": "<previewImageUrl from Step 1>"},
          {"id": "motogp",  "label": "MotoGP",   "previewImageUrl": "<previewImageUrl from Step 1>"},
          {"id": "f1",      "label": "F1",        "previewImageUrl": "<previewImageUrl from Step 1>"}
        ]
      },
      {"moduleId": "camera", "position": "fixed-camera", "outputKey": "originalPhoto", "maxRetakes": 2},
      {"moduleId": "form",   "position": "flexible",     "outputKey": "userInfo"},
      {
        "moduleId": "ai-generation",
        "position": "post-photo",
        "outputKey": "finalPhoto",
        "provider": "<provider from Step 1>",
        "themes": <paste the full themes array from Step 1 exactly as-is>
      },
      {"moduleId": "result", "position": "fixed-last"}
    ]'::jsonb
  )
) - 'aiConfig'
WHERE event_id = 'evt_shell_001';
```

The `-` operator at the end removes the `aiConfig` key from the updated document. `jsonb_set` replaces the existing stub `moduleFlow`.

**Step 3 — Verify (run immediately after):**
```sql
SELECT
  jsonb_typeof(config_json->'moduleFlow')        AS moduleflow_type,
  jsonb_array_length(config_json->'moduleFlow')  AS step_count,
  config_json->'moduleFlow'->0->>'moduleId'      AS step_0,
  config_json->'moduleFlow'->5->>'moduleId'      AS step_5,
  (config_json ? 'aiConfig')                     AS has_legacy_aiconfig
FROM event_configs
WHERE event_id = 'evt_shell_001';
```

**Output:**
- `moduleflow_type = array`
- `step_count = 6`
- `step_0 = welcome`
- `step_5 = result`
- `has_legacy_aiconfig = false`
- All theme data (URLs, prompts, canvas dimensions) preserved inside the `ai-generation` module entry
- `theme-selection.themes[]` contains only `{ id, label, previewImageUrl }` — not the full AI config

**Verification:**
- Layer 1: n/a (SQL, not TypeScript)
- Layer 2: n/a
- Layer 3: Step 3 query above — all five values must match expected output exactly

**Risk:** Medium. Modifying the live database config. If the migration corrupts the JSON, the kiosk `/api/config` endpoint will return a malformed response. Mitigations:
1. Keep the Step 1 output — it's your rollback source
2. If Step 3 shows unexpected values, restore immediately:
   ```sql
   UPDATE event_configs
   SET config_json = '<paste full original config_json from Step 1 output>'::jsonb
   WHERE event_id = 'evt_shell_001';
   ```
3. V2-1.6 must be done before deploying — the endpoint reads from the new shape after this migration

---

### ~~V2-1.6 — Update `api.ai-generate.ts` to read from `moduleFlow` instead of `aiConfig`~~ ✅

**What:** The `resolveThemeConfig` function in `apps/web/src/routes/api.ai-generate.ts` reads `config.aiConfig.themes` and `config.aiConfig.provider` (lines 55–72). After V2-1.3 removed `aiConfig` from the type, these lines have TypeScript errors. Fix them to read the `ai-generation` module entry from `moduleFlow` instead.

Read `apps/web/src/routes/api.ai-generate.ts` and `apps/web/src/types/module-config.ts` before starting.

The change is confined to `resolveThemeConfig` only — the rest of the handler is unchanged.

**Files:**
- `apps/web/src/routes/api.ai-generate.ts`

**Input:** V2-1.3 complete (type change), V2-1.5 complete (data in new shape — the endpoint must not ship before the DB is migrated).

**Output:** Inside `resolveThemeConfig`, after fetching the event config from Supabase:
- Find the AI module: `config.moduleFlow.find(m => m.moduleId === 'ai-generation')`
- Return `envFallback` with a warning if no `ai-generation` module is found
- Cast the found module to `AiGenerationModuleConfig`
- Read `provider` and `themes` from the cast module (same fields, new location)
- Find the theme: `aiModule.themes.find(t => t.id === theme)` (unchanged logic)
- Return `{ provider: aiModule.provider, templateUrl: themeConfig.templateImageUrl, prompt: themeConfig.prompt }` (unchanged shape)
- The `envFallback` path (when no `eventId` is provided) is unchanged — still reads from `AI_PROVIDER` env var
- All TypeScript errors in this file are resolved

**Verification:**
- Layer 1: Lint changed file — no new errors
- Layer 2: `pnpm wb test` — existing 4 tests in `ai-generation.service.test.ts` still pass (they test `AIGenerationService`, not `resolveThemeConfig`, so no new tests are needed here)
- Layer 3 (manual): Run a full kiosk flow through camera → AI generation → result. Confirm the AI-generated photo is produced correctly with the correct theme. This is the highest-stakes verification in Phase 1 — the AI path must work end-to-end.

**Risk:** Medium-high. Changes the live AI generation code path. Two hard sequencing rules:
1. V2-1.5 (DB migration) must be complete before this code is deployed — the endpoint reads from the new `moduleFlow` shape; if the DB still has the old `aiConfig` shape, `resolveThemeConfig` will return `envFallback` silently or throw
2. Do not deploy to Cloudflare Workers until Layer 3 verification passes locally

---

### ~~V2-1.7 — Resolve any remaining TypeScript errors in `apps/frontend` from type changes~~ ✅

**What:** After V2-1.4, verify the frontend compiles cleanly. Fix any TypeScript errors caused by `moduleFlow` changing from `string[]` to `ModuleConfig[]`. Expected to be a low-effort or zero-change task — existing routes do not read `moduleFlow`, so no route file should be affected.

Read `apps/frontend/src/contexts/EventConfigContext.tsx` before starting — it is the most likely source of any error (it imports `EventConfig`).

**Files:**
- Any frontend file with TypeScript errors from V2-1.4 (likely none)

**Input:** V2-1.4 complete.

**Output:**
- Frontend compiles with no new TypeScript errors
- `config.aiConfig` references in `routes/select.tsx` and `routes/loading.tsx` are untouched — those are Phase 3

**Verification:**
- Layer 1: `git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint` — no new errors
- Layer 2: n/a
- Layer 3: n/a

**Risk:** Low. Expected to be a no-op or trivial fix.

---

## Phase 2 — Session Model

### ~~V2-2.1 — Supabase SQL migration: extend `sessions` table~~ ✅

**What:** The `sessions` table (created in TASK-5.1, V1) currently has: `id, event_id, photo_path, user_info, created_at`. V2 sessions are created at the start of the flow before a photo or user info exists. Extend the schema to support this.

Run in the Supabase dashboard SQL editor.

**Files:** Supabase SQL (run in dashboard)

**Input:** Nothing — self-contained. Can run in parallel with Phase 1.

**SQL to run:**
```sql
-- Lifecycle tracking
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS status       TEXT         NOT NULL DEFAULT 'in_progress';
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS started_at   TIMESTAMPTZ  NOT NULL DEFAULT now();

-- Pipeline output accumulation
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS module_outputs  JSONB;

-- photo_path and user_info are now populated mid-flow, not at row creation
ALTER TABLE sessions ALTER COLUMN photo_path  DROP NOT NULL;
ALTER TABLE sessions ALTER COLUMN user_info   DROP NOT NULL;
```

**Output:**
- `sessions` table has `status TEXT NOT NULL DEFAULT 'in_progress'`
- `sessions` table has `started_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `sessions` table has `module_outputs JSONB` (nullable)
- `photo_path` and `user_info` are nullable
- Existing rows are unaffected — new columns get defaults, nullable change has no effect on existing data

**Verification:**
- Layer 1: n/a
- Layer 2: n/a
- Layer 3 (manual): Run this query and confirm all columns are present:
  ```sql
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_name = 'sessions'
  ORDER BY ordinal_position;
  ```
  Confirm: `status` (NOT NULL, default `in_progress`), `started_at` (NOT NULL, default `now()`), `module_outputs` (nullable, no default), `photo_path` (nullable), `user_info` (nullable).

**Risk:** Low — additive schema changes and nullability relaxation. Existing rows and the existing `createSession` call in `submit-photo.usecase.ts` are unaffected (it passes `photo_path` and `user_info` explicitly, which still works when the columns are nullable).

---

### ~~V2-2.2 — Add `startSession` to `SessionRepository`~~ ✅

**What:** Add a new `startSession(eventId: string): Promise<{ sessionId: string }>` method to the existing `SessionRepository` class. Do not modify the existing `createSession` method — it is still called by `submit-photo.usecase.ts` and will be refactored in Phase 3.

Read `apps/web/src/repositories/session.repository.ts` before starting.

**Files:**
- `apps/web/src/repositories/session.repository.ts`

**Input:** V2-2.1 complete (new columns must exist before inserting into them).

**Output:**
- New method `startSession(eventId: string): Promise<{ sessionId: string }>` on `SessionRepository`
- Generates session ID using `crypto.randomUUID()` (available in Cloudflare Workers — no import needed)
- Inserts `{ id, event_id: eventId, status: 'in_progress' }` into `sessions` — `started_at` and `created_at` use column defaults
- Returns `{ sessionId: id }` on success
- Throws a clear `Error` with message on Supabase insert failure
- Existing `createSession` and `getSession` methods are unchanged

**Verification:**
- Layer 1: Lint changed file — no new errors
- Layer 2: Tested via V2-2.4 (unit test covers `startSession`)
- Layer 3: n/a

**Risk:** Low. Additive change to an existing class.

---

### ~~V2-2.3 — Create `POST /api/session/start` endpoint~~ ✅

**What:** New endpoint that creates a session row at the start of the guest flow and returns the session ID. Follow the same structure as `apps/web/src/routes/api.photo.ts` (auth guard, body parse, repository call, json response).

Read `apps/web/src/routes/api.photo.ts` before writing — replicate its auth pattern exactly.

**Files:**
- `apps/web/src/routes/api.session-start.ts` (new)

**Input:** V2-2.2 complete.

**Output:**
- `POST /api/session/start` is a new TanStack Start file route
- Requires `Authorization: Bearer <API_CLIENT_KEY>` header — returns `401` if missing or invalid
- Accepts JSON body: `{ eventId: string }`
- Returns `400` if `eventId` is missing or empty
- Calls `new SessionRepository().startSession(eventId)`
- Returns `200` with `{ sessionId: string }` on success
- Returns `500` with `{ error: string }` on repository failure

**Verification:**
- Layer 1: Lint new file — no errors
- Layer 2: Tests in V2-2.4 cover this endpoint indirectly (via the repository layer)
- Layer 3 (manual): Start the backend with `pnpm wb dev`. Send a test request:
  ```bash
  curl -X POST http://localhost:3000/api/session/start \
    -H "Authorization: Bearer <API_CLIENT_KEY from apps/web/.env>" \
    -H "Content-Type: application/json" \
    -d '{"eventId":"evt_shell_001"}'
  ```
  Confirm: response is `{ "sessionId": "<uuid>" }`. Check the Supabase `sessions` table — a new row exists with `status = 'in_progress'` and `photo_path = null`.

**Risk:** Low. New endpoint — nothing calls it yet. No impact on any existing flow.

---

### ~~V2-2.4 — Unit tests for `SessionRepository.startSession`~~ ✅

**What:** Write unit tests for the new `startSession` method. Follow the pattern in `apps/web/src/services/ai-generation.service.test.ts`: Vitest, `vi.resetModules()`, `vi.doMock()`, dynamic `import()`. Mock `getSupabaseAdminClient` to avoid hitting the real database.

Read `apps/web/src/services/ai-generation.service.test.ts` before writing — replicate its structure.

**Files:**
- `apps/web/src/repositories/session.repository.test.ts` (new)

**Input:** V2-2.2 complete.

**Output:** Tests cover:
1. **Success path:** Mock Supabase returns no error → `startSession` returns `{ sessionId: string }` where `sessionId` is a valid UUID → the Supabase `insert` was called with `{ id: <uuid>, event_id: 'evt_shell_001', status: 'in_progress' }`
2. **Supabase insert failure:** Mock Supabase returns `{ error: { message: 'db error' } }` → `startSession` throws an `Error` containing `'db error'`

All tests pass with `pnpm wb test`.

**Verification:**
- Layer 1: Lint new file — no errors
- Layer 2: `pnpm wb test` — all tests pass (existing 4 + new 2 = 6 total)
- Layer 3: n/a

**Risk:** Low.

---

## Phase 3 — Module Pipeline Renderer

**Goal:** Replace the 6 hardcoded route files with a state-machine pipeline driven by `moduleFlow`. Delete `PhotoboothContext`. Move inactivity timeout to the pipeline level. At the end of this phase the app has no guest-flow routes — only `/data` and `/test` remain as real routes.

**Before starting:** Read all 6 existing route files and the files they reference. They are the canonical source for each module's UI and business logic.

**Sub-phase order:** 3a (scaffolding) → 3b (module conversions, parallelisable) → 3c (wire + delete). Never delete old code before the replacement is wired and smoke-tested.

---

### ~~V2-3.1 — Create `ModuleProps` interface~~ ✅

**What:** Create `apps/frontend/src/modules/types.ts` — the standard props contract every module component must satisfy.

**Files:**
- `apps/frontend/src/modules/types.ts` (new)

**Input:** V2-1.2 complete (`ModuleConfig` type exists in `apps/frontend`).

**Output:**
```typescript
import type { ModuleConfig } from '../types/module-config'

export interface ModuleProps {
  config: ModuleConfig
  outputs: Record<string, unknown>
  onComplete: (output?: Record<string, unknown>) => void
  onBack: () => void
}
```

**Verification:**
- Layer 1: lint new file — no errors
- Layer 2: n/a — types only
- Layer 3: n/a

**Risk:** Low. New file, nothing imports it yet.

---

### ~~V2-3.2 — Create `PipelineContext`~~ ✅

**What:** Create `apps/frontend/src/contexts/PipelineContext.tsx`. This is the central state store for the guest pipeline — it replaces `PhotoboothContext` entirely.

**Files:**
- `apps/frontend/src/contexts/PipelineContext.tsx` (new)

**Input:** V2-3.1 complete.

**Output — `PipelineContextType`:**
```typescript
interface PipelineContextType {
  sessionId: string | null
  currentIndex: number
  moduleOutputs: Record<string, unknown>
  suppressInactivity: boolean
  advance: (output?: Record<string, unknown>) => void
  back: () => void
  reset: () => void
  setSessionId: (id: string) => void
  setSuppressInactivity: (suppress: boolean) => void
}
```

**Behaviour:**
- `advance(output?)` — merges `output` into `moduleOutputs` (spread), then increments `currentIndex`
- `back()` — decrements `currentIndex`; floor is 0
- `reset()` — sets `currentIndex` to 0, clears `moduleOutputs` to `{}`, clears `sessionId` to `null`, sets `suppressInactivity` to `false`
- `setSessionId(id)` — sets `sessionId`; called by `PipelineRenderer` after session start API succeeds (V2-3.11)
- `setSuppressInactivity(suppress)` — sets `suppressInactivity`; called by `AiGenerationModule` to pause the inactivity timer during generation (V2-3.9, V2-3.12)

Export `PipelineProvider` and `usePipeline()` hook (throws if used outside provider).

**Verification:**
- Layer 1: lint new file — no errors
- Layer 2: n/a — tested implicitly through V2-3.4 and later tasks
- Layer 3: n/a

**Risk:** Low. New file, nothing uses it yet.

---

### ~~V2-3.3 — Create empty module registry~~ ✅

**What:** Create `apps/frontend/src/modules/registry.ts` — a static map from `moduleId` string to React component. Starts empty; modules register themselves in V2-3.5 through V2-3.10.

**Files:**
- `apps/frontend/src/modules/registry.ts` (new)

**Input:** V2-3.1 complete.

**Output:**
```typescript
import type React from 'react'
import type { ModuleProps } from './types'

export const MODULE_REGISTRY: Record<string, React.ComponentType<ModuleProps>> = {}
```

**Verification:**
- Layer 1: lint new file — no errors
- Layer 2: n/a
- Layer 3: n/a

**Risk:** Low. New file.

---

### ~~V2-3.4 — Create `PipelineRenderer`~~ ✅

**What:** Create `apps/frontend/src/components/PipelineRenderer.tsx`. This component drives the entire guest flow. It reads `moduleFlow` from `EventConfig`, maps `currentIndex` to a component in `MODULE_REGISTRY`, and renders it with the standard `ModuleProps`.

At this stage (3a), the session start call (V2-3.11) and inactivity timeout (V2-3.12) are **not yet wired in** — those are added in 3c. The renderer is wired into `renderer.tsx` in V2-3.13. This task only creates the file.

Read `apps/frontend/src/contexts/EventConfigContext.tsx` and `apps/frontend/src/contexts/PipelineContext.tsx` before writing.

**Files:**
- `apps/frontend/src/components/PipelineRenderer.tsx` (new)

**Input:** V2-3.2 and V2-3.3 complete.

**Output:**
- Reads `config.moduleFlow` from `useEventConfig()`
- Reads `currentIndex`, `moduleOutputs`, `advance`, `back` from `usePipeline()`
- Derives `currentModule = config.moduleFlow[currentIndex]`
- Looks up `Component = MODULE_REGISTRY[currentModule?.moduleId]`
- If `currentModule` is undefined (index out of bounds) or `Component` is undefined (unregistered `moduleId`): render an error card with the module ID shown — do not throw
- Renders `<Component config={currentModule} outputs={moduleOutputs} onComplete={advance} onBack={back} />`

**Verification:**
- Layer 1: lint new file — no errors
- Layer 2: n/a
- Layer 3: n/a (wired and smoke-tested in V2-3.13)

**Risk:** Low. New file, not yet mounted in the app.

---

### ~~V2-3.5 — Create `WelcomeModule`~~ ✅

**What:** Create `apps/frontend/src/modules/WelcomeModule.tsx` — adapted from `apps/frontend/src/routes/index.tsx`. Register it in `MODULE_REGISTRY`.

Read `apps/frontend/src/routes/index.tsx` before writing.

**Files:**
- `apps/frontend/src/modules/WelcomeModule.tsx` (new)
- `apps/frontend/src/modules/registry.ts`

**Input:** V2-3.4 complete.

**Key changes from `routes/index.tsx`:**
- Remove `useNavigate` — replace `navigate('/select')` with `props.onComplete()`
- Keep `useEventConfig()` for `refresh()` — call `refresh()` before `onComplete()` in `handleStart` (re-fetches config in background for the next session, same as current behaviour)
- Remove the `useEffect` with the `console.log` screen size debug lines
- Props: `config: ModuleConfig, outputs: Record<string, unknown>, onComplete, onBack` — `onBack` is unused (welcome has no back)
- `WelcomeModule` produces no output: `onComplete()` (no argument)

**Output:**
- `WelcomeModule` renders the same splash screen UI as `routes/index.tsx`
- `MODULE_REGISTRY['welcome'] = WelcomeModule`

**Verification:**
- Layer 1: lint changed files — no errors
- Layer 2: n/a
- Layer 3: n/a (wired in V2-3.13)

**Risk:** Low. Additive — the old route still exists until V2-3.15.

---

### ~~V2-3.6 — Create `ThemeSelectionModule`~~ ✅

**What:** Create `apps/frontend/src/modules/ThemeSelectionModule.tsx` — adapted from `apps/frontend/src/routes/select.tsx`. Register it in `MODULE_REGISTRY`.

Read `apps/frontend/src/routes/select.tsx` before writing.

**Files:**
- `apps/frontend/src/modules/ThemeSelectionModule.tsx` (new)
- `apps/frontend/src/modules/registry.ts`

**Input:** V2-3.4 complete.

**Key changes from `routes/select.tsx`:**
- Remove `useNavigate`, `usePhotobooth`
- Theme list: replace `config.aiConfig.themes` with `(config as ThemeSelectionModuleConfig).themes` — the shape is the same (`id`, `label`, `previewImageUrl`)
- `handleSelectTheme(themeId)`: instead of `setSelectedTheme({ theme: themeId })` + `navigate('/camera')`, call `onComplete({ selectedTheme: { id: themeId, label: theme.label } })` — find `theme` by `themeId` to get the label
- Back button: replace `navigate('/')` with `onBack()`

**Output:**
- `ThemeSelectionModule` renders the same theme-selection UI as `routes/select.tsx`
- `onComplete` produces `{ selectedTheme: { id: string, label: string } }`
- `MODULE_REGISTRY['theme-selection'] = ThemeSelectionModule`

**Verification:**
- Layer 1: lint changed files — no errors
- Layer 2: n/a
- Layer 3: n/a

**Risk:** Low.

---

### ~~V2-3.7 — Create `CameraModule`~~ ✅

**What:** Create `apps/frontend/src/modules/CameraModule.tsx` — adapted from `apps/frontend/src/routes/camera.tsx`. Register it in `MODULE_REGISTRY`.

Read `apps/frontend/src/routes/camera.tsx` before writing. It is the most complex route — read it fully before touching anything.

**Files:**
- `apps/frontend/src/modules/CameraModule.tsx` (new)
- `apps/frontend/src/modules/registry.ts`

**Input:** V2-3.4 complete.

**Key changes from `routes/camera.tsx`:**
- Remove `useNavigate`, `usePhotobooth`
- `MAX_RETAKE_COUNT = 2` hardcoded constant → read from `(config as CameraModuleConfig).maxRetakes`. Replace every use of `MAX_RETAKE_COUNT` with `config.maxRetakes` (appears in `handleRetake` disable condition and the `disabled` prop on the retake button)
- `handleNext()`: replace `setOriginalPhotos(capturedPhotos)` + `navigate('/form')` with `onComplete({ originalPhoto: capturedPhotos[0] })` — note: singular `originalPhoto`, not `originalPhotos` array; only `capturedPhotos[0]` is needed
- Back button (top-left): replace `navigate('/')` with `onBack()`

**Output:**
- `CameraModule` renders the same camera UI as `routes/camera.tsx`
- `onComplete` produces `{ originalPhoto: string }` (base64 PNG)
- `MODULE_REGISTRY['camera'] = CameraModule`

**Verification:**
- Layer 1: lint changed files — no errors
- Layer 2: n/a
- Layer 3: n/a

**Risk:** Medium. Camera setup/teardown logic must be preserved exactly — do not change the `useEffect` cleanup, `streamRef` management, or canvas draw loop.

---

### ~~V2-3.8 — Create `FormModule`~~ ✅

**What:** Create `apps/frontend/src/modules/FormModule.tsx` — adapted from `apps/frontend/src/routes/form.tsx`. Register it in `MODULE_REGISTRY`.

Read `apps/frontend/src/routes/form.tsx` before writing.

**Files:**
- `apps/frontend/src/modules/FormModule.tsx` (new)
- `apps/frontend/src/modules/registry.ts`

**Input:** V2-3.4 complete.

**Key changes from `routes/form.tsx`:**
- Remove `useNavigate`, `usePhotobooth`
- `handleSubmit`: replace `setUserInfo({ name, email, phone })` + `navigate('/loading')` with `onComplete({ userInfo: { name, email, phone } })`
- Back button (top-left): replace `navigate('/')` with `onBack()`
- Keep all keyboard/input/consent logic exactly as-is

**Output:**
- `FormModule` renders the same form UI as `routes/form.tsx`
- `onComplete` produces `{ userInfo: { name: string, email: string, phone: string } }`
- `MODULE_REGISTRY['form'] = FormModule`

**Verification:**
- Layer 1: lint changed files — no errors
- Layer 2: n/a
- Layer 3: n/a

**Risk:** Low.

---

### ~~V2-3.9 — Create `AiGenerationModule`~~ ✅

**What:** Create `apps/frontend/src/modules/AiGenerationModule.tsx` — adapted from `apps/frontend/src/routes/loading.tsx`. Register it in `MODULE_REGISTRY`.

Read `apps/frontend/src/routes/loading.tsx` and `apps/frontend/src/types/module-config.ts` before writing.

**Files:**
- `apps/frontend/src/modules/AiGenerationModule.tsx` (new)
- `apps/frontend/src/modules/registry.ts`

**Input:** V2-3.4 complete.

**Key changes from `routes/loading.tsx`:**
- Remove `useNavigate`, `usePhotobooth`
- Read inputs from `outputs` prop (not context):
  - `originalPhoto: string` ← `outputs['originalPhoto'] as string`
  - `selectedTheme: { id: string, label: string }` ← `outputs['selectedTheme'] as { id: string, label: string }`
- Read AI config from `config` prop (not `eventConfig.aiConfig`):
  - Full theme config lookup: `(config as AiGenerationModuleConfig).themes.find(t => t.id === selectedTheme.id)`
  - `selectedTheme.id` replaces `selectedTheme.theme` throughout
- `apiBaseUrl` and `apiClientKey`: keep reading from `useEventConfig()` — they are not in `outputs`
- Inactivity suppression: call `usePipeline().setSuppressInactivity(true)` when `generateAIPhoto` begins, `setSuppressInactivity(false)` in the `finally` block (runs on success and on error)
- On success: call `onComplete({ finalPhoto: framedPhoto })` instead of `setFinalPhoto` + `navigate('/result')`
- Back to Home button on error: call `onBack()` instead of `navigate('/')`
- Guard: keep `processedRef.current` — still needed to prevent re-running on component re-render
- Guard condition: replace `!originalPhotos.length || !selectedTheme` with `!originalPhoto || !selectedTheme`

**Output:**
- `AiGenerationModule` renders the same loading/slideshow UI as `routes/loading.tsx`
- `onComplete` produces `{ finalPhoto: string }` (base64 PNG with racing frame applied)
- `MODULE_REGISTRY['ai-generation'] = AiGenerationModule`

**Verification:**
- Layer 1: lint changed files — no errors
- Layer 2: n/a
- Layer 3: n/a (full AI path smoke-tested in V2-3.13)

**Risk:** Medium-high. The AI generation + frame compositing path must work correctly end-to-end. The `processedRef` guard must stay to prevent double-calls. The inactivity suppression must be cleaned up in `finally` — not in `catch` alone.

---

### ~~V2-3.10 — Create `ResultModule`~~ ✅

**What:** Create `apps/frontend/src/modules/ResultModule.tsx` — adapted from `apps/frontend/src/routes/result.tsx`. Register it in `MODULE_REGISTRY`.

Read `apps/frontend/src/routes/result.tsx` before writing.

**Files:**
- `apps/frontend/src/modules/ResultModule.tsx` (new)
- `apps/frontend/src/modules/registry.ts`

**Input:** V2-3.4 complete.

**Key changes from `routes/result.tsx`:**
- Remove `usePhotobooth` — read everything from `outputs` prop and `useEventConfig()`:
  - `finalPhoto: string` ← `outputs['finalPhoto'] as string`
  - `selectedTheme: { id: string, label: string }` ← `outputs['selectedTheme'] as { id: string, label: string }`
  - `userInfo: { name: string, email: string, phone: string }` ← `outputs['userInfo'] as { name: string, email: string, phone: string }`
  - `eventId: string` ← `config.eventId` from `useEventConfig()` (same as current — `EventConfigContext` already exposes it via `config`)
- Replace `selectedTheme.theme` with `selectedTheme.id` in the `/api/photo` body and elsewhere
- `supabaseFolder`: `eventId ? \`events/${eventId}/photos\` : 'public'` — unchanged logic
- `hasSaved.current` guard: keep it — DATA-02 (remount double-save) is structurally resolved by the pipeline (modules stay mounted while active), but the guard costs nothing and prevents issues if the component ever re-renders
- No `onComplete` (result is the terminal module)
- No `onBack` (result has no back navigation — user must tap "Back to Home" which calls `pipeline.reset()` implicitly via the pipeline reset... actually the current "Back to Home" button navigates to `/`. In the module, replace `navigate('/')` on both "Retry Result" and "Back to Home" with `usePipeline().reset()`)
- "Retry Result" and "Back to Home" both call `usePipeline().reset()` — this returns `currentIndex` to 0 (WelcomeModule)

**Output:**
- `ResultModule` renders the same result UI as `routes/result.tsx`
- No `onComplete` call — result is the terminal step
- `MODULE_REGISTRY['result'] = ResultModule`
- DATA-02 (double-save via remount) is confirmed non-existent in pipeline architecture — note this in a comment

**Verification:**
- Layer 1: lint changed files — no errors
- Layer 2: n/a
- Layer 3: n/a (wired and smoke-tested in V2-3.13)

**Risk:** High. The result module handles saving, uploading, and printing — all irreversible side effects. The `hasSaved.current` guard must be preserved. Verify the Supabase upload and `/api/photo` call both use the correct field names after the `selectedTheme` shape change.

---

### ~~V2-3.11 — Wire session start into `PipelineRenderer`~~ ✅

**What:** Add session-start logic to `apps/frontend/src/components/PipelineRenderer.tsx`. When `WelcomeModule` calls `onComplete`, the renderer must call `POST /api/session/start` before advancing the index.

Read `apps/frontend/src/components/PipelineRenderer.tsx` and `apps/frontend/src/contexts/EventConfigContext.tsx` before writing.

**Files:**
- `apps/frontend/src/components/PipelineRenderer.tsx`

**Input:** V2-2.3 complete (endpoint exists), V2-3.5 complete (WelcomeModule exists and is registered).

**Logic to add inside `PipelineRenderer`:**

```
handleComplete(output?) {
  if (moduleFlow[currentIndex].moduleId === 'welcome') {
    // Call POST /api/session/start before advancing
    setSessionStarting(true)
    fetch(`${apiBaseUrl}/api/session/start`, { method: 'POST', body: { eventId } })
      .then(({ sessionId }) => {
        setSessionId(sessionId)
        advance({ ...output, sessionId })
      })
      .catch(() => {
        setSessionStartError(true)   // show error UI, allow retry
      })
      .finally(() => setSessionStarting(false))
  } else {
    advance(output)
  }
}
```

- `apiBaseUrl`, `apiClientKey`, `config.eventId` all come from `useEventConfig()`
- Add local state: `sessionStarting: boolean`, `sessionStartError: boolean`
- Pass `handleComplete` as `onComplete` to the rendered module (instead of `advance` directly)
- Error UI: when `sessionStartError` is true, render a fullscreen error card with a "Try Again" button that clears the error (user taps "Start" again)
- Pass `Authorization: Bearer <apiClientKey>` header in the fetch call

**Verification:**
- Layer 1: lint changed file — no errors
- Layer 2: n/a
- Layer 3: tap "Start" on the kiosk → confirm a new row appears in Supabase `sessions` table with `status = 'in_progress'`

**Risk:** Medium. If this fails, the guest can't start a session. The error UI + retry path is critical. Do not swallow errors silently.

---

### ~~V2-3.12 — Move inactivity timeout to pipeline level; simplify `RootLayout`~~ ✅

**What:** Two coordinated changes:
1. Add `useInactivityTimeout` to `PipelineRenderer` — it fires `pipeline.reset()` on timeout
2. Remove inactivity timeout logic from `RootLayout`

Read `apps/frontend/src/layouts/RootLayout.tsx` and `apps/frontend/src/hooks/useInactivityTimeout.ts` before writing.

**Files:**
- `apps/frontend/src/components/PipelineRenderer.tsx`
- `apps/frontend/src/layouts/RootLayout.tsx`

**Input:** V2-3.2 complete (`PipelineContext` has `suppressInactivity`), V2-3.9 complete (`AiGenerationModule` calls `setSuppressInactivity`).

**Changes to `PipelineRenderer.tsx`:**
```typescript
const { suppressInactivity, reset } = usePipeline()
const { config } = useEventConfig()

useInactivityTimeout({
  onTimeout: reset,
  disabled: currentIndex === 0 || suppressInactivity,
  timeoutMs: config.techConfig.inactivityTimeoutSeconds * 1000,
})
```
- `currentIndex === 0` disables the timeout on the welcome screen (already "home")
- `suppressInactivity` disables it during AI generation

**Changes to `RootLayout.tsx`:**
- Remove `usePhotobooth()` import and call
- Remove `useNavigate()` import and call
- Remove `useLocation()` import and call
- Remove `useInactivityTimeout()` import and call
- Remove the `TIMEOUT_DISABLED_ROUTES` constant
- Keep `useEventConfig()` only if still needed (check — it is not, after removing the timeout)
- Result: `RootLayout` is just `<div className="min-h-svh bg-white text-black"><Outlet /></div>`

**Verification:**
- Layer 1: lint changed files — no errors
- Layer 2: n/a
- Layer 3: let the kiosk sit idle for `inactivityTimeoutSeconds` seconds on any screen except welcome — confirm it resets to welcome. Let it sit idle during AI generation — confirm it does NOT reset.

**Risk:** Medium. Inactivity timeout is safety-critical for kiosk UX. The `suppressInactivity` flag must be correctly set and cleared by `AiGenerationModule` — verify in smoke test.

---

### ~~V2-3.13 — Update `renderer.tsx`; update `NavigationListener`~~ ✅

**What:** Wire the pipeline into the app entry point. Replace the 6 guest-flow routes with a single `PipelineRenderer` route. Update `NavigationListener` so `Cmd+H` calls `pipeline.reset()`.

Read `apps/frontend/src/renderer.tsx` and `apps/frontend/src/components/NavigationListener.tsx` before writing.

**Files:**
- `apps/frontend/src/renderer.tsx`
- `apps/frontend/src/components/NavigationListener.tsx`

**Input:** All of V2-3.5 through V2-3.12 complete.

**Changes to `renderer.tsx`:**
- Remove import: `PhotoboothProvider` from `PhotoboothContext`
- Remove imports: `IndexPage`, `CameraPage`, `SelectPage`, `FormPage`, `LoadingPage`, `ResultPage`
- Add import: `PipelineProvider` from `contexts/PipelineContext`
- Add import: `PipelineRenderer` from `components/PipelineRenderer`
- Remove `<PhotoboothProvider>` wrapper
- Add `<PipelineProvider>` wrapper (inside `<EventConfigProvider>`, outside `<HashRouter>`)
- Replace the 6 `<Route>` entries for guest flow with: `<Route index element={<PipelineRenderer />} />`
- Keep: `<Route path="/data" element={<DataPage />} />` and `<Route path="/test" element={<TestPage />} />`
- Keep: `<NavigationListener />` — still inside `<HashRouter>`

**Changes to `NavigationListener.tsx`:**
- Add `usePipeline()` — call `pipeline.reset()` in the `onNavigateToHome` handler instead of `navigate('/')`
- Keep `navigate('/data')` in `onNavigateToData`
- Remove `useNavigate` import if no longer needed (it's still needed for the `/data` navigation)

**Final `renderer.tsx` structure:**
```tsx
<EventConfigProvider>
  <PipelineProvider>
    <HashRouter>
      <NavigationListener />
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<PipelineRenderer />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/test" element={<TestPage />} />
        </Route>
      </Routes>
    </HashRouter>
  </PipelineProvider>
</EventConfigProvider>
```

**Verification:**
- Layer 1: lint changed files — no errors
- Layer 2: n/a
- Layer 3 (full smoke test — most critical verification in Phase 3):
  1. Start the Electron app
  2. Tap "Start" → confirm welcome screen → theme selection appears
  3. Check Supabase `sessions` — new row with `status = 'in_progress'`
  4. Select a theme → camera screen appears
  5. Capture photo → form screen appears
  6. Fill in details → AI generation screen appears (slideshow + progress bar)
  7. Generation completes → result screen appears with final photo
  8. Tap "Print & Download" → QR code appears; check Supabase `users` table for new row
  9. Tap "Back to Home" → returns to welcome screen; pipeline state is cleared
  10. Let kiosk idle for timeout duration → returns to welcome automatically

**Risk:** High. This wires everything together. Do not proceed to V2-3.14 or V2-3.15 until the full smoke test passes. If smoke test fails, the old route files still exist and can be re-wired temporarily.

---

### ~~V2-3.14 — Delete `PhotoboothContext`~~ ✅

**What:** Delete `apps/frontend/src/contexts/PhotoboothContext.tsx` after confirming zero remaining usages.

**Files:**
- `apps/frontend/src/contexts/PhotoboothContext.tsx` (delete)

**Input:** V2-3.13 complete and smoke-tested.

**Steps:**
1. Run: `grep -r "usePhotobooth\|PhotoboothContext\|PhotoboothProvider" apps/frontend/src` — confirm zero results
2. Delete the file

**Verification:**
- Layer 1: lint the whole `apps/frontend/src` directory — no new errors
- Layer 2: n/a
- Layer 3: n/a

**Risk:** Low — by this point, V2-3.13 already removed the last usages.

---

### ~~V2-3.15 — Delete the 6 old route files~~ ✅

**What:** Delete `apps/frontend/src/routes/index.tsx`, `select.tsx`, `camera.tsx`, `form.tsx`, `loading.tsx`, `result.tsx`.

**Files:**
- `apps/frontend/src/routes/index.tsx` (delete)
- `apps/frontend/src/routes/select.tsx` (delete)
- `apps/frontend/src/routes/camera.tsx` (delete)
- `apps/frontend/src/routes/form.tsx` (delete)
- `apps/frontend/src/routes/loading.tsx` (delete)
- `apps/frontend/src/routes/result.tsx` (delete)

**Input:** V2-3.13 complete and smoke-tested, V2-3.14 complete.

**Steps:**
1. Confirm no remaining imports of these files: `grep -r "routes/index\|routes/select\|routes/camera\|routes/form\|routes/loading\|routes/result" apps/frontend/src`
2. Delete all 6 files
3. Run lint to confirm no broken imports

**Verification:**
- Layer 1: lint `apps/frontend/src` — no errors
- Layer 2: n/a
- Layer 3: run a quick smoke test (welcome → theme → camera launch) to confirm app still loads

**Risk:** Low — V2-3.13 already removed all imports. This is cleanup only.

---

## Dependency Graph

```
Phase 1 and Phase 2 are fully independent — they can run in parallel.

PHASE 1

V2-1.1 ──→ V2-1.2 ──→ V2-1.4 ──→ V2-1.7
       ──→ V2-1.3 ──────────────→ V2-1.6
       ──→ V2-1.5 ──────────────→ V2-1.6

(V2-1.6 requires both V2-1.3 and V2-1.5 before it can start)

PHASE 2

V2-2.1 ──→ V2-2.2 ──→ V2-2.3 ──→ V2-2.4
                  └──→ V2-2.4

PHASE 3

Sub-phase 3a (sequential):
V2-3.1 ──→ V2-3.2
       ──→ V2-3.3
       (V2-3.2 + V2-3.3) ──→ V2-3.4

Sub-phase 3b (all depend on V2-3.4; can run in parallel with each other):
V2-3.4 ──→ V2-3.5
       ──→ V2-3.6
       ──→ V2-3.7
       ──→ V2-3.8
       ──→ V2-3.9
       ──→ V2-3.10

Sub-phase 3c (sequential):
(V2-3.5 + V2-2.3) ──→ V2-3.11 ──→ V2-3.12 ──→ V2-3.13 ──→ V2-3.14 ──→ V2-3.15
(V2-3.6 through V2-3.10 must all be complete before V2-3.12)
(V2-3.2) ──────────────────────→ V2-3.12

CROSS-PHASE

Phase 3 fully done → write Phase 4 decomposition → start Phase 4
```
