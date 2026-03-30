# Task Decomposition — Executable Coding Tasks

**Purpose:** Break every migration phase into atomic, independently executable tasks. Each task is scoped to fit in a single Claude Code session.

**Format per task:**
- **What:** What to build or change
- **Files:** Which files to touch
- **Input:** What needs to exist before this task can start
- **Output:** What "done" looks like (acceptance criteria)
- **Risk:** What could go wrong

---

## Phase 0 — Hotfixes

### TASK-0.1: Fix SQLite DROP TABLE on startup

**What:** Remove the destructive `DROP TABLE IF EXISTS` line. Replace with a schema migration guard that only alters the table if columns are missing.

**Files:**
- `apps/frontend/src/database/sqlite.ts`

**Input:** Nothing — this is self-contained.

**Output:**
- `DROP TABLE` line removed
- Table is created with `CREATE TABLE IF NOT EXISTS`
- If a new column needs to be added later, use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Existing records survive an app restart

**Risk:** Low. Non-destructive change.

---

### TASK-0.2: Guard Replicate initialization when AI provider is Google

**What:** Only initialize `Replicate` client when `AI_PROVIDER === 'replicate'`. Calling methods on an uninitialized client should throw a clear error, not a cryptic one.

**Files:**
- `apps/web/src/services/ai-generation.service.ts`

**Input:** Nothing.

**Output:**
- Constructor does not call `new Replicate()` when provider is `'google'`
- `REPLICATE_API_KEY` env var is not required when provider is `'google'`
- Calling a Replicate method when provider is `'google'` throws `Error("Replicate not initialized — provider is 'google'")`

**Risk:** Low.

---

### TASK-0.3: Add inactivity timeout to kiosk

**What:** Add a hook that resets the session and navigates to `/` if no user interaction occurs for N seconds. N is a constant for now (configurable in Phase 3).

**Files:**
- `apps/frontend/src/hooks/useInactivityTimeout.ts` (new)
- `apps/frontend/src/layouts/RootLayout.tsx` (add hook usage)
- `apps/frontend/src/contexts/PhotoboothContext.tsx` (use `reset()`)

**Input:** Nothing.

**Output:**
- After N seconds of no touch/click/keypress, the app calls `reset()` and navigates to `/`
- Timeout resets on any user interaction
- Timeout does not fire on the `/` splash screen (already home)
- N is defined as a constant `INACTIVITY_TIMEOUT_MS = 60_000`

**Risk:** Low. Touch events should be straightforward to detect. Test that it doesn't fire during AI generation (which takes 30–60s with no user input).

---

## Phase 1 — EventId Threading

### TASK-1.1: Add eventId to Supabase schema

**What:** Add `eventId` to the data model — Supabase tables and SQLite.

**Files:** Supabase SQL migrations (run manually in Supabase dashboard)

SQL to run:
```sql
-- Add eventId to users table (nullable, backward-compatible)
ALTER TABLE users ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_event_id ON users(event_id);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | active | ended
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert first event (Shell racing event)
INSERT INTO events (id, name, status) VALUES ('evt_shell_001', 'Shell Racing 2026', 'active');
```

**Input:** Supabase project access.

**Output:**
- `users.event_id` column exists (nullable)
- `events` table exists with one row
- Existing `users` rows unaffected

**Risk:** Low — additive only.

---

### TASK-1.2: Add eventId to SQLite schema

**What:** Add `event_id` column to the local `photo_results` table.

**Files:**
- `apps/frontend/src/database/sqlite.ts`

**Input:** TASK-0.1 complete.

**Output:**
- `photo_results` table has `event_id TEXT` column (nullable, default null)
- `savePhotoResultToSQLite` accepts and stores `eventId`
- `getAllPhotoResultsFromSQLite` returns `eventId` in each record

**Risk:** Low — additive column with default null.

---

### TASK-1.3: Read eventId from env, pass through frontend

**What:** Read `VITE_EVENT_ID` from env. Thread it through `PhotoboothContext` and all API calls.

**Files:**
- `apps/frontend/src/contexts/PhotoboothContext.tsx` (add `eventId` to context)
- `apps/frontend/src/routes/result.tsx` (pass `eventId` to `/api/photo`)
- `apps/frontend/src/utils/database.ts` (pass `eventId` to SQLite save)
- `apps/frontend/.env`

**Input:** TASK-1.1, TASK-1.2 complete.

**Output:**
- `eventId` is available in `PhotoboothContext`
- `/api/photo` request body includes `eventId`
- SQLite save includes `eventId`
- Photos uploaded to `events/<eventId>/photos/<filename>` in Supabase

**Risk:** Medium. Supabase storage path change: new photos go to `events/<eventId>/photos/`. Old photos in `public/` still accessible but the download script needs updating.

---

### TASK-1.4: Accept eventId in backend `/api/photo`

**What:** Backend reads `eventId` from request body and saves it with the user record.

**Files:**
- `apps/web/src/routes/api.photo.ts`
- `apps/web/src/usecases/submit-photo.usecase.ts`
- `apps/web/src/repositories/user.repository.ts`

**Input:** TASK-1.1 complete.

**Output:**
- `POST /api/photo` accepts optional `eventId`
- `users.event_id` is populated for new records
- Missing `eventId` is accepted gracefully (null value) for backward compatibility

**Risk:** Low.

---

## Phase 2 — kiosk.config.json + Config Endpoint

### TASK-2.1: Define EventConfig TypeScript types

**What:** Define the `EventConfig` interface and related types. This is the schema contract between backend and frontend.

**Files:**
- `apps/frontend/src/types/event-config.ts` (new)
- `apps/web/src/types/event-config.ts` (new, or shared package)

**Input:** Nothing — this is schema design.

**Output:**
- `EventConfig` interface defined with: `eventId`, `branding`, `moduleFlow` (stub), `formFields`, `aiConfig`, `techConfig`
- `AiThemeConfig` type: `{ id, label, previewImageUrl, frameImageUrl, templateImageUrl, prompt, canvasWidth, canvasHeight, photoWidth, photoHeight, photoOffsetX, photoOffsetY }`
- `TechConfig` type: `{ printerName, inactivityTimeoutSeconds, guestPortalEnabled }`
- `BrandingConfig` type: `{ logoUrl, primaryColor, secondaryColor, fontFamily, backgroundUrl }`

**Risk:** Low — types only, no runtime impact.

---

### TASK-2.2: Add event_configs table to Supabase + seed Shell config

**What:** Create the `event_configs` table and insert the current Shell configuration as the first row.

**Files:** Supabase SQL (manual) + seed JSON

SQL:
```sql
CREATE TABLE IF NOT EXISTS event_configs (
  event_id TEXT PRIMARY KEY REFERENCES events(id),
  config_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seed the `config_json` with current Shell values: themes (pitcrew, motogp, f1), their template URLs, prompts, frame dimensions, branding colors, printer name.

**Input:** TASK-1.1, TASK-2.1 complete. Current env var values for prompts and template URLs.

**Output:**
- `event_configs` table exists
- One row for `evt_shell_001` with complete Shell config

**Risk:** Low — new table, no existing data affected.

---

### TASK-2.3: Add GET /api/config endpoint

**What:** Backend endpoint that reads `event_configs` by `eventId` and returns `EventConfig` JSON.

**Files:**
- `apps/web/src/routes/api.config.ts` (new)

**Input:** TASK-2.2 complete.

**Output:**
- `GET /api/config?eventId=<id>` returns `EventConfig` JSON
- Returns 404 if `eventId` not found
- Requires `Authorization: Bearer <API_CLIENT_KEY>` header
- Returns 401 if auth fails

**Risk:** Low — new endpoint, nothing depends on it yet.

---

### TASK-2.4: Add kiosk config file loader to Electron

**What:** On startup, Electron reads `kiosk.config.json` from `app.getPath('userData')`. Falls back to env vars for local dev.

**Files:**
- `apps/frontend/src/main.ts` (expose config via IPC)
- `apps/frontend/src/preload.ts` (expose `getKioskConfig` to renderer)
- `apps/frontend/src/types/global.d.ts` (add type)

**Input:** TASK-2.1 complete.

**Output:**
- `window.electronAPI.getKioskConfig()` returns `{ eventId, apiBaseUrl, apiClientKey }`
- In dev, reads from env vars if `kiosk.config.json` is absent
- In prod, reads from `kiosk.config.json` — error dialog if file is missing

**Risk:** Medium — changes app startup path. Must not break dev workflow.

---

### TASK-2.5: Fetch EventConfig on kiosk startup + add EventConfigContext

**What:** On app load, call `/api/config` and store the result in a React context. All routes read from this context.

**Files:**
- `apps/frontend/src/contexts/EventConfigContext.tsx` (new)
- `apps/frontend/src/renderer.tsx` (wrap app in provider)
- `apps/frontend/src/routes/index.tsx` (trigger re-fetch on new session start)

**Input:** TASK-2.3, TASK-2.4 complete.

**Output:**
- `EventConfig` is loaded on app start and re-fetched when a new session begins (guest taps "Start")
- If fetch fails, last-known config is used (cached in memory)
- If no config ever loaded and fetch fails, show an operator-facing error screen
- `useEventConfig()` hook available to all routes

**Risk:** High — this is the largest single change. Test thoroughly before deploying.

---

### TASK-2.6: Move AI config from Cloudflare env into EventConfig

**What:** Backend reads `provider`, `apiKeyOverride`, and per-theme config from `EventConfig` (fetched from DB) instead of process.env for per-event values.

**Files:**
- `apps/web/src/routes/api.ai-generate.ts`
- `apps/web/src/services/ai-generation.service.ts`
- `apps/web/src/usecases/submit-photo.usecase.ts`

**Input:** TASK-2.3 complete.

**Output:**
- `/api/ai-generate` reads the event config from DB to get `provider`, template URLs, and prompts
- Cloudflare env vars for `RACING_TEMPLATE_*`, `RACING_PROMPT_*`, `AI_PROVIDER` become fallback defaults only (not required)
- Changing a prompt in Supabase takes effect on the next API call — no redeploy

**Risk:** Medium — changes the AI request path. Must verify generation still works.

---

## Phase 3 — Config-Driven Themes

### TASK-3.1: Remove hardcoded RacingTheme type from frontend

**What:** Replace `RacingTheme = "pitcrew" | "motogp" | "f1"` with `string` throughout the frontend. Theme list comes from `EventConfig`.

**Files:**
- `apps/frontend/src/contexts/PhotoboothContext.tsx`
- `apps/frontend/src/routes/select.tsx`
- `apps/frontend/src/routes/loading.tsx`
- `apps/frontend/src/routes/result.tsx`

**Input:** TASK-2.5 complete (EventConfig available in context).

**Output:**
- `RacingTheme` type removed from frontend
- Theme selection screen renders from `EventConfig` themes array
- Frame map and canvas dimensions come from the per-theme config in `EventConfig`
- Backend `VALID_THEMES` array replaced with dynamic lookup

**Risk:** Medium — touches all routes. Validate frame composite output before deploying.

---

### TASK-3.2: Move printer name and tech config to EventConfig

**What:** `printerName` and `inactivityTimeoutSeconds` come from `EventConfig.techConfig`.

**Files:**
- `apps/frontend/src/main.ts` (read printer name from IPC/config)
- `apps/frontend/src/hooks/useInactivityTimeout.ts` (read timeout from EventConfig)
- `apps/frontend/src/preload.ts` (expose config to renderer if needed)

**Input:** TASK-2.5, TASK-0.3 complete.

**Output:**
- Printer name is not hardcoded as `"DS-RX1"`
- Inactivity timeout is not hardcoded as `60_000ms`
- Both read from `EventConfig.techConfig`

**Risk:** Low — config values, not logic.

---

## Phase 4 — Basic Dashboard

### TASK-4.1: Dashboard authentication

**What:** Simple login page for the operator. Session-based auth (cookie). No client access.

**Files:**
- `apps/web/src/routes/dashboard/_layout.tsx` (new, auth guard)
- `apps/web/src/routes/dashboard/login.tsx` (new)
- Auth stored in a simple `sessions` table or Supabase Auth

**Input:** Nothing — self-contained.

**Output:**
- `/dashboard/login` — username/password form
- All `/dashboard/*` routes redirect to login if not authenticated
- Logout clears session

**Risk:** Low.

---

### TASK-4.2: Event list + event detail overview

**What:** Dashboard home page listing events. Event detail page showing guest count and metadata.

**Files:**
- `apps/web/src/routes/dashboard/index.tsx` (new)
- `apps/web/src/routes/dashboard/events/$eventId/index.tsx` (new)

**Input:** TASK-4.1, TASK-1.1 complete.

**Output:**
- Event list shows: name, status, created date
- Event detail shows: guest count, event ID, status

**Risk:** Low.

---

### TASK-4.3: Config editor (branding + AI config + tech config)

**What:** Form UI to edit `event_configs` in Supabase.

**Files:**
- `apps/web/src/routes/dashboard/events/$eventId/config.tsx` (new)

**Input:** TASK-4.2, TASK-2.2 complete.

**Output:**
- Operator can edit branding colors, theme labels, prompts, printer name
- Save writes to `event_configs` table
- No kiosk restart required — next session picks up changes

**Risk:** Medium — incorrect values can break the kiosk. Consider a "preview" or "validate" step.

---

### TASK-4.4: Guest list + CSV export

**What:** Table of guests filtered by eventId. CSV export button.

**Files:**
- `apps/web/src/routes/dashboard/events/$eventId/guests.tsx` (new)

**Input:** TASK-4.2 complete.

**Output:**
- Table: name, email, phone, theme, timestamp
- "Export CSV" downloads a file
- Filtered to the current eventId

**Risk:** Low.

---

### TASK-4.5: Photo gallery + download

**What:** Grid of generated photos for the event. Individual download and bulk ZIP.

**Files:**
- `apps/web/src/routes/dashboard/events/$eventId/photos.tsx` (new)

**Input:** TASK-4.2, TASK-1.3 complete (photos in event-scoped paths).

**Output:**
- Grid shows thumbnails from Supabase Storage for the event
- Click to download individual photo
- "Download All" triggers bulk ZIP (can use existing download script logic)

**Risk:** Low.

---

## Phase 5 — Guest Portal

### TASK-5.1: Add sessions table to Supabase

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  photo_path TEXT,
  user_info JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Risk:** Low — new table.

---

### TASK-5.2: Create session record on photo submission

**What:** `POST /api/photo` creates a `sessions` row and returns `sessionId`.

**Files:**
- `apps/web/src/routes/api.photo.ts`
- `apps/web/src/usecases/submit-photo.usecase.ts`

**Input:** TASK-5.1 complete.

**Output:**
- `/api/photo` response includes `{ sessionId, photoUrl, userId }`

**Risk:** Low.

---

### TASK-5.3: Build /result/:sessionId web page

**What:** Server-rendered page that shows the guest's photo and a download button. Uses event branding.

**Files:**
- `apps/web/src/routes/result.$sessionId.tsx` (new)

**Input:** TASK-5.2 complete.

**Output:**
- Page loads from session ID
- Shows photo, event logo, "Download" button
- No login required

**Risk:** Low. Ensure the session ID is not guessable (use UUID).

---

### TASK-5.4: Update QR code on kiosk to use session portal URL

**What:** QR code URL changes from raw Supabase URL to `<apiBaseUrl>/result/<sessionId>`.

**Files:**
- `apps/frontend/src/routes/result.tsx`

**Input:** TASK-5.2, TASK-5.3 complete.

**Output:**
- QR code points to guest portal
- Guest portal shows branded photo page on mobile

**Risk:** Low.

---

## Task Dependency Graph

```
TASK-0.1 ──→ TASK-1.2 ──→ TASK-1.3
TASK-0.2
TASK-0.3 ──→ TASK-3.2

TASK-1.1 ──→ TASK-1.4
          ──→ TASK-2.2 ──→ TASK-2.3 ──→ TASK-2.6
                                    ──→ TASK-4.3

TASK-2.1 ──→ TASK-2.4 ──→ TASK-2.5 ──→ TASK-3.1
                                    ──→ TASK-3.2

TASK-4.1 ──→ TASK-4.2 ──→ TASK-4.3
                      ──→ TASK-4.4
                      ──→ TASK-4.5

TASK-5.1 ──→ TASK-5.2 ──→ TASK-5.3 ──→ TASK-5.4
```
