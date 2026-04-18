# V9 — Test Plan & Workflow

**Theme:** Hygiene sprint — scalability, reliability, architecture quality, and readability.
**Goal:** Full test coverage across all system surfaces to catch bugs, undefined behavior, and edge cases before V9 implementation work begins.
**Created:** 2026-04-19
**Status:** Phase 0 complete ✅ — Phase 1 complete ✅ — Phase 2 complete ✅

---

## Phase 0 — Audit Results

### What Exists (34 tests, 5 files — all passing ✅)

| File | Tests | What's Covered |
|------|-------|----------------|
| `utils/validate-module-flow.test.ts` | 7 | Flow validation: required modules, duplicate ai-gen, theme mismatch, camera maxRetakes, empty AI theme prompt |
| `repositories/organization.repository.test.ts` | 5 | `findAll`, `findById` (not found + found), `create` |
| `repositories/session.repository.test.ts` | 6 | `startSession` (success + DB error), `updatePhotoPath` (success + error), `completeSession` (success + error) |
| `routes/api.session.photo.test.ts` | 12 | PATCH /api/session/photo — auth (4 cases), validation (4 cases), success, trimming, error (2 cases) |
| `services/ai-generation.service.test.ts` | 4 | Constructor only — provider init with correct/missing env vars |

### Coverage Gaps (priority-ordered)

| Area | Gap | Risk |
|------|-----|------|
| `AIGenerationService` methods | `createPrediction`, `getPredictionStatus`, `generateGoogleAISync`, `downloadAsBase64`, fallback chain — **zero tests** | High |
| `SubmitPhotoUseCase` | No tests at all — orchestration + email + session complete | High |
| `UserRepository` | No tests at all | Medium |
| `POST /api/session/start` | Route handler not tested | Medium |
| `POST /api/ai-generate` | Route handler not tested — auth, validation, provider selection, fallback | High |
| `GET /api/ai-generate-status` | Route handler not tested — polling, base64 download, provider mismatch | High |
| `POST /api/photo` | Route handler not tested — email, user save, phone normalization | Medium |
| `GET /api/config` | Route handler not tested — cache headers, unknown eventId | Medium |
| Input validation | Phone normalization (+62), email regex, name sanitization — no dedicated tests | Medium |
| Frontend components | No component tests (PipelineRenderer, modules, contexts) | Low (no Vitest DOM setup yet) |
| E2E | No Playwright tests | Low (setup cost) |

---

## Phased Workflow

### How to navigate this document

Each phase below has:
- **Goal** — what it achieves
- **Files to create** — one test file per source file (convention: `*.test.ts` beside the source)
- **Test cases** — the exact cases to write, with IDs matching the master list
- **Done when** — the exit criterion before moving to the next phase

Work through phases in order. Do not skip ahead — lower layers catch cheaper bugs.

---

### Phase 1 — Unit Tests: Business Logic

**Goal:** Test the pure business logic layer in isolation. All external dependencies (Supabase, Replicate, Google AI) are mocked via `vi.doMock`. Uses `vi.resetModules()` + dynamic `import()` to isolate env-var-driven constants.

**Priority:** Highest. These tests are fast, deterministic, and catch the most regressions per test written.

---

#### TASK-1.1 — `AIGenerationService` methods
**File to create:** `apps/web/src/services/ai-generation.service.test.ts` *(extend existing)*

The constructor is already tested. Add tests for the actual methods.

| Test ID | Description |
|---------|-------------|
| AG-SVC-01 | `createPrediction('replicate', photo, theme)` → calls Replicate client, returns predictionId |
| AG-SVC-02 | `createPrediction('google', photo, theme)` → calls Google AI, inserts into `ai_jobs`, returns jobId |
| AG-SVC-03 | `createPrediction` with fallback: primary throws → calls secondary provider |
| AG-SVC-04 | `createPrediction` with fallback: both throw → re-throws |
| AG-SVC-05 | `getPredictionStatus('replicate', id)` → polls Replicate, returns `{ status: 'processing' }` when running |
| AG-SVC-06 | `getPredictionStatus('replicate', id)` → returns `{ status: 'succeeded', base64: '...' }` when done |
| AG-SVC-07 | `getPredictionStatus('replicate', id)` → returns `{ status: 'failed' }` on failure |
| AG-SVC-08 | `getPredictionStatus('google', id)` → reads `ai_jobs`, returns base64 when ready |
| AG-SVC-09 | `getPredictionStatus('google', id)` → returns `{ status: 'processing' }` when job not complete |
| AG-SVC-10 | `downloadAsBase64(url)` → fetches URL, returns base64 string |
| AG-SVC-11 | `downloadAsBase64(url)` → throws on non-200 response |
| AG-SVC-12 | `extractUrl(output)` → handles array output (Replicate format) |
| AG-SVC-13 | `extractUrl(output)` → handles string output |

---

#### TASK-1.2 — `UserRepository`
**File to create:** `apps/web/src/repositories/user.repository.test.ts`

| Test ID | Description |
|---------|-------------|
| UR-01 | `createUser(data)` → inserts row, returns created user with id |
| UR-02 | `createUser(data)` → throws on Supabase error |
| UR-03 | `createUser(data)` → passes correct field mapping (snake_case in, camelCase out) |

---

#### TASK-1.3 — `SubmitPhotoUseCase`
**File to create:** `apps/web/src/usecases/submit-photo.usecase.test.ts`

| Test ID | Description |
|---------|-------------|
| UC-01 | Happy path: `execute()` → creates user, completes session, sends email → returns photoUrl |
| UC-02 | Email failure is non-blocking: email throws → still returns success (photo + session saved) |
| UC-03 | UserRepository failure → throws, session not completed |
| UC-04 | `completeSession` failure → throws |
| UC-05 | Phone passed to UserRepository is already-normalized (+62 format) |
| UC-06 | `execute()` with no sessionId → skips `completeSession`, still saves user |

---

#### TASK-1.4 — Input Validation Utilities
**Done:** Extracted `sanitizeName`, `validateEmail`, `validatePhone`, `standardizePhone` from `api.photo.ts` into `apps/web/src/utils/validation.ts`. `api.photo.ts` updated to import from there. Tests written at `apps/web/src/utils/validation.test.ts`.

**File:** `apps/web/src/utils/validation.ts` (extracted from `api.photo.ts`)

| Test ID | Description |
|---------|-------------|
| VAL-01 | Valid email formats accepted: `user@domain.com`, `user+tag@sub.domain.org` |
| VAL-02 | Invalid email formats rejected: no `@`, no domain, empty string |
| VAL-03 | Phone: `08xx` normalized to `+628xx` |
| VAL-04 | Phone: `+62xxx` passed through unchanged |
| VAL-05 | Phone: `628xx` normalized to `+628xx` |
| VAL-06 | Phone: completely invalid format rejected |
| VAL-07 | Name: `<script>` stripped of `<>` |
| VAL-08 | Name: normal string passes through unchanged |

**Done when:** `pnpm wb test` passes with all Phase 1 tests green.

---

### Phase 2 — API Route Tests

**Goal:** Test all HTTP route handlers with Supabase and external services mocked. Tests cover: authentication, input validation, success responses, error responses, and response shape.

**Pattern:** Same as `api.session.photo.test.ts` — mock `@tanstack/react-router` `createFileRoute` to capture the handler, then call it directly.

---

#### TASK-2.1 — `POST /api/session/start`
**File to create:** `apps/web/src/routes/api.session.start.test.ts`

| Test ID | Description |
|---------|-------------|
| S-01 | Valid eventId + correct auth → 200 + `{ sessionId: '...' }` |
| S-02 | Missing Authorization header → 401 |
| S-03 | Wrong bearer token → 401 |
| S-04 | Missing `eventId` body field → 400 |
| S-05 | Empty string `eventId` → 400 |
| S-06 | Repository `startSession` throws → 500 |
| S-07 | Unknown eventId (FK violation from Supabase) → behavior defined? 500 or 400 |

---

#### TASK-2.2 — `POST /api/ai-generate`
**File to create:** `apps/web/src/routes/api.ai-generate.test.ts`

| Test ID | Description |
|---------|-------------|
| AG-01 | Valid request (Replicate) → 200 + `{ predictionId }` |
| AG-02 | Valid request (Google) → 200 + `{ predictionId }` (job ID) |
| AG-03 | Missing auth → 401 |
| AG-04 | Missing `photo` field → 400 |
| AG-05 | Missing `theme` field → 400 |
| AG-06 | Primary provider fails → fallback provider used → 200 |
| AG-07 | Both providers fail → 500 with descriptive error |
| AG-08 | Service throws non-Error → 500 with generic message |

---

#### TASK-2.3 — `GET /api/ai-generate-status`
**File to create:** `apps/web/src/routes/api.ai-generate-status.test.ts`

| Test ID | Description |
|---------|-------------|
| AS-01 | Replicate job still running → `{ status: 'processing' }` |
| AS-02 | Replicate job succeeded → `{ status: 'succeeded', base64: '...' }` |
| AS-03 | Replicate job failed → `{ status: 'failed' }` |
| AS-04 | Google job ready → `{ status: 'succeeded', base64: '...' }` |
| AS-05 | Google job not ready → `{ status: 'processing' }` |
| AS-06 | Missing `predictionId` query param → 400 |
| AS-07 | Missing auth → 401 |
| AS-08 | Unknown predictionId → 404 or defined error |
| AS-09 | Provider query param mismatches actual job type → defined error behavior |

---

#### TASK-2.4 — `POST /api/photo`
**File to create:** `apps/web/src/routes/api.photo.test.ts`

| Test ID | Description |
|---------|-------------|
| PH-01 | Valid submission → 200, user saved, email sent |
| PH-02 | Missing auth → 401 |
| PH-03 | Invalid email format → 400 |
| PH-04 | Invalid phone format → 400 |
| PH-05 | Phone `08xx` → stored as `+628xx` |
| PH-06 | Email service throws → still 200 (email is non-blocking) |
| PH-07 | UserRepository throws → 500 |
| PH-08 | Missing required fields (`name`, `email`, `phone`) → 400 per field |

---

#### TASK-2.5 — `GET /api/config`
**File to create:** `apps/web/src/routes/api.config.test.ts`

| Test ID | Description |
|---------|-------------|
| CF-01 | Valid `eventId` → 200 + full `EventConfig` shape |
| CF-02 | Missing `eventId` query param → 400 |
| CF-03 | Unknown `eventId` (no row in Supabase) → 404 |
| CF-04 | Response includes correct `Cache-Control` header |
| CF-05 | Supabase throws → 500 |

**Done when:** `pnpm wb test` passes with all Phase 1 + 2 tests green.

---

### Phase 3 — Component Tests (Frontend)

**Goal:** Test React components and contexts in isolation. This requires adding Vitest DOM setup to the frontend app.

**Setup required (one-time):**
```bash
pnpm fe add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Add to `apps/frontend/vitest.config.ts`:
```ts
environment: 'jsdom',
setupFiles: ['./src/test-setup.ts'],
```

**Note:** Component tests are lower priority than API tests. Write these after Phase 2 is complete.

---

#### TASK-3.1 — `PipelineRenderer`
**File to create:** `apps/frontend/src/components/PipelineRenderer.test.tsx`

| Test ID | Description |
|---------|-------------|
| PR-01 | Renders first module (welcome) on mount |
| PR-02 | `advance()` progresses to next module |
| PR-03 | `back()` returns to previous module |
| PR-04 | `jumpToIndex(n)` jumps to the correct module, clears finalPhoto |
| PR-05 | Session start POST fires on mount, sessionId stored in context |
| PR-06 | Session start POST fails (offline) → sessionId is null, pipeline still advances |
| PR-07 | Inactivity timer fires reset after configured timeout |

---

#### TASK-3.2 — `AiGenerationModule`
**File to create:** `apps/frontend/src/components/AiGenerationModule.test.tsx`

| Test ID | Description |
|---------|-------------|
| AIM-01 | Fires POST /api/ai-generate on mount with correct photo + theme |
| AIM-02 | Polls /api/ai-generate-status until succeeded, then advances |
| AIM-03 | Shows retry button after 60s without result |
| AIM-04 | Retry button fires a new POST /api/ai-generate (not stuck on old ID) |
| AIM-05 | No `selectedTheme` in context → AI gen uses default/first theme |
| AIM-06 | `finalPhoto` set in context on success |

---

#### TASK-3.3 — `ResultModule`
**File to create:** `apps/frontend/src/components/ResultModule.test.tsx`

| Test ID | Description |
|---------|-------------|
| RM-01 | Shows `finalPhoto` when AI generation was in flow |
| RM-02 | Shows `originalPhoto` when no AI generation in flow |
| RM-03 | Auto-calls `savePhotoFile` on mount |
| RM-04 | Fires PATCH /api/session/photo after save |
| RM-05 | Fires POST /api/photo when emailEnabled + userInfo present |
| RM-06 | Skips POST /api/photo when no userInfo |
| RM-07 | Skips POST /api/photo when emailEnabled=false |
| RM-08 | Print fires automatically when printEnabled + printerName |
| RM-09 | Inactivity timer suppressed during auto-save |
| RM-10 | Retry button absent when retryEnabled=false |
| RM-11 | Retry button → confirmation modal → `jumpToIndex` to ai-generation |
| RM-12 | QR modal shown when qrCodeEnabled + sessionId exists |
| RM-13 | QR modal absent when no sessionId |

---

#### TASK-3.4 — `ThemeSelectionModule`
**File to create:** `apps/frontend/src/components/ThemeSelectionModule.test.tsx`

| Test ID | Description |
|---------|-------------|
| TSM-01 | Multiple themes → all rendered, none auto-selected |
| TSM-02 | Single theme → auto-advances immediately (V6 CUSTOM-04 regression guard) |
| TSM-03 | Theme tap → `selectedTheme` stored in context, advance called |

**Done when:** `pnpm fe test` passes with all Phase 3 tests green.

---

### Phase 4 — E2E Tests (Critical Flows Only)

**Goal:** 10 critical guest flows running end-to-end. These are the most expensive to maintain — keep scope tight.

**Setup required (one-time):**
```bash
pnpm add -Dw @playwright/test
npx playwright install
```

**Constraint:** Only write E2E tests for flows that cannot reasonably be caught at lower layers (i.e., multi-step flows where the integration of components + API is the risk).

| Test ID | Flow | Description |
|---------|------|-------------|
| E2E-01 | Happy path (with AI) | Welcome → Camera → Theme → AI → Result: photo shown, download works |
| E2E-02 | Happy path (no AI) | Welcome → Camera → Result: originalPhoto shown |
| E2E-03 | AI retry from result | Result retry → confirmation → AI gen reloads → new result |
| E2E-04 | Offline session start | Backend unreachable → no sessionId → guest proceeds, result saves locally |
| E2E-05 | Single-theme skip | Flow with 1 theme → theme selection screen never shown |
| E2E-06 | Form validation | Empty fields → blocked; invalid email/phone → blocked |
| E2E-07 | Inactivity reset | No input for N seconds → warning modal → auto-reset to Welcome |
| E2E-08 | Camera permission denied | Camera unavailable → error with back option |
| E2E-09 | Cmd+H from admin `/data` | Navigates back to Welcome |
| E2E-10 | Config-driven flow | Flow without form module → FormModule never renders |

**Done when:** All 10 E2E scenarios pass in the Electron dev environment.

---

### Phase 5 — Fix Pass

**Goal:** Address everything surfaced by Phases 1–4. Document decisions on deferred items.

**Expected work areas:**

| Category | Items |
|----------|-------|
| Bugs caught by tests | TBD from Phase 1–4 findings |
| Tech debt (quick wins) | BACKLOG-T1 (`renderer.tsx` @ts-expect-error), BACKLOG-T2 (`supabase.ts` ESLint), BACKLOG-T3 (orphaned photo on retry) |
| Dead code decision | BACKLOG-P2: wire or remove `guestPortalEnabled` flag |
| Undefined behavior | Document what `POST /api/session/start` does with unknown eventId |
| Known perf issue | Document BACKLOG: SCALE-02 (photos page unbounded `.list()`) — fix or defer |

**Done when:** All tests still green after fixes. No new regressions. CLAUDE.md updated with new bugs table state.

---

## Master Test Case Reference

This is the canonical list. Test IDs here map to test descriptions in Phases 1–4 above.

### A. Kiosk Guest Pipeline

| ID | Module | Test Case |
|----|--------|-----------|
| W-01 | Welcome | Session start success → sessionId in PipelineContext |
| W-02 | Welcome | Session start fails (offline) → guest proceeds, no sessionId, no error |
| W-03 | Welcome | Inactivity timer not running before guest taps |
| C-01 | Camera | Video preview renders |
| C-02 | Camera | Camera permission denied → error state |
| C-03 | Camera | No cameras available → error state |
| C-04 | Camera | Multiple cameras → selector UI |
| C-05 | Camera | 3-2-1 countdown fires before capture |
| C-06 | Camera | Photo captured → base64 in context |
| C-07 | Camera | Retake works within maxRetakes limit |
| C-08 | Camera | At max retakes → retake button hidden |
| C-09 | Camera | Shutter flash + sound on capture |
| T-01 | Theme | All configured themes rendered |
| T-02 | Theme | Theme selected → selectedTheme in context, advance |
| T-03 | Theme | Single theme → auto-advances without UI |
| T-04 | Theme | Zero themes → undefined behavior (edge case) |
| F-01 | Form | Enabled fields render; disabled absent |
| F-02 | Form | Consent checkbox required |
| F-03 | Form | Empty required fields blocked |
| F-04 | Form | Email regex rejects invalid |
| F-05 | Form | Phone validates Indonesian format |
| F-06 | Form | Name strips `<>` |
| F-07 | Form | On-screen keyboard activates on focus |
| F-08 | Form | All fields disabled → module empty or skipped |
| F-09 | Form | userInfo stored in context on submit |
| A-01 | AI | POST fires with correct photo + theme |
| A-02 | AI | Replicate polling → advances on success |
| A-03 | AI | Google AI → sync gen, advance |
| A-04 | AI | finalPhoto in context on success |
| A-05 | AI | >60s → retry + cancel shown |
| A-06 | AI | Primary 503 → fallback attempted |
| A-07 | AI | Both fail → user-facing error |
| A-08 | AI | Retry → new prediction (not stuck) |
| A-09 | AI | No theme-selection in flow → AI uses default |
| A-10 | AI | No camera → flow builder blocks (edge case) |
| A-11 | AI | Duplicate ai-gen in flow → flow builder blocks |
| Q-01 | Quiz | Questions rendered with configured options |
| Q-02 | Quiz | Answer stored per question |
| Q-03 | Quiz | Back → previous question |
| Q-04 | Quiz | Final question → advance |
| Q-05 | Quiz | No questions → undefined behavior |
| R-01 | Result | finalPhoto shown (AI flow) |
| R-02 | Result | originalPhoto shown (no AI) |
| R-03 | Result | Auto-save to local SQLite |
| R-04 | Result | PATCH /api/session/photo fires |
| R-05 | Result | POST /api/photo fires when emailEnabled + userInfo |
| R-06 | Result | No userInfo → email skipped, photo saves |
| R-07 | Result | emailEnabled=false → no POST /api/photo |
| R-08 | Result | Print auto-fires when printEnabled + printerName |
| R-09 | Result | Print button manual trigger |
| R-10 | Result | Download button saves locally |
| R-11 | Result | QR modal opens when qrCodeEnabled + sessionId |
| R-12 | Result | QR absent when no sessionId (offline) |
| R-13 | Result | retryEnabled=false → no retry button |
| R-14 | Result | Retry → confirmation → jumpToIndex(ai-gen) |
| R-15 | Result | originalPhotos preserved through retry |
| R-16 | Result | selectedTheme preserved through retry |
| R-17 | Result | Inactivity suppressed during save |
| R-18 | Result | AI gen retry → orphaned Supabase photo (known: BACKLOG-T3) |
| I-01 | Inactivity | Warning modal at configured threshold |
| I-02 | Inactivity | Dismiss → timer resets |
| I-03 | Inactivity | No dismiss → auto-reset to Welcome |
| I-04 | Inactivity | Suppressed during result save |
| I-05 | Inactivity | Not active on Welcome |
| N-01 | Nav | Cmd+H → home from any screen |
| N-02 | Nav | Cmd+H from /data → home |
| N-03 | Nav | Cmd+D → /data |

### B. Config-Driven Behavior

| ID | Test Case |
|----|-----------|
| EC-01 | Config loads → modules render per flow |
| EC-02 | Config fetch fails → cached config used |
| EC-03 | Config fails + no cache → error state |
| EC-04 | eventId not set → KioskSettings shown |
| EC-05 | eventId set, event doesn't exist → error |
| EC-06 | Custom fonts loaded + injected |
| EC-07 | Branding colors applied |
| MF-01 | Standard flow → all modules in order |
| MF-02 | Form removed → FormModule never renders |
| MF-03 | Theme-selection removed → AI uses default |
| MF-04 | Mini-quiz inserted → renders in position |
| MF-05 | Empty flow → error or guard |

### C. Backend API

*(See Phase 2 task tables above — AG-01 through CF-05)*

### D. Dashboard

| ID | Area | Test Case |
|----|------|-----------|
| DB-O1 | Orgs | List orgs |
| DB-O2 | Orgs | Create org |
| DB-O3 | Orgs | Delete org + cascade behavior |
| DB-E1 | Events | Create event → event_configs row seeded |
| DB-E2 | Events | Rename event |
| DB-E3 | Events | Delete event |
| DB-FB1 | Flow Builder | Add module |
| DB-FB2 | Flow Builder | Remove module |
| DB-FB3 | Flow Builder | Reorder → order persisted |
| DB-FB4 | Flow Builder | Duplicate ai-gen → validation error |
| DB-FB5 | Flow Builder | AI gen without theme-selection → warning |
| DB-FB6 | Flow Builder | Print enabled, no printer name → blocks save |
| DB-FB7 | Flow Builder | Save → EventConfig updated |
| DB-CE1 | Config | Branding color change saved |
| DB-CE2 | Config | Font upload → Storage + config updated |
| DB-CE3 | Config | Inactivity timeout change saved |
| DB-CE4 | Config | AI provider change → kiosk picks up |
| DB-CE5 | Config | `guestPortalEnabled` → no kiosk effect (dead flag) |
| DB-PH1 | Photos | Gallery loads |
| DB-PH2 | Photos | Unbounded `.list()` (known: BACKLOG SCALE-02) |
| DB-G1 | Guests | List shows correct data |
| DB-AN1 | Analytics | Counts accurate |
| DB-A1 | Assets | Upload frame image → stored, URL in config |
| DB-A2 | Assets | Invalid file type → rejected |

### E. Guest Portal

| ID | Test Case |
|----|-----------|
| GP-01 | Valid sessionId → photo + download |
| GP-02 | Invalid sessionId → 404 |
| GP-03 | Photo loads from Supabase Storage |
| GP-04 | Custom font injected |
| GP-05 | Download works |

### F. Tech Debt (Document First, Then Fix)

| ID | Item | Backlog Ref |
|----|------|-------------|
| TD-01 | `guestPortalEnabled` dead flag | BACKLOG-P2 |
| TD-02 | `renderer.tsx` @ts-expect-error | BACKLOG-T1 |
| TD-03 | `supabase.ts` ESLint suppressions | BACKLOG-T2 |
| TD-04 | Orphaned Supabase photo on retry | BACKLOG-T3 |
| TD-05 | SQLite rows that never synced to Supabase | BACKLOG-P5 |
| TD-06 | Unknown eventId behavior on session start | New finding |
| TD-07 | Photos page unbounded `.list()` | BACKLOG SCALE-02 |

---

## Progress Tracker

| Phase | Status | Tests Added | Total Tests |
|-------|--------|-------------|-------------|
| Phase 0 — Audit | ✅ Done | 0 | 34 |
| Phase 1 — Unit: Business Logic | ✅ Done | +62 | 96 |
| Phase 2 — API Route Tests | ✅ Done | +68 | 164 |
| Phase 3 — Component Tests | ⏳ Pending | — | — |
| Phase 4 — E2E | ⏳ Pending | — | — |
| Phase 5 — Fix Pass | ⏳ Pending | — | — |

Update this table as phases complete.

---

## Tooling Reference

| Tool | Purpose | Command |
|------|---------|---------|
| Vitest | Unit + integration tests (web app) | `pnpm wb test` |
| Vitest | Unit + component tests (frontend) | `pnpm fe test` *(requires setup)* |
| Playwright | E2E tests | `npx playwright test` *(requires setup)* |
| `vi.resetModules()` | Isolate env-var-driven module constants | Use in `beforeEach` |
| `vi.doMock()` + dynamic `import()` | Mock modules with per-test control | Required when mocking module-level singletons |
| `vi.stubEnv()` | Override env vars per test | Pair with `vi.unstubAllEnvs()` in `afterEach` |

**Commit convention for this project:**
```
test(phase-N): TASK-X.Y — <what was tested>
fix(phase-5): TASK-5.X — <what was fixed>
```
