# Task Decomposition — V3 All Phases

**Status:** 🔄 In progress
**Scope:** Phase 1 (Carryover Fixes), Phase 2 (Asset Type System + Wiring), Phase 3 (Dashboard Upload UI), Phase 4 (Kiosk Background Rendering)

**Format per task:** What · Files · Input · Output · Verification · Risk
**Per-task workflow:** read → change → lint → test → commit → mark done (see CLAUDE.md)

---

## Phase 1 — Carryover Fixes

### ~~V3-1.1 — CARRY-03: Create `packages/types` pnpm workspace package~~ ✅

**What:** Eliminate the mirrored type files between `apps/web` and `apps/frontend`. Create a shared `packages/types` package that both apps import from. This is a prerequisite for Phase 2 type additions.

Steps:
1. Add `packages/*` to `pnpm-workspace.yaml`
2. Create `packages/types/package.json` with name `@photobooth/types` and no external dependencies
3. Create `packages/types/tsconfig.json` that extends root tsconfig
4. Create `packages/types/src/event-config.ts` — merge both apps' versions:
   - Use `apps/web/src/types/event-config.ts` as canonical source
   - `BrandingConfig` in web has `portalHeading: string | null` that frontend is missing — include it in the merged type
5. Create `packages/types/src/module-config.ts` — move from `apps/web/src/types/module-config.ts` verbatim
6. Create `packages/types/src/index.ts` that re-exports both files
7. Add `"@photobooth/types": "workspace:*"` as a dependency in `apps/web/package.json` and `apps/frontend/package.json`
8. Run `pnpm install` to link the workspace
9. In `apps/web`: replace all `from '../types/module-config'` and `from '../types/event-config'` imports with `from '@photobooth/types'`. Delete `apps/web/src/types/module-config.ts` and `apps/web/src/types/event-config.ts`.
10. In `apps/frontend`: replace all `from '../types/module-config'` and `from '../types/event-config'` imports (and path variants like `'../../types/...'`, `'./types/...'`) with `from '@photobooth/types'`. Delete `apps/frontend/src/types/module-config.ts` and `apps/frontend/src/types/event-config.ts`.

**Files:**
- `pnpm-workspace.yaml` (edit — add `packages/*`)
- `packages/types/package.json` (new)
- `packages/types/tsconfig.json` (new)
- `packages/types/src/index.ts` (new)
- `packages/types/src/event-config.ts` (new — merged from both apps)
- `packages/types/src/module-config.ts` (new — moved from `apps/web/src/types/`)
- `apps/web/src/types/event-config.ts` (delete)
- `apps/web/src/types/module-config.ts` (delete)
- `apps/frontend/src/types/event-config.ts` (delete)
- `apps/frontend/src/types/module-config.ts` (delete)
- `apps/web/package.json` (add workspace dep)
- `apps/frontend/package.json` (add workspace dep)
- Every `.ts`/`.tsx` in both apps that imports from the old type paths (grep to find all)

**Input:** V3 scope doc complete ✅

**Output:**
- `pnpm install` runs with no errors
- `apps/web` TypeScript compiles with no new errors (`pnpm wb typecheck` or `tsc --noEmit`)
- `apps/frontend` TypeScript compiles with no new errors
- `// MIRRORED` comment is gone — there is no second copy of the types
- `packages/types/src/event-config.ts` is the single source of truth for `EventConfig`, `BrandingConfig`, `AiThemeConfig`, `FormFieldsConfig`, `TechConfig`
- `packages/types/src/module-config.ts` is the single source of truth for `ModuleConfig` and all module config interfaces

**Verification:**
- Layer 1: `git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint` — no new errors
- Layer 2: `pnpm wb test` — all existing tests pass
- Layer 3: Run `pnpm wb dev` — dashboard loads, no import errors in console

**Risk:** Medium. Many files updated. TypeScript will immediately surface any missed import. No runtime logic changes — pure refactor.

---

### ~~V3-1.2 — GAP-04: Remove `evt_shell_001` hardcoded fallback~~ ✅

**What:** The `else` branch in `submit-photo.usecase.ts:63-73` creates a new session when no `sessionId` is provided, and falls back to `'evt_shell_001'` when `eventId` is missing. In the V2 flow, `sessionId` is always provided (set at session start by `POST /api/session/start`), so this branch is rarely hit. But the fallback is still a risk if called without context. Make `eventId` required throughout the call chain.

Steps:
1. In `apps/web/src/usecases/submit-photo.usecase.ts`: change `eventId?: string` to `eventId: string` in `SubmitPhotoRequest`. Remove `?? 'evt_shell_001'` on line 65.
2. In `apps/web/src/routes/api.photo.ts`: change `eventId?: string` to `eventId: string` in `RequestBody`. Add validation before the usecase call:
   ```typescript
   if (!body.eventId) {
     return json({ error: 'Missing required field: eventId' }, { status: 400 })
   }
   ```
3. Verify the frontend (`apps/frontend`) always sends `eventId` in the `POST /api/photo` body. The `eventId` comes from `useEventConfig().config.eventId` — confirm it is included in the `ResultModule` fetch call.

**Files:**
- `apps/web/src/usecases/submit-photo.usecase.ts`
- `apps/web/src/routes/api.photo.ts`
- `apps/frontend/src/modules/ResultModule.tsx` (read-only verify — confirm `eventId` is in request body)

**Input:** V3-1.1 complete (types moved to `@photobooth/types`)

**Output:**
- `SubmitPhotoRequest.eventId` is `string` (not `string | undefined`)
- `RequestBody.eventId` is `string` (not `string | undefined`)
- `POST /api/photo` returns 400 if `eventId` is absent from body
- `'evt_shell_001'` string does not appear anywhere in `apps/web/src/` (verify with grep)

**Verification:**
- Layer 1: Lint changed files — no errors
- Layer 2: `pnpm wb test` — update any test fixture that passes `eventId: undefined` to now pass a valid `eventId` string
- Layer 3: Full flow smoke test — complete a session in the kiosk; confirm DB record has correct `event_id`

**Risk:** Low. In the V2 flow, `sessionId` is always provided, so the `else` branch is not normally hit. Making `eventId` required only tightens what was already expected.

---

### ~~V3-1.3 — SEC-01: Add max-length guards for email and phone inputs~~ ✅

**What:** `validateEmail` and `validatePhone` in `api.photo.ts` have no explicit length cap. An attacker can send a 10,000-char string that passes the regex (if it matches a valid prefix up to the first mismatch). Add explicit length guards before the regex validators.

**Files:**
- `apps/web/src/routes/api.photo.ts`

**Input:** V3-1.2 complete.

**Output:** Add the following check immediately before the `validateEmail` call (after the `sanitizedName` check):
```typescript
if (body.email.length > 254 || body.phone.length > 20) {
  return json({ error: 'Invalid input' }, { status: 400 })
}
```
(254 = RFC 5321 max email length; 20 = any E.164 phone number)

**Verification:**
- Layer 1: Lint changed file — no errors
- Layer 2: n/a — no new business logic warranting a new test; existing tests cover the happy path
- Layer 3: `curl -X POST .../api/photo` with a 300-char email — confirm 400 response

**Risk:** Low. Additive validation — no existing valid inputs are rejected.

---

### ~~V3-1.4 — CODE-03: Guard CSV export against formula injection~~ ✅

**What:** The `downloadCSV` function in the guests page wraps cells in double-quotes but does not strip leading `=`, `+`, `-`, `@` characters that spreadsheet apps interpret as formula prefixes. A guest named `=HYPERLINK(...)` would execute as a formula when the CSV is opened in Excel or Google Sheets.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.guests.tsx`

**Input:** V3-1.3 complete.

**Output:** Add a `sanitizeCsvCell` helper above `downloadCSV`:
```typescript
function sanitizeCsvCell(val: string | null): string {
  const s = String(val ?? '')
  return /^[=+\-@|]/.test(s) ? `'${s}` : s
}
```
Replace the `row.map((cell) => ...)` expression to use `sanitizeCsvCell` on each cell value before wrapping in double-quotes:
```typescript
row.map((cell) => `"${sanitizeCsvCell(cell).replace(/"/g, '""')}"`)
```

**Verification:**
- Layer 1: Lint changed file — no errors
- Layer 2: n/a
- Layer 3: Add a guest named `=SUM(1+1)` to a test event; export CSV; confirm the cell value in the file starts with `'=SUM(1+1)` (not `=SUM(1+1)`)

**Risk:** Low. Output-only change — no effect on DB or API.

---

### ~~V3-1.5 — DATA-01: Fix CSV export to include all guests, not just current page~~ ✅

**What:** After V2-6.8 added pagination, the Export CSV button passes `guests` (current page only, max 50 records) to `downloadCSV`. A separate server fetch of all guests is needed.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.guests.tsx`

**Input:** V3-1.4 complete.

**Output:**
- Add a `getAllGuestsForExport` server function above the existing `getGuests`:
  ```typescript
  const getAllGuestsForExport = createServerFn({ method: 'GET' }).handler(async (ctx) => {
    const { eventId } = ctx.data as { eventId: string }
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('users')
      .select('name, email, phone, selected_theme, created_at, photo_path')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })
  ```
- In `GuestListPage`, replace the `onClick` handler on the Export CSV button:
  - Add `isExporting` state (`useState(false)`)
  - On click: set `isExporting = true`, call `getAllGuestsForExport`, call `downloadCSV` with full result, set `isExporting = false`
  - Disable the button while `isExporting = true`; change label to `"Exporting..."` during fetch

**Verification:**
- Layer 1: Lint changed file — no errors
- Layer 2: n/a
- Layer 3: Navigate to guests page 2; click Export CSV; confirm downloaded file contains all guests, not just page 2

**Risk:** Low. Additive — new server function alongside the existing paginated one.

---

### ~~V3-1.6 — DATA-02: Track repeat visits with `visit_count` column~~ ✅

**What:** The current upsert on `(email, event_id)` silently discards repeat-visit data. Add a `visit_count` integer column to the `users` table that increments on each subsequent visit from the same guest.

**Steps:**

**Part A — DB migration (Supabase)**
Run in the Supabase SQL editor:
```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION upsert_user_with_visit_count(
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_photo_path TEXT,
  p_selected_theme TEXT,
  p_event_id TEXT
)
RETURNS SETOF users
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO users (name, email, phone, photo_path, selected_theme, event_id, visit_count)
  VALUES (p_name, p_email, p_phone, p_photo_path, p_selected_theme, p_event_id, 1)
  ON CONFLICT (email, event_id)
  DO UPDATE SET
    name          = EXCLUDED.name,
    phone         = EXCLUDED.phone,
    photo_path    = EXCLUDED.photo_path,
    selected_theme = EXCLUDED.selected_theme,
    visit_count   = users.visit_count + 1,
    updated_at    = now()
  RETURNING *;
END;
$$;
```

**Part B — Code changes**

In `apps/web/src/repositories/user.repository.ts`:
- Replace the `.upsert()` call with an RPC call to `upsert_user_with_visit_count`:
  ```typescript
  const { data: user, error } = await supabase
    .rpc('upsert_user_with_visit_count', {
      p_name: data.name,
      p_email: data.email,
      p_phone: data.phone,
      p_photo_path: data.photoPath,
      p_selected_theme: data.selectedTheme ?? null,
      p_event_id: data.eventId ?? null,
    })
    .single()
  ```
- Add `visit_count: number` to the `User` interface.

In `apps/web/src/routes/dashboard/_layout.events.$eventId.guests.tsx`:
- Add `visit_count` to the `Guest` type and the `.select()` call in `getGuests` and `getAllGuestsForExport`
- Add a "Visits" column to the guest table (after "Theme")
- Add "Visits" to the CSV headers and row data

**Files:**
- Supabase SQL editor (migration — run manually, not a code file)
- `apps/web/src/repositories/user.repository.ts`
- `apps/web/src/routes/dashboard/_layout.events.$eventId.guests.tsx`

**Input:** V3-1.5 complete. Supabase migration must be run before deploying the code change.

**Output:**
- Existing rows: `visit_count = 1` (applied by `DEFAULT 1`)
- New guest: row inserted with `visit_count = 1`
- Returning guest (same email + event_id): `visit_count` incremented; `photo_path`, `name`, `phone` updated to latest
- Dashboard guests table shows a "Visits" column
- CSV export includes "Visits" column

**Verification:**
- Layer 1: Lint changed files — no errors
- Layer 2: `pnpm wb test` — update `user.repository.test.ts` (if it exists) to mock the RPC call instead of upsert
- Layer 3: Submit the same email twice in a test event; check dashboard — "Visits" column shows 2

**Risk:** Medium. Requires a Supabase migration. The Postgres function must be run before deploying code, or existing upsert calls will fail. Run migration first, verify it works in Supabase, then deploy code.

---

## Phase 2 — Asset Type System + Wiring

### ~~V3-2.1 — Add `screenBackgrounds` to `BrandingConfig` in `@photobooth/types`~~ ✅

**What:** `BrandingConfig.screenBackgrounds` is referenced in the V3 scope (per-module background images) but is not yet in the type. Add it to the canonical package.

**Files:**
- `packages/types/src/event-config.ts`

**Input:** V3-1.1 complete (shared types package exists).

**Output:** Add to `BrandingConfig`:
```typescript
screenBackgrounds: Record<string, string | null> | null
```
Where the key is a `moduleId` string (e.g. `'camera'`, `'welcome'`) and the value is a public URL or `null`.

TypeScript compiles in both apps with no new errors. Existing `BrandingConfig` usages are unaffected (new field is nullable).

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: `pnpm wb test` — all tests pass (no existing code reads `screenBackgrounds`)
- Layer 3: n/a (no runtime effect until kiosk uses it in Phase 4)

**Risk:** Low. Additive — nullable field on existing interface.

---

### ~~V3-2.2 — Add asset upload API route~~ ✅

**What:** Create `POST /api/assets/upload` — a server-side route that accepts a file (multipart/form-data) plus `eventId`, `assetType`, and `filename`, uploads it to `photobooth-bucket/events/<eventId>/<assetType>/<filename>`, and returns the public URL. This is the backend for the dashboard upload UI (Phase 3).

**Files:**
- `apps/web/src/routes/api.assets.upload.ts` (new)

**Input:** V3-2.1 complete.

**Output:**
- Route: `POST /api/assets/upload`
- Auth: requires `Authorization: Bearer <API_CLIENT_KEY>` (same as other API routes)
- Request: `multipart/form-data` with fields:
  - `file` — the image file (binary)
  - `eventId` — string
  - `assetType` — `'frames' | 'templates' | 'backgrounds' | 'logos'`
  - `filename` — string (e.g. `frame-f1.png`)
- Validation: reject if `eventId`, `assetType`, or `filename` is missing; reject if `assetType` is not one of the four allowed values; reject file > 10MB
- Upload path: `events/<eventId>/<assetType>/<filename>` in `SUPABASE_BUCKET`
- Returns: `{ publicUrl: string }`
- On re-upload with the same filename: overwrites the existing file (Supabase Storage `.upload()` with `upsert: true`)

**Verification:**
- Layer 1: Lint new file — no errors
- Layer 2: n/a (integration-only; mocking Supabase Storage is not worth it here)
- Layer 3: `curl -X POST /api/assets/upload -F file=@frame.png -F eventId=evt_001 -F assetType=frames -F filename=frame-f1.png -H "Authorization: Bearer <key>"` → returns `{ publicUrl: "https://..." }`

**Risk:** Low. New file, no existing code modified.

---

### ~~V3-2.3 — Wire upload URL into `EventConfig` via PATCH and remove env-var fallback~~ ✅

**What:** After uploading an asset, the dashboard UI must write the returned public URL into the relevant `EventConfig` field (e.g. `moduleFlow[i].themes[j].frameImageUrl`). The PATCH config endpoint already exists — the dashboard will call it with a targeted update.

Separately, the env-var fallback for template URLs in `ai-generation.service.ts` (`TEMPLATE_URLS` and `THEME_PROMPTS` constants) becomes dead code once all event configs store URLs in DB. Remove these constants and make the service rely entirely on what the route handler passes via `params.templateUrl` and `params.prompt`.

Steps:
1. In `apps/web/src/services/ai-generation.service.ts`:
   - Delete `TEMPLATE_URLS` constant (lines 15-19)
   - Delete `THEME_PROMPTS` constant (lines 26-30)
   - In `generateFaceSwap` (Replicate path): replace `params.templateUrl ?? TEMPLATE_URLS[params.theme]` with `params.templateUrl`. If `params.templateUrl` is undefined, throw a descriptive error: `'No template URL configured for theme: ${params.theme}'`
   - Same for the Google AI path
2. In `apps/web/src/routes/api.ai-generate.ts`:
   - In `resolveThemeConfig`: remove the `envFallback` object and the `if (!eventId) return envFallback` early return
   - If no `eventId` is provided, return `{ error: 'eventId is required' }` with 400
   - If the event config is not found in DB, return 503 (not a silent fallback)

**Files:**
- `apps/web/src/services/ai-generation.service.ts`
- `apps/web/src/routes/api.ai-generate.ts`

**Input:** V3-2.2 complete. **Before deploying this task**, every active event in the DB must have valid `templateImageUrl` and `frameImageUrl` values in its `moduleFlow[ai-generation].themes[]` config. Verify this via Supabase before deploying.

**Output:**
- `RACING_TEMPLATE_PITCREW_URL`, `RACING_TEMPLATE_MOTOGP_URL`, `RACING_TEMPLATE_F1_URL` env vars are no longer read anywhere in `apps/web`
- `RACING_PROMPT_PITCREW`, `RACING_PROMPT_MOTOGP`, `RACING_PROMPT_F1` env vars are no longer read anywhere in `apps/web`
- `POST /api/ai-generate` returns 400 if `eventId` is missing from the request body
- `POST /api/ai-generate` returns 503 if the event config is not found in DB (instead of silently using env vars)

**Verification:**
- Layer 1: Lint changed files — no errors
- Layer 2: Update `ai-generation.service.ts` tests to not pass env-var fallback fixtures; pass `templateUrl` explicitly
- Layer 3: Remove env vars from `.env` temporarily; run a full AI generation session — confirm it still works (URL comes from DB config)

**Risk:** High. **Do not deploy without first confirming all event configs in DB have valid asset URLs.** If any event has `templateImageUrl: ""` or a local path, AI generation will break. Run the Phase 3 dashboard UI first, upload assets for all active events, then deploy this task.

> **Ordering note:** V3-2.3 depends on Phase 3 being complete for active events. Write the code in this order but defer deployment of this specific task until after Phase 3 is live and all events have been configured.

---

## Phase 3 — Dashboard Asset Upload UI

### ~~V3-3.1 — Add "Assets" navigation card to event detail page~~ ✅

**What:** The event detail page (`_layout.events.$eventId.index.tsx`) currently shows 4 cards: Guests, Photos, Config, Flow Builder. Add a 5th card: Assets.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.index.tsx`

**Input:** V3-2.2 complete (upload API exists).

**Output:**
```tsx
<Link
  to="/dashboard/events/$eventId/assets"
  params={{ eventId: event.id }}
  className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors group"
>
  <div>
    <p className="font-medium text-white">Assets</p>
    <p className="text-sm text-slate-400 mt-0.5">
      Upload frames, templates, and backgrounds
    </p>
  </div>
  <span className="text-slate-500 group-hover:text-slate-300 transition-colors">→</span>
</Link>
```
Grid changes from `lg:grid-cols-4` to `lg:grid-cols-5` (or wraps naturally).

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: n/a
- Layer 3: Navigate to event detail page — confirm Assets card appears and link works (even if destination 404s until V3-3.2)

**Risk:** Low. UI-only addition.

---

### ~~V3-3.2 — Create `/dashboard/events/$eventId/assets` route~~ ✅

**What:** Create the assets management page. For each asset slot, show the current value (thumbnail if URL is an image, path label otherwise), an upload button, and on success: update the relevant field in `EventConfig`.

Asset slots:
- **Per-theme** (one per theme in `moduleFlow[ai-generation].themes`):
  - Frame image (`frameImageUrl`)
  - Template image (`templateImageUrl`)
  - Preview image (`previewImageUrl`)
- **Per-module** (one per module with a background slot):
  - Module background (writes into `branding.screenBackgrounds[moduleId]`)
- **Event-level**:
  - Logo (`branding.logoUrl`)

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.assets.tsx` (new)

**Input:** V3-3.1 complete.

**Output:**
- Route: `/dashboard/events/$eventId/assets`
- Loader: fetch the event's `EventConfig` from `event_configs` table (reuse pattern from `_layout.events.$eventId.config.tsx`)
- For each asset slot: render an `<AssetSlot>` component with:
  - Label (e.g. "F1 — Frame Image")
  - Current value: show `<img>` thumbnail if value starts with `http`, else show the raw string in muted text, else "Not set"
  - Hidden `<input type="file" accept="image/*">` triggered by an "Upload" button
  - On file select: call `POST /api/assets/upload` with the file and metadata → get back `publicUrl` → call PATCH config endpoint to update the specific field → refetch config to update UI
- Loading/error states per slot (not global)
- No batch upload — each slot uploads independently

For the PATCH call, use the existing `patchConfig` mechanism from `_layout.events.$eventId.config.tsx` (read that file to understand the pattern before implementing).

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: n/a
- Layer 3: Upload a new frame image for a theme; confirm the thumbnail updates; confirm the public URL is now in the event config in Supabase; confirm the kiosk uses the new image in the next session

**Risk:** Medium. First file upload UI in the project. Test with actual files before marking done.

---

### V3-3.3 — Verify kiosk reads frame and preview URLs from config after upload

**What:** Smoke-test and fix (if needed) that the kiosk correctly renders frames and theme previews sourced from Supabase URLs (not local `/images/` paths). The kiosk's `resolveImageUrl` in `AiGenerationModule.tsx` already handles HTTP URLs vs local paths — confirm it works for Supabase-hosted images, including cross-origin loading on canvas (`img.crossOrigin = "anonymous"` is already set in `loadImage`).

**Files:**
- `apps/frontend/src/modules/AiGenerationModule.tsx` (verify only — no changes expected)
- `apps/frontend/src/modules/ThemeSelectionModule.tsx` (verify only)

**Input:** V3-3.2 complete. At least one event config has Supabase-hosted `frameImageUrl` and `previewImageUrl` set.

**Output:**
- Theme selection shows preview images from Supabase URLs ✅
- Result frame overlay uses Supabase-hosted frame image ✅
- No CORS errors in Electron DevTools console
- If CORS errors appear: ensure `photobooth-bucket` has the correct public bucket policy and Supabase Storage CORS config allows `*` origin for GET requests

**Verification:**
- Layer 3 only: Full session through the kiosk using an event config with Supabase-hosted assets; confirm frame overlay is applied correctly

**Risk:** Low. The kiosk already handles HTTP URLs via `resolveImageUrl`. CORS is the only realistic failure mode.

---

## Phase 4 — Kiosk Per-Module Background Rendering

### V3-4.1 — Create `useModuleBackground` hook in `apps/frontend`

**What:** Add a hook that reads `branding.screenBackgrounds[moduleId]` from `EventConfig` and returns the URL (or `null`).

**Files:**
- `apps/frontend/src/hooks/useModuleBackground.ts` (new)

**Input:** V3-2.1 complete (`screenBackgrounds` field exists in `BrandingConfig`). V3-3.2 complete (assets page can set these values).

**Output:**
```typescript
import { useEventConfig } from '../contexts/EventConfigContext'

export function useModuleBackground(moduleId: string): string | null {
  const { config } = useEventConfig()
  return config.branding.screenBackgrounds?.[moduleId] ?? null
}
```

**Verification:**
- Layer 1: Lint new file — no errors
- Layer 2: n/a — simple selector, no logic to test independently
- Layer 3: n/a (tested implicitly in V3-4.2)

**Risk:** Low. New file, no side effects.

---

### V3-4.2 — Apply per-module backgrounds in kiosk module components

**What:** Each module component that occupies the full screen should read its background from `useModuleBackground(moduleId)` and apply it as a CSS background image. If no background is set for the module, the existing solid-color background is shown (no visible change).

Modules to update (check each for a root full-screen container):
- `WelcomeModule.tsx` — moduleId: `'welcome'`
- `ThemeSelectionModule.tsx` — moduleId: `'theme-selection'`
- `CameraModule.tsx` — moduleId: `'camera'`
- `AiGenerationModule.tsx` — moduleId: `'ai-generation'`
- `FormModule.tsx` — moduleId: `'form'`
- `ResultModule.tsx` — moduleId: `'result'`

For each: import `useModuleBackground`, call it with the module's `moduleId`, and conditionally apply `style={{ backgroundImage: `url(${bg})` }}` (or equivalent) to the root container element. Apply `backgroundSize: 'cover'` and `backgroundPosition: 'center'`.

**Files:**
- `apps/frontend/src/modules/WelcomeModule.tsx`
- `apps/frontend/src/modules/ThemeSelectionModule.tsx`
- `apps/frontend/src/modules/CameraModule.tsx`
- `apps/frontend/src/modules/AiGenerationModule.tsx`
- `apps/frontend/src/modules/FormModule.tsx`
- `apps/frontend/src/modules/ResultModule.tsx`

**Input:** V3-4.1 complete.

**Output:**
- When `branding.screenBackgrounds['camera']` is set to a URL, the camera module renders that image as a full-screen background
- When not set, existing module appearance is unchanged
- No new TypeScript errors

**Verification:**
- Layer 1: Lint changed files — no errors
- Layer 2: n/a
- Layer 3: Set a background URL for `'camera'` module in the event config via the Assets page; open the kiosk; confirm the camera screen shows the background image; confirm other modules are unaffected

**Risk:** Low. Additive inline style, conditionally applied. No logic change to module behavior.
