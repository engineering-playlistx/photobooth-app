# Task Decomposition — V2 Phases 1 & 2

**Status:** 🏗️ In progress — Phase 1 underway
**Scope:** Phase 1 (Type System + DB Migration) and Phase 2 (Session Model) only.
Phase 3+ decomposition will be written before those phases begin.

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

### V2-2.1 — Supabase SQL migration: extend `sessions` table

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

CROSS-PHASE (Phase 3 start gates)

Phase 1 fully done + Phase 2 fully done → write Phase 3 decomposition → start Phase 3
```
