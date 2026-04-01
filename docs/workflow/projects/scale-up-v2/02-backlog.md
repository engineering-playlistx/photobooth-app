# scale-up-v2 — Backlog

**Purpose:** Tracks all work inherited from `scale-up-v1` plus new V2 architecture tasks. Full architecture decisions are in `01-scope.md` — read that first.

---

## Part A — V1 Carryover (Tech Debt)

These are unfinished items from `scale-up-v1/06-backlogs.md`. They are resolved in V2-Phase 6 unless noted. Items that directly enable V2 architecture work are resolved earlier.

### P0 — Production Blockers

| ID | Issue | Origin | File(s) |
|----|-------|--------|---------|
| RISK-02 | Supabase upload failure leaves an irrecoverable partial save. If the network drops between the local SQLite write and Supabase upload, and the inactivity timer fires before the retry succeeds, the guest's record is permanently lost from the cloud. | `06-backlogs.md` | `apps/frontend/src/routes/result.tsx` |

**Note:** RISK-02 is structurally resolved by decision B (session row created on Welcome tap, not on `/api/photo`). The session always exists in Supabase before any upload attempt. Confirm full resolution in V2-3.10 (ResultModule migration).

---

### P1 — Security

| ID | Issue | Fix Summary | File(s) |
|----|-------|-------------|---------|
| SEC-02 | Dashboard login shows raw Supabase error strings ("Email not confirmed"), confirming account existence | Map Supabase error codes to generic "Incorrect email or password" message | `dashboard/login.tsx` |
| SEC-03 | Name sanitization strips only `<>` — no max length, no control character filtering | Add max 100 chars + strip control chars | `api.photo.ts` |

---

### P2 — Data Integrity

| ID | Issue | Fix Summary | File(s) |
|----|-------|-------------|---------|
| DATA-02 | `hasSaved.current` is a `useRef` — resets on component remount, causing double-saves if user navigates back to `/result` | Resolved by pipeline architecture — modules don't remount via navigation. Confirm no remount path exists in V2-3.10. | `routes/result.tsx` → `modules/ResultModule.tsx` |
| DATA-03 | No unique constraint on `(email, event_id)` in Supabase `users` table — duplicates possible | Add unique index; change repository to upsert | `user.repository.ts` + Supabase SQL |
| DATA-04 | Temp photo in `photobooth-bucket/temp/` not cleaned up if Replicate prediction creation fails | Add cleanup in the catch block | `api.ai-generate.ts` |

---

### P2 — UX

| ID | Issue | Fix Summary | File(s) |
|----|-------|-------------|---------|
| UX-01 | No visual feedback during Supabase save on result page | Show "Saving…" / "Ready" indicator near QR code area | `modules/ResultModule.tsx` |
| UX-02 | Inactivity timeout fires mid-generation if config timeout < AI generation time | Resolved by pipeline-level inactivity timeout (V2-3.12) — suppression logic is centralized, not per-route | `useInactivityTimeout.ts` |
| CODE-08 | `"DS-RX1"` fallback hardcoded in print handler | Throw error if `printerName` is empty instead of silently falling back | `apps/frontend/src/main.ts` |

---

### P2 — Code Quality

| ID | Issue | Fix Summary | File(s) |
|----|-------|-------------|---------|
| TASK-B.08 | `getKioskConfig()` typed as synchronous but called with `await` | Change type to `Promise<KioskConfig>` | `global.d.ts` |
| TASK-B.09 | Dashboard guest list and photo gallery load full dataset — no pagination | Server-side pagination with page param | `dashboard/guests.tsx`, `dashboard/photos.tsx` |
| TASK-B.10 | Bulk ZIP downloads all photos into browser memory — crashes on 300+ photos | Move ZIP generation server-side (streaming response) | `dashboard/photos.tsx` + new API route |
| TASK-B.11 | Print fires in parallel with Supabase upload — photo path may not be confirmed yet | Move `handlePrint()` to after upload + `/api/photo` both succeed | `modules/ResultModule.tsx` |
| TASK-B.12 | `/api/config` returns no caching headers — every session triggers a fresh Supabase read | Add `Cache-Control: max-age=60, stale-while-revalidate=300` | `api.config.ts` |
| TASK-B.14 | Email sending is disabled; success message says "email sent" | Re-enable email; fix attachment logic | `submit-photo.usecase.ts`, `email.service.tsx` |
| TASK-B.16 | SQLite `JSON.parse` calls have no error handling — corrupt row crashes the renderer | Wrap in try/catch; return sentinel value on failure | `sqlite.ts` |
| TASK-B.17 | `useEffect` in `index.tsx` missing dependency array — runs on every render | Resolved by deletion of `routes/index.tsx` in V2-3.15 | `routes/index.tsx` |
| TASK-B.18 | No "last retake" warning on camera page | Show "This is your last retake" when at limit | `modules/CameraModule.tsx` |
| TASK-B.19 | `'photobooth-bucket'` hardcoded in 3+ files | Extract to `utils/constants.ts` | Multiple files |
| PERF-01 | Dashboard auth check hits Supabase on every page navigation | Cache session in a short-lived store (Cloudflare KV or encrypted cookie) | `dashboard/_layout.tsx` |
| CODE-06 | `RacingTheme` type reference in `database.ts` may be stale | Verify and remove any lingering references | `utils/database.ts` |

---

## Part B — V2 Architecture Tasks (New Work)

Architecture decisions are finalized in `01-scope.md`. Tasks below flow directly from those decisions.

Each task lists: what to do, files touched, and what it depends on. Full acceptance criteria are written per-task when execution begins (not here — this is a backlog, not a sprint plan).

---

### V2-Phase 1 — Type System + DB Migration

Goal: Replace the `moduleFlow: string[]` stub with the full typed union. Migrate existing `event_configs` rows. No kiosk code changes yet.

| ID | Task | Files | Depends On |
|----|------|-------|------------|
| V2-1.1 | Create `apps/web/src/types/module-config.ts` — define `ModulePosition`, `BaseModuleConfig`, and the full `ModuleConfig` discriminated union (`WelcomeModuleConfig`, `CameraModuleConfig`, `ThemeSelectionModuleConfig`, `AiGenerationModuleConfig`, `FormModuleConfig`, `ResultModuleConfig`, `MiniQuizModuleConfig`). | `apps/web/src/types/module-config.ts` (new) | — |
| V2-1.2 | Create `apps/frontend/src/types/module-config.ts` — exact mirror of V2-1.1. Add header comment: `// MIRRORED — keep in sync with apps/web/src/types/module-config.ts` | `apps/frontend/src/types/module-config.ts` (new) | V2-1.1 |
| V2-1.3 | Update `apps/web/src/types/event-config.ts`: change `moduleFlow: Array<string>` → `moduleFlow: ModuleConfig[]`; remove `AiConfig` interface; remove `aiConfig` field from `EventConfig`. `AiThemeConfig` stays (it's used inside `AiGenerationModuleConfig`). | `apps/web/src/types/event-config.ts` | V2-1.1 |
| V2-1.4 | Update `apps/frontend/src/types/event-config.ts`: same changes as V2-1.3. | `apps/frontend/src/types/event-config.ts` | V2-1.2 |
| V2-1.5 | Write and run Supabase SQL migration: update the Shell event's `event_configs.config_json` — move `aiConfig.provider` and `aiConfig.themes` into the `ai-generation` entry inside `moduleFlow`; expand `moduleFlow` from the current stub array to a full typed 5-step array matching the Shell flow (`welcome → theme-selection → camera → form → ai-generation → result`). See seeded shape note below. | Supabase SQL (direct or migration script) | V2-1.1 |
| V2-1.6 | Fix any TypeScript errors in `apps/web` that result from the type changes (primarily in `api.config.ts` which references `EventConfig`). The endpoint logic itself doesn't change — it still passes `config_json` through. | `apps/web/src/routes/api.config.ts` | V2-1.3 |
| V2-1.7 | Fix any TypeScript errors in `apps/frontend` that result from the type changes. At this point the kiosk doesn't yet read `moduleFlow` (that's Phase 3), so errors are limited to places that reference the old `aiConfig` field. | Any frontend file referencing `config.aiConfig` | V2-1.4 |

**Seeded Shell `moduleFlow` shape after V2-1.5:**

```json
[
  { "moduleId": "welcome", "position": "fixed-first" },
  {
    "moduleId": "theme-selection",
    "position": "pre-photo",
    "outputKey": "selectedTheme",
    "themes": [
      { "id": "pitcrew", "label": "Pit Crew", "previewImageUrl": "..." },
      { "id": "motogp",  "label": "MotoGP",   "previewImageUrl": "..." },
      { "id": "f1",      "label": "F1",        "previewImageUrl": "..." }
    ]
  },
  { "moduleId": "camera", "position": "fixed-camera", "outputKey": "originalPhoto", "maxRetakes": 2 },
  { "moduleId": "form",   "position": "flexible",     "outputKey": "userInfo" },
  {
    "moduleId": "ai-generation",
    "position": "post-photo",
    "outputKey": "finalPhoto",
    "provider": "replicate",
    "themes": [
      { "id": "pitcrew", "label": "Pit Crew", "previewImageUrl": "...", "frameImageUrl": "...", "templateImageUrl": "...", "prompt": "...", "canvasWidth": 1080, "canvasHeight": 1920, "photoWidth": ..., "photoHeight": ..., "photoOffsetX": ..., "photoOffsetY": ... },
      { "id": "motogp",  ... },
      { "id": "f1",      ... }
    ]
  },
  { "moduleId": "result", "position": "fixed-last" }
]
```

**Theme id linkage:** `theme-selection.themes[].id` must match `ai-generation.themes[].id`. The `AiGenerationModule` reads `moduleOutputs.selectedTheme.id` and looks up the full theme config from its own `config.themes`. Theme-selection carries display data only (id, label, previewImageUrl).

---

### V2-Phase 2 — Session Model

Goal: Session row exists in Supabase from the moment the guest taps "Start". `module_outputs` column added for V2 data.

| ID | Task | Files | Depends On |
|----|------|-------|------------|
| V2-2.1 | Supabase SQL migration: add `status TEXT NOT NULL DEFAULT 'in_progress'`, `started_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `module_outputs JSONB` columns to `sessions` table. Make `photo_path` and `user_info` nullable (they're populated later in the flow, not at session start). | Supabase SQL | — |
| V2-2.2 | Add `startSession(eventId: string): Promise<{ sessionId: string }>` method to the existing `SessionRepository`. Generates a UUID for the session id, inserts a row with `{ id, event_id, status: 'in_progress', started_at: now() }`, returns `{ sessionId }`. The existing `createSession` method (called by `submit-photo.usecase.ts`) is updated in V2-3.11 — do not touch it here. | `apps/web/src/repositories/session.repository.ts` | V2-2.1 |
| V2-2.3 | Create `POST /api/session/start` endpoint. Auth: Bearer token (same pattern as other API routes). Input: `{ eventId: string }`. Calls `SessionRepository.startSession()`. Returns `{ sessionId: string }`. | `apps/web/src/routes/api.session-start.ts` (new) | V2-2.2 |
| V2-2.4 | Unit tests for `POST /api/session/start` — success path and auth failure. | `apps/web/src/routes/api.session-start.test.ts` (new) | V2-2.3 |

---

### V2-Phase 3 — Module Pipeline Renderer

Goal: Replace the 6 hardcoded route files with a state machine pipeline. Delete `PhotoboothContext`. Move inactivity timeout to pipeline level. This is the largest phase — execute tasks in order.

**Sub-phase 3a: Scaffolding (no existing code deleted yet)**

| ID | Task | Files | Depends On |
|----|------|-------|------------|
| V2-3.1 | Create `apps/frontend/src/modules/types.ts` — define `ModuleProps` interface: `{ config: ModuleConfig; outputs: Record<string, unknown>; onComplete: (output?: Record<string, unknown>) => void; onBack: () => void }` | `apps/frontend/src/modules/types.ts` (new) | V2-1.2 |
| V2-3.2 | Create `apps/frontend/src/contexts/PipelineContext.tsx` — `PipelineContextType` with `{ sessionId, currentIndex, moduleOutputs, advance, back, reset }`. `advance(output?)` merges output into `moduleOutputs` and increments `currentIndex`. `reset()` clears all state and sets `currentIndex` to 0. | `apps/frontend/src/contexts/PipelineContext.tsx` (new) | V2-3.1 |
| V2-3.3 | Create `apps/frontend/src/modules/registry.ts` — empty `MODULE_REGISTRY` object typed as `Record<string, React.ComponentType<ModuleProps>>`. Modules are registered in V2-3.5 through V2-3.10. | `apps/frontend/src/modules/registry.ts` (new) | V2-3.1 |
| V2-3.4 | Create `apps/frontend/src/components/PipelineRenderer.tsx` — reads `config.moduleFlow` from `useEventConfig()`, reads `currentIndex` from `usePipeline()`, looks up component in `MODULE_REGISTRY`, renders it. If `moduleId` is not in the registry, renders an error card (don't throw — bad config shouldn't crash the whole app). | `apps/frontend/src/components/PipelineRenderer.tsx` (new) | V2-3.2, V2-3.3 |

**Sub-phase 3b: Convert existing routes to modules (add new, keep old until 3c)**

| ID | Task | Files | Depends On |
|----|------|-------|------------|
| V2-3.5 | Convert Welcome: create `apps/frontend/src/modules/WelcomeModule.tsx` from `routes/index.tsx`. Replace `navigate('/select')` with `onComplete()`. Replace `refresh()` call — config is re-fetched at a different point in V2 (TBD: on each session start or on timer). Register as `'welcome'` in `MODULE_REGISTRY`. | `apps/frontend/src/modules/WelcomeModule.tsx` (new), `registry.ts` | V2-3.4 |
| V2-3.6 | Convert Theme Selection: create `apps/frontend/src/modules/ThemeSelectionModule.tsx` from `routes/select.tsx`. Reads `config` prop (typed as `ThemeSelectionModuleConfig`) for the theme list instead of `config.aiConfig.themes`. Calls `onComplete({ selectedTheme: { id, label } })`. Register as `'theme-selection'`. | `apps/frontend/src/modules/ThemeSelectionModule.tsx` (new), `registry.ts` | V2-3.4 |
| V2-3.7 | Convert Camera: create `apps/frontend/src/modules/CameraModule.tsx` from `routes/camera.tsx`. Reads `config.maxRetakes` from `CameraModuleConfig`. Calls `onComplete({ originalPhoto: base64 })`. Calls `onBack()` for the back button. Register as `'camera'`. | `apps/frontend/src/modules/CameraModule.tsx` (new), `registry.ts` | V2-3.4 |
| V2-3.8 | Convert Form: create `apps/frontend/src/modules/FormModule.tsx` from `routes/form.tsx`. Calls `onComplete({ userInfo: { name, email, phone } })`. Calls `onBack()`. Register as `'form'`. | `apps/frontend/src/modules/FormModule.tsx` (new), `registry.ts` | V2-3.4 |
| V2-3.9 | Convert AI Generation: create `apps/frontend/src/modules/AiGenerationModule.tsx` from `routes/loading.tsx`. Reads `originalPhoto` from `outputs['originalPhoto']` and `selectedTheme` from `outputs['selectedTheme']`. Reads full theme config (template URL, prompt, frame, canvas dimensions) by matching `selectedTheme.id` against `(config as AiGenerationModuleConfig).themes`. Calls `onComplete({ finalPhoto: base64 })`. Register as `'ai-generation'`. | `apps/frontend/src/modules/AiGenerationModule.tsx` (new), `registry.ts` | V2-3.4 |
| V2-3.10 | Convert Result: create `apps/frontend/src/modules/ResultModule.tsx` from `routes/result.tsx`. Reads `finalPhoto`, `userInfo`, `sessionId` from `outputs`. On mount: save local file, save to SQLite, upload to Supabase, call `/api/photo`. Confirm DATA-02 (double-save via remount) is no longer possible in pipeline architecture — modules don't remount via navigation. No `onComplete()` — result is the last step. No `onBack()`. Register as `'result'`. | `apps/frontend/src/modules/ResultModule.tsx` (new), `registry.ts` | V2-3.4 |

**Sub-phase 3c: Wire the pipeline into the app and delete old code**

| ID | Task | Files | Depends On |
|----|------|-------|------------|
| V2-3.11 | Wire session start into `PipelineRenderer`: after `WelcomeModule` calls `onComplete()`, before advancing to index 1, call `POST /api/session/start`. Store returned `sessionId` in `PipelineContext` via a dedicated setter. Inject `sessionId` into `moduleOutputs` so downstream modules can read it. Handle API failure gracefully (show error, allow retry). | `apps/frontend/src/components/PipelineRenderer.tsx` | V2-2.3, V2-3.5 |
| V2-3.12 | Move inactivity timeout to pipeline level: the timeout calls `reset()` on `PipelineContext` instead of navigating to `/`. Remove per-module inactivity suppression logic. The `AiGenerationModule` must suppress inactivity while generation is in flight — use a `suppressInactivity` flag passed via context or prop, not per-module `useEffect` guards. | `apps/frontend/src/contexts/PipelineContext.tsx` or `PipelineRenderer.tsx`, `useInactivityTimeout.ts` | V2-3.2 |
| V2-3.13 | Update `apps/frontend/src/renderer.tsx`: wrap app with `PipelineProvider`. Replace the 6 guest-flow `<Route>` entries with a single `<Route path="/" element={<PipelineRenderer />} />`. Keep `<Route path="/data">` and `<Route path="/test">`. Remove `PhotoboothProvider` import and usage. | `apps/frontend/src/renderer.tsx` | V2-3.5 through V2-3.10, V2-3.11, V2-3.12 |
| V2-3.14 | Delete `apps/frontend/src/contexts/PhotoboothContext.tsx`. Confirm zero remaining `usePhotobooth()` references across the codebase. | `apps/frontend/src/contexts/PhotoboothContext.tsx` (delete) | V2-3.13 |
| V2-3.15 | Delete the 6 old route files: `routes/index.tsx`, `routes/select.tsx`, `routes/camera.tsx`, `routes/form.tsx`, `routes/loading.tsx`, `routes/result.tsx`. | `apps/frontend/src/routes/` (6 files deleted) | V2-3.13 |

---

### V2-Phase 4 — Flow Builder (Dashboard)

Goal: Operator can view, reorder, add, remove, and configure modules in the kiosk flow without touching code.

| ID | Task | Files | Depends On |
|----|------|-------|------------|
| V2-4.1 | Flow builder page: ordered list of current modules from `event_configs.config_json.moduleFlow`. Each card shows module type and a remove button. Fixed modules (`fixed-first`, `fixed-camera`, `fixed-last`) show no remove button. | `apps/web/src/routes/dashboard/[eventId]/flow.tsx` (new) | V2-1.3 |
| V2-4.2 | "Add module" action: choose from available non-fixed modules; validate position constraints (e.g. `fixed-camera` cannot be added twice); insert into the list at a valid position. | `apps/web/src/routes/dashboard/[eventId]/flow.tsx` | V2-4.1 |
| V2-4.3 | Per-module inline config panels: expand a module card to edit its config. Each module type has its own panel. Minimum panels needed for V2: `theme-selection` (edit theme list — display data only), `ai-generation` (edit provider, full theme configs), `camera` (max retakes), `form` (no editable config for V2), `mini-quiz` (questions + options). The theme-selection and ai-generation panels must keep `themes[].id` in sync — editing a theme id in one updates the other. | `apps/web/src/routes/dashboard/[eventId]/flow.tsx` | V2-4.2 |
| V2-4.4 | Save `moduleFlow` changes: PUT/PATCH endpoint updates `event_configs.config_json.moduleFlow` for the event. The flow builder calls this on save. | `apps/web/src/routes/api.config.ts` or new `api.config-update.ts`, `apps/web/src/routes/dashboard/[eventId]/flow.tsx` | V2-4.3 |

---

### V2-Phase 5 — Mini Quiz Module

Goal: First new module built on the V2 system — proves the system works end-to-end for a net-new module.

| ID | Task | Files | Depends On |
|----|------|-------|------------|
| V2-5.1 | Build `apps/frontend/src/modules/MiniQuizModule.tsx`: renders questions from `(config as MiniQuizModuleConfig).questions` one at a time, records selected option, calls `onComplete({ quizAnswer: selectedOption })` after the last question. Calls `onBack()` on back. | `apps/frontend/src/modules/MiniQuizModule.tsx` (new) | V2-3.4 |
| V2-5.2 | Register `'mini-quiz'` in `MODULE_REGISTRY`. | `apps/frontend/src/modules/registry.ts` | V2-5.1 |
| V2-5.3 | Add Mini Quiz config panel to the flow builder (V2-4.3): add/remove questions, edit question text and options. | `apps/web/src/routes/dashboard/[eventId]/flow.tsx` | V2-4.3, V2-5.1 |
| V2-5.4 | Manual verification: configure a Mini Quiz module before Camera in the flow builder; run through the kiosk flow; confirm `quizAnswer` appears in the session's `module_outputs` in Supabase. | Manual test | V2-5.2, V2-5.3 |

---

### V2-Phase 6 — V1 Carryover Closure

All Part A items not resolved earlier are addressed here. Assign V2-6.x IDs during sprint planning from the table below.

| V2-6.x | Source ID | Notes |
|---------|-----------|-------|
| V2-6.1 | SEC-02 | Dashboard login error leak |
| V2-6.2 | SEC-03 | Name sanitization |
| V2-6.3 | DATA-03 | Unique constraint on `(email, event_id)` |
| V2-6.4 | DATA-04 | Temp photo cleanup on Replicate failure |
| V2-6.5 | UX-01 | Saving indicator on result page (fix in `ResultModule.tsx`) |
| V2-6.6 | CODE-08 | `"DS-RX1"` fallback in print handler |
| V2-6.7 | TASK-B.08 | `getKioskConfig()` sync type |
| V2-6.8 | TASK-B.09 | Dashboard pagination |
| V2-6.9 | TASK-B.10 | Server-side ZIP download |
| V2-6.10 | TASK-B.11 | Print after upload confirmed (fix in `ResultModule.tsx`) |
| V2-6.11 | TASK-B.12 | Cache-Control on `/api/config` |
| V2-6.12 | TASK-B.14 | Re-enable email sending |
| V2-6.13 | TASK-B.16 | SQLite JSON.parse error handling |
| V2-6.14 | TASK-B.18 | "Last retake" warning (fix in `CameraModule.tsx`) |
| V2-6.15 | TASK-B.19 | `'photobooth-bucket'` constant extraction |
| V2-6.16 | PERF-01 | Dashboard auth cache |
| V2-6.17 | CODE-06 | `RacingTheme` stale reference |
| V2-6.18 | SESSION-01 | `submit-photo.usecase.ts` calls `createSession()` with a new UUID instead of updating the existing `in_progress` session created by `startSession`. Fix: add `completeSession(sessionId, photoPath, userInfo, moduleOutputs)` to `SessionRepository`; replace `createSession()` call in `SubmitPhotoUseCase` with `completeSession()` using the `sessionId` passed in the request body; pass `sessionId` from `moduleOutputs` in `ResultModule`'s `/api/photo` call. | `session.repository.ts`, `submit-photo.usecase.ts`, `ResultModule.tsx`, `api.photo.ts` |
| V2-6.19 | SESSION-02 | Session `status` is never updated to `'completed'` — all rows stay `in_progress` forever. Resolved by V2-6.18 (`completeSession` sets `status = 'completed'`). | Depends on V2-6.18 |

---

### Deferred to V3 (Not in V2 Scope)

- AI provider fallback chain (Replicate → Google → error). Requires `ai_jobs` table or API contract change.
- Config version history + rollback snapshots (discard-changes UX is done; snapshots are not).
- Shared `packages/types` workspace to eliminate type mirroring between apps.
