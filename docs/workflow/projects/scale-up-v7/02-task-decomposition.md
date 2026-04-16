# scale-up-v7 — Task Decomposition

**Status:** In Progress 🔄

---

## Verified Facts

Facts confirmed by reading the codebase — not inferred from filenames or prior docs.

| Fact | Source |
|------|--------|
| Dashboard event detail page shows one StatCard: "Total Guests" — counts from `users` table | `apps/web/src/routes/dashboard/_layout.events.$eventId.index.tsx:74` |
| Guest count query: `.from('users').select('*', { count: 'exact' }).eq('event_id', eventId)` | `apps/web/src/routes/dashboard/_layout.events.$eventId.index.tsx:23–26` |
| Photos are stored in **Supabase Storage** under `events/{eventId}/photos/` — **no `photo_results` table in Supabase** (only in local SQLite) | `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx:16–40` |
| Photo count on the photos page derived from `admin.storage.list(folder).length` — not a DB count | `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx:29` |
| Analytics page uses RPC function returning `total_visits`, `unique_guests`, `returning_guests` — no photo count | `apps/web/src/routes/dashboard/_layout.events.$eventId.analytics.tsx` |
| `createEvent` server fn creates event + seeds default `event_configs`; no rename/delete fn exists | `apps/web/src/routes/dashboard/_layout.index.tsx:43–97` |
| `event_configs`: FK `REFERENCES events(id)` — **no CASCADE DELETE** | `apps/web/supabase/migrations/20260331000000_create_event_configs.sql:7` |
| `sessions`: FK `REFERENCES events(id)` — **no CASCADE DELETE** | `apps/web/supabase/migrations/20260401000000_create_sessions.sql:8` |
| `users.event_id`: column exists but **no FK constraint** to events | `apps/web/supabase/migrations/20260402000000_add_event_id_updated_at_to_users.sql` |
| `events.organization_id REFERENCES organizations(id)` — **no CASCADE DELETE** | `apps/web/supabase/migrations/20260413000001_add_organization_id_to_events.sql:11` |
| Org management: create + update (rename) exist; **delete does NOT exist** | `apps/web/src/routes/dashboard/_layout.organizations.tsx:28–69` |
| `getOrganizationsWithCounts` fetches all orgs with event count | `apps/web/src/routes/dashboard/_layout.organizations.tsx:9–26` |
| Flow builder save logic: merges `moduleFlow`, `formFields`, `printerName` into `event_configs` | `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx:38–66` |
| `ResultModuleConfig`: `emailEnabled`, `qrCodeEnabled`, `printEnabled` (all optional bool) — no `retryEnabled` | `packages/types/src/module-config.ts:76–82` |
| `AiGenerationModuleConfig`: `provider`, `themes[]`, `slideshowItems` | `packages/types/src/module-config.ts:58–68` |
| Camera `getUserMedia` call inside `handleStartCamera` | `apps/frontend/src/modules/CameraModule.tsx:224–227` |
| Google AI: if `generatedImageBase64` in create response → used directly (no polling) | `apps/frontend/src/modules/AiGenerationModule.tsx:203–209` |
| Replicate: polls `/api/ai-generate-status` every 2500ms, max 60 attempts | `apps/frontend/src/modules/AiGenerationModule.tsx:212–256` |
| Retry button: exists, calls `setShowLeaveConfirm(true)` — no config gate | `apps/frontend/src/modules/ResultModule.tsx:365–371` |
| Print & Download: **single combined button** calling `handlePrintAndDownload()`; `isProcessing` reset in `finally` block | `apps/frontend/src/modules/ResultModule.tsx:341–349, 159–176` |
| `usePrint.print()` calls `window.electronAPI.print()` — **hangs indefinitely if no printer is connected** (IPC promise never resolves/rejects) | `apps/frontend/src/hooks/usePrint.tsx:25` |
| "Retry Result" and "Back to Home" buttons are **functionally identical** — both call `setShowLeaveConfirm(true)` → `reset()` | `apps/frontend/src/modules/ResultModule.tsx:365–379` |
| `useInactivityTimeout`: direct callback on timeout, no modal — caller redirects | `apps/frontend/src/hooks/useInactivityTimeout.ts:35–38` |
| `BrandingConfig`: has `fontFamily: string \| null` — **no `fontUrl` field** | `packages/types/src/event-config.ts:11–19` |
| `TechConfig`: `printerName`, `inactivityTimeoutSeconds`, `guestPortalEnabled` — **no `inactivityWarningSeconds`** | `packages/types/src/event-config.ts:43–47` |
| `EventConfigProvider`: fetches config via `/api/config?eventId=...` on startup | `apps/frontend/src/contexts/EventConfigContext.tsx:46–113` |
| Guest portal: `guestPortalEnabled` flag in `TechConfig` + dashboard checkbox — **no rendering implementation in kiosk** | `packages/types/src/event-config.ts:46`, `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx:275–284` |

---

## Phase 0 — Dashboard Data Display

### TASK-0.1 — Add total photos count to dashboard event detail page

**Status:** Pending
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/dashboard/_layout.events.$eventId.index.tsx`

**What:**
The event detail page currently shows one stat card: "Total Guests" (count from `users` table). Add a second stat card: "Total Photos".

**Important:** There is no `photo_results` table in Supabase — photos live in Supabase Storage under `events/{eventId}/photos/`. Count them via storage `.list()`, the same approach the photos page already uses:

```typescript
const [{ data: event, error }, { count: guestCount }, { data: photoFiles }] = await Promise.all([
  admin.from('events').select('id, name, status, created_at').eq('id', eventId).single(),
  admin.from('users').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
  admin.storage.from(SUPABASE_BUCKET).list(`events/${eventId}/photos`),
])
if (error) throw new Error(error.message)
const photoCount = photoFiles?.length ?? 0
```

Return `photoCount` from the loader. `StatCard` expects `value: string` — always pass `String(count)`. Add a second card:
```tsx
<StatCard label="Total Photos" value={String(photoCount)} />
<StatCard label="Total Guests" value={String(guestCount ?? 0)} hint="Only recorded when the flow includes a Form module" />
```

Import `SUPABASE_BUCKET` from `../../utils/constants` if not already imported.

**Verification:**
1. Run `pnpm wb dev`
2. Navigate to any event detail page
3. Two stat cards appear: "Total Photos" and "Total Guests"
4. "Total Guests" shows the hint text below it
5. Photos count matches the count on the Photos tab

---

### TASK-0.2 — Add photo count to analytics page

**Status:** Pending
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/dashboard/_layout.events.$eventId.analytics.tsx`

**What:**
The analytics page currently shows `total_visits`, `unique_guests`, `returning_guests` from an RPC call. Add a direct photo count query (same as TASK-0.1) and surface it as an additional stat in the analytics UI.

The photo count does not require an RPC change — add a `admin.storage.from(SUPABASE_BUCKET).list(\`events/${eventId}/photos\`)` call in the page loader alongside the existing RPC call, and surface `data?.length ?? 0` as the photo count. Same pattern as TASK-0.1.

**Verification:**
1. Navigate to any event → Analytics tab
2. A "Total Photos" metric is visible alongside existing guest metrics

---

### TASK-0.3 — Remove event status display from frontend

**Status:** Pending
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/dashboard/_layout.events.$eventId.index.tsx`

**What:**
Event status (`draft` / `active`) is a UI label with no enforcement. Remove all status badges, labels, and toggle controls from the frontend. The `status` column stays in the database — do not alter the schema or remove it from queries. Just stop rendering it.

Known locations to remove:
- `_layout.events.$eventId.index.tsx:42–46` — `STATUS_STYLES` map (delete)
- `_layout.events.$eventId.index.tsx:67–70` — the `<span>` status badge in the page header (delete)
- Keep `status` in the `getEventDetail` select query and in the `EventDetail` type — removing it from the query would require a type change with no benefit

Search for any other `event.status` or `STATUS_STYLES` usages across dashboard routes before committing.

**Verification:**
1. Navigate to the events list — no status badge visible on any event card
2. Navigate to event detail — no status indicator anywhere
3. Creating a new event still works (status field is still written to DB, just not shown)

---

## Phase 1 — Event + Organization CRUD

### TASK-1.1 — Event rename

**Status:** Pending
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/dashboard/_layout.index.tsx` or `apps/web/src/routes/dashboard/_layout.events.$eventId.index.tsx`

**What:**
Add a rename action on each event. Implement an `updateEvent` server function:
```typescript
const updateEvent = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { error } = await admin.from('events').update({ name: data.name }).eq('id', data.id)
    if (error) throw new Error(error.message)
  })
```

UI: inline edit on the event card (click pencil icon → text input → save/cancel), or a modal. Use whichever pattern is already established in the orgs page (which has rename).

**Verification:**
1. Navigate to events list
2. Click rename on an event → input appears with current name
3. Change name → confirm → event card updates with new name
4. Refresh → name persists

---

### TASK-1.2 — Event delete

**Status:** Pending
**Risk:** Medium (destructive — irreversible)
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/dashboard/_layout.index.tsx`

**What:**
Add a delete action on each event. Implement a `deleteEvent` server function.

**Critical — FK ordering:** `event_configs` and `sessions` have `REFERENCES events(id)` with **no CASCADE DELETE**. Deleting the `events` row directly will fail with a FK constraint violation. Delete dependent rows first:

```typescript
const deleteEvent = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const admin = getSupabaseAdminClient()
    // 1. Delete dependent rows first (FK constraints, no cascade)
    const { error: configError } = await admin.from('event_configs').delete().eq('event_id', data.id)
    if (configError) throw new Error(configError.message)
    const { error: sessionsError } = await admin.from('sessions').delete().eq('event_id', data.id)
    if (sessionsError) throw new Error(sessionsError.message)
    // 2. users.event_id has no FK constraint — rows become orphaned (acceptable)
    // 3. Delete the event itself
    const { error } = await admin.from('events').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
  })
```

UI: delete button on the event card → confirmation dialog ("Are you sure you want to delete [event name]? This cannot be undone.") → on confirm, call `deleteEvent` and remove from list.

**Verification:**
1. Navigate to events list
2. Click delete on an event → confirmation dialog appears
3. Confirm → event disappears from list
4. Navigate to Supabase dashboard → event row is gone

---

### TASK-1.3 — Organization delete (blocked if has events)

**Status:** Pending
**Risk:** Medium
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/dashboard/_layout.organizations.tsx`

**What:**
`getOrganizationsWithCounts` at line 9–26 already fetches each org with its event count. Use that count to gate deletion.

Add a `deleteOrganization` server function:
```typescript
const deleteOrganization = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const admin = getSupabaseAdminClient()
    // Guard: check event count first for a user-friendly error message
    const { count, error: countError } = await admin
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', data.id)
    if (countError) throw new Error(countError.message)
    if (count && count > 0)
      throw new Error(`This organization has ${count} event(s). Remove all events before deleting the organization.`)

    const { error } = await admin.from('organizations').delete().eq('id', data.id)
    if (error) throw new Error(error.message)
  })
```

**Note on FK:** `events.organization_id REFERENCES organizations(id)` with no CASCADE — Postgres itself would also reject the deletion. The explicit count-check above surfaces a friendlier message than the raw FK violation error. Both guards work; the count-check fires first.

UI: add a delete button to each org row (alongside the existing edit button). Show confirmation dialog. If the server returns an error about existing events, surface it as an inline error message (not a crash).

**Verification:**
1. Create an org with no events → delete → org disappears
2. Try to delete an org that has events → error message: "This organization has N event(s)..."
3. Delete all events from the org → retry delete → succeeds

---

## Phase 2 — Flow Builder Hardening

### TASK-2.1 — Flow validation: warn when AI gen module has no Theme Selection

**Status:** Pending
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**What:**
In the `saveFlowConfig` handler (lines 38–66), before saving, check the `moduleFlow` array:
- If any module has `moduleId === 'ai-generation'`
- AND no module has `moduleId === 'theme-selection'`
- → Show a non-blocking warning toast/banner: *"Your flow has an AI Generation module but no Theme Selection module — guests won't be able to pick a theme."*
- The save proceeds regardless (non-blocking).

**Verification:**
1. Build a flow with AI Generation but no Theme Selection → click Save
2. Warning message appears
3. Config is saved successfully (flow works)
4. Build a flow with both modules → save → no warning

---

### TASK-2.2 — Flow validation: printer name required when print enabled

**Status:** Pending
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**What:**
In `saveFlowConfig`, check: if the Result module config has `printEnabled === true` (or if `printEnabled` is not explicitly false, given it defaults to true) AND `printerName` is empty or whitespace → **block the save** with a hard validation error: *"Printer name is required when printing is enabled. Go to the Result module settings to set a printer name."*

**Verification:**
1. Add Result module with print enabled + leave printer name empty → click Save → error message, save blocked
2. Fill in printer name → save succeeds
3. Disable print in Result module + empty printer name → save succeeds (no print, no requirement)

---

### TASK-2.3 — Add `retryEnabled` to ResultModuleConfig and flow builder UI

**Status:** Pending
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `packages/types/src/module-config.ts`, `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`, `apps/frontend/src/modules/ResultModule.tsx`

**What:**

**Step 1 — Type change** (`packages/types/src/module-config.ts`):
Add `retryEnabled?: boolean` to `ResultModuleConfig`.

**Step 2 — Flow builder UI** (`apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`):
In the Result module config panel, add a checkbox: "Allow guest to retry AI generation".
- Disabled (greyed out with tooltip: *"Requires an AI Generation module in the flow"*) when no `ai-generation` module exists in `moduleFlow`.
- When enabled, sets `retryEnabled: true` in the Result module config.

**Step 3 — Kiosk** (`apps/frontend/src/modules/ResultModule.tsx`):
The retry button already exists at lines 365–371. Gate its render on `config.retryEnabled === true`:
```tsx
{config.retryEnabled && (
  <button onClick={() => setShowLeaveConfirm(true)}>Retry Result</button>
)}
```

**Behavior gap — document but do NOT fix in V7:**
Currently both "Retry Result" (line 368) and "Back to Home" (line 374) call `setShowLeaveConfirm(true)` and are functionally identical — both lead to `reset()` (go home). The creator's intent is for "Retry Result" to re-run AI generation with the same photo/theme. This requires the pipeline to support stepping back to a specific module, which the current `PipelineContext` cannot do (`reset()` is the only exit). Implementing true retry-AI-gen behavior is out of V7 scope. Document this gap with a code comment in `ResultModule.tsx` near the retry button:
```tsx
// TODO V8: retry should jump back to the ai-generation step, not reset to home.
// Requires pipeline step-back capability (not yet implemented).
```

**Verification:**
1. Flow without AI gen module → Result module config → retry checkbox is disabled
2. Add AI gen module → retry checkbox becomes enabled
3. Enable retry → save → open kiosk → retry button visible on result screen
4. Disable retry (or no AI gen) → save → open kiosk → retry button not visible

---

## Phase 3 — Kiosk Feel

### ~~TASK-3.1 — Camera loading spinner~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/frontend/src/modules/CameraModule.tsx`

**What:**
`handleStartCamera` (lines 192–263) calls `getUserMedia` which can take 1–3 seconds. During this time the camera area is blank.

Add a `isCameraLoading` state initialized to `true`. Set it to `false` after the stream is attached to the video element and `video.play()` resolves. Render a centered spinner (Tailwind `animate-spin`) in place of the video feed while `isCameraLoading === true`.

**Verification:**
1. Open the kiosk → navigate to camera step
2. A spinner is visible for the 1–3 seconds before the camera feed appears
3. Spinner disappears when the live feed is showing

**Notes:** Audio sounds implemented via Web Audio API (no external audio files). Back button also disabled (`disabled:invisible`) while `isCameraLoading || isCameraActive` — prevents guests from accidentally navigating away and resetting retake count. See hotfix below.

---

### ~~TASK-3.2 — Countdown sound~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/frontend/src/modules/CameraModule.tsx`

**What:**
The countdown ticks (3, 2, 1) exist as state already. Play a short tick sound on each countdown value change using the Web Audio API or a simple `<audio>` element with `.play()`.

Implemented via `playTick()` — Web Audio API sine wave at 880 Hz, 100 ms, exponential fade. No external audio files needed.

**Verification:**
1. Navigate to camera step → tap the capture button
2. A tick sound plays for each countdown number (3, 2, 1)
3. Retake flow: countdown sounds play again on retry

---

### ~~TASK-3.3 — Flash overlay and shutter sound on capture~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** TASK-3.2 (adds the audio infrastructure)
**Files touched:** `apps/frontend/src/modules/CameraModule.tsx`, `apps/frontend/src/index.css`

**What:**
At the moment the photo is captured (after countdown reaches 0):
1. **Flash:** briefly render a white full-screen overlay (`position: fixed`, `inset: 0`, `bg-white`, `opacity-100`) that fades out over ~300ms using a CSS transition or Tailwind animation.
2. **Shutter sound:** play a camera click sound at capture moment.

Implemented via `playShutter()` (Web Audio API noise burst) + `isFlashing` state + `animate-flash` keyframe in `index.css`. No external audio files.

**Verification:**
1. Navigate to camera → complete countdown
2. A white flash briefly covers the screen at capture moment
3. A shutter click sound plays simultaneously

---

### Hotfix — Camera back button disabled while stream active ✅

**Status:** Complete (discovered during Phase 3 verification)
**Files touched:** `apps/frontend/src/modules/CameraModule.tsx`

Back button was always wired to `back()` in PipelineContext. Pressing it unmounts CameraModule and remounts it on re-entry, resetting all local state including `retakeCount`. Fixed by adding `disabled={isCameraLoading || isCameraActive}` + `disabled:invisible` — button is hidden during the entire active camera session, visible only in the error state so guests can exit.

---

## Phase 4 — Kiosk UX

### ~~TASK-4.1 — Align Google AI generation with Replicate polling pattern~~ ✅

**Status:** Complete
**Risk:** Medium (touches AI generation pipeline)
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/api.ai-generate.ts`, `apps/web/src/usecases/ai-generation.usecase.ts` (or equivalent), `apps/frontend/src/modules/AiGenerationModule.tsx`

**What:**
Currently, the Google AI path returns `generatedImageBase64` synchronously in the create response (lines 203–209 in `AiGenerationModule.tsx`). This causes the loading bar to stay low then jump to 100% suddenly.

**Backend:** Refactor the Google AI path to mirror the Replicate path — create a job, store it in `ai_jobs`, return a `predictionId`. The polling endpoint (`/api/ai-generate-status`) then handles checking job status and returning the result when ready.

**Frontend:** Remove the sync shortcut at lines 203–209. Both Replicate and Google now go through the same polling loop at lines 212–256. The progress bar advances naturally as polls complete.

**Accuracy note:** The progress bar is currently stuck at **10%** (not 25%) during the long Google wait — `setProgress(10)` fires at line 148, then the frontend awaits the create response for the entire duration of Google AI (~30–60s). It jumps to 25%→85%→100% rapidly once the (now-blocking) server responds. The fix makes the server return immediately with a job ID, so the polling loop drives the progress bar.

**Before writing:** Read `apps/web/src/routes/api.ai-generate.ts` and the Google AI service implementation fully to understand the current sync flow before refactoring.

**Verification:**
1. Configure a test event with `provider: 'google'`
2. Complete a photobooth session through AI generation
3. Loading bar advances gradually (not stuck then sudden jump)
4. Replicate provider still works (regression check)

---

### ~~TASK-4.2 — Inactivity warning modal (two-timer system)~~ ✅

**Status:** Complete
**Risk:** Medium (touches inactivity flow)
**Depends on:** Nothing
**Files touched:** `apps/frontend/src/hooks/useInactivityTimeout.ts`, `packages/types/src/event-config.ts`, `apps/frontend/src/components/PipelineRenderer.tsx` (or wherever the hook is consumed), `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx`

**What:**

**Step 1 — Type** (`packages/types/src/event-config.ts`):
Add `inactivityWarningSeconds?: number` to `TechConfig` (default: 15).

**Step 2 — Hook** (`apps/frontend/src/hooks/useInactivityTimeout.ts`):
Refactor the hook to accept two callbacks and two durations:
- `onInactivity` — called after `inactivityTimeoutSeconds` of no interaction → caller shows modal
- `onRedirect` — called after `inactivityWarningSeconds` of the modal being shown → caller redirects
- Add a `resetWarning()` function the caller uses when the guest taps "I'm still here"

Or implement as two separate chained timers in the hook: inactivity timer fires → modal timer starts → redirect. Expose a `showWarning` boolean and a `resetAll()` function.

**Step 3 — UI** (wherever the hook is consumed):
Show a modal overlay when `showWarning === true`:
- Message: *"Still there? You'll be redirected to the home screen in [countdown] seconds."*
- "I'm still here" button → calls `resetAll()` and closes modal
- Countdown ticking down from `inactivityWarningSeconds`

**Step 4 — Dashboard config** (`apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx`):
Add a number input for "Inactivity warning duration (seconds)" beside the existing inactivity timeout input.

**Verification:**
1. Set inactivity timeout to 10s, warning duration to 5s in event config
2. Open kiosk → wait 10s without touching screen → warning modal appears with 5s countdown
3. Tap "I'm still here" → modal closes, both timers reset
4. Let modal countdown expire → redirected to home screen
5. Active use (tapping around) → no modal appears

---

### ~~TASK-4.3 — Separate download and print into two buttons~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/frontend/src/modules/ResultModule.tsx`

**What:**
The current combined "Print & Download" button at lines 341–349 calls `handlePrintAndDownload()`. Split into two independent buttons:
- **"Download Photo"** — triggers the QR code / download flow
- **"Print Photo"** — triggers the print flow

Each button has its own loading state (`isDownloading`, `isPrinting`) so one action being in progress doesn't block the other.

Read the current `handlePrintAndDownload` implementation fully before splitting to ensure both code paths are preserved correctly.

**Verification:**
1. Navigate to result screen
2. Two separate buttons visible: "Download Photo" and "Print Photo"
3. Tapping "Download Photo" → QR code or download triggers
4. Tapping "Print Photo" → print triggers
5. Both can be used independently without blocking each other

---

### ~~TASK-4.4 — Fix button freeze ("processing") after modal close~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** TASK-4.3 (split buttons first, then investigate per-button state)
**Files touched:** `apps/frontend/src/modules/ResultModule.tsx`

**What:**
After triggering print, the button stays in "processing" state. The actual root cause: `handlePrintAndDownload` sets `isProcessing = true` then calls `handlePrint()`, which calls `usePrint().print()`, which calls `window.electronAPI.print()`. When no printer is connected, the Electron IPC promise at `usePrint.tsx:25` **never resolves or rejects** — the `finally` block in `handlePrintAndDownload` (line 173) is never reached, so `setIsProcessing(false)` never fires.

**Fix:** Add a timeout wrapper around the `window.electronAPI.print()` call in `usePrint.tsx`:
```typescript
const PRINT_TIMEOUT_MS = 15_000

const printWithTimeout = (filePath: string, printerName?: string) =>
  Promise.race([
    window.electronAPI.print(filePath, printerName),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Print timed out after 15 seconds')), PRINT_TIMEOUT_MS)
    ),
  ])
```

Replace the `window.electronAPI.print(filePath, printerName)` call on line 25 with `printWithTimeout(filePath, printerName)`. The timeout error is caught by the existing `catch` block in `usePrint` and returned as `{ success: false, error: '...' }`, which `handlePrint` in `ResultModule` already handles.

After splitting buttons in TASK-4.3, this freeze will only affect the print button, not download/QR.

**Verification:**
1. Navigate to result screen
2. Tap "Download Photo" → modal opens
3. Close modal without completing download
4. Button returns to normal (non-processing) state
5. Button is tappable again

---

## Phase 5 — Font Customization

### ~~TASK-5.1 — Add `fontUrl` to `BrandingConfig` type + default config~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `packages/types/src/event-config.ts`, `apps/web/src/routes/dashboard/_layout.index.tsx` (default config seed)

**What:**
Add `fontUrl: string | null` to `BrandingConfig` in `packages/types/src/event-config.ts`, alongside the existing `fontFamily: string | null`.

Update the default config seed in `createEvent` (line 63–90) to include `fontUrl: null`.

No migration needed — existing `config_json` JSONB rows will just not have the key; code reads it as `null` via nullish access.

**Verification:**
1. `BrandingConfig` type has both `fontFamily` and `fontUrl` fields
2. Creating a new event → inspect `config_json` in Supabase → `branding.fontUrl` is `null`

---

### ~~TASK-5.2 — Dashboard: font file upload to Supabase Storage~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** TASK-5.1
**Files touched:** `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx`

**What:**
In the event config page, replace (or supplement) the existing plain text "Font Family" input with:
1. A **file upload input** — accepts `.woff2`, `.woff`, `.ttf`, `.otf` only (validate extension client-side)
2. On file select → upload to Supabase Storage under `fonts/<eventId>/<filename>` using the admin client
3. Get the public URL → save as `branding.fontUrl` in `event_configs`
4. The `fontFamily` text input remains — the operator sets the CSS font-family name (e.g. `"MyBrand"`) separately from the file URL

Show the current font file URL (or filename) if one is already set, with a "Remove" button that sets `fontUrl: null`.

**Supported formats validation:**
```typescript
const ALLOWED_FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf']
const ext = file.name.split('.').pop()?.toLowerCase()
if (!ext || !ALLOWED_FONT_EXTENSIONS.includes(`.${ext}`)) {
  setError('Font must be .woff2, .woff, .ttf, or .otf')
  return
}
```

**Verification:**
1. Navigate to event config → font section
2. Upload a `.woff2` file → public URL saved in `branding.fontUrl`
3. Try uploading a `.jpg` → validation error, no upload
4. "Remove" button → `fontUrl` set to null

---

### ~~TASK-5.3 — Kiosk: inject custom font once at app startup~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** TASK-5.1
**Files touched:** `apps/frontend/src/contexts/EventConfigContext.tsx` (or the root app component)

**What:**
After `EventConfigProvider` finishes loading the config (status reaches `"ready"`), check `config.branding.fontUrl` and `config.branding.fontFamily`. If both are set, inject a `<style>` tag into `document.head`:

```typescript
const style = document.createElement('style')
style.id = 'custom-font'
style.textContent = `
  @font-face {
    font-family: '${config.branding.fontFamily}';
    src: url('${config.branding.fontUrl}');
    font-display: swap;
  }
  :root {
    --font-custom: '${config.branding.fontFamily}', sans-serif;
  }
`
document.head.appendChild(style)
```

This runs once. Because the kiosk is a React SPA (HashRouter), no full page reloads occur between routes — the injected style persists for the entire session.

If a `custom-font` style tag already exists (e.g. hot reload in dev), remove it before re-injecting to avoid duplicates.

**Verification:**
1. Set `fontUrl` + `fontFamily` in event config
2. Open kiosk → inspect `document.head` in dev tools → `<style id="custom-font">` present with `@font-face` rule
3. Navigate between kiosk screens → style tag still present (no re-injection)
4. Set `fontUrl: null` → no style tag injected, no errors

---

## Phase 6 — Guest Portal Verification

### ~~TASK-6.1 — Verify guest portal end-to-end; document config location~~ ✅

**Status:** Complete
**Risk:** Low (investigation only — no code changes unless broken)
**Depends on:** Nothing
**Files touched:** None (investigation only)

**What:**
The `guestPortalEnabled` flag exists in `TechConfig` and the dashboard config page has a checkbox. However, **no rendering implementation was found in the kiosk frontend modules**. This task is an investigation.

**Findings:**

**1. Guest portal web page — fully implemented** (`apps/web/src/routes/result.$sessionId.tsx`)
- Accessible at `{apiBaseUrl}/result/{sessionId}`
- Fetches session from Supabase → gets photo URL from Storage → loads branding from `event_configs`
- Renders a branded page: logo, `portalHeading` + guest name, photo, "Download Photo" button
- Injects custom fonts from `branding.fonts` using the same `@font-face` pattern as the kiosk
- Shows "Photo not found" gracefully on invalid/expired session IDs

**2. Kiosk QR code — implemented** (`apps/frontend/src/modules/ResultModule.tsx:294–295`)
- After calling `/api/photo`, gets back `sessionId` → builds `qrUrl = ${apiBaseUrl}/result/${sessionId}`
- Shows `QRCodeModal` when `isQrCodeEnabled` (from `ResultModuleConfig.qrCodeEnabled`) is `true` AND `qrUrl` is set

**3. Caveat — QR only works with Form + email enabled**
The guard at `ResultModule.tsx:265` is `if (userInfo && isEmailEnabled)` — the `/api/photo` call (which returns the `sessionId`) is skipped when the Form module is absent or email is disabled. No Form → no sessionId → no QR code. This is an acceptable limitation for V7.

**4. `guestPortalEnabled` in `TechConfig` — dead flag**
- Stored in `event_configs.config_json.techConfig.guestPortalEnabled`
- Dashboard checkbox at `_layout.events.$eventId.config.tsx:446` writes to it
- **Never read by the kiosk** — QR visibility is controlled by `ResultModuleConfig.qrCodeEnabled` instead
- The flag is redundant / has no effect. Deferred to V8 to decide: wire it to the QR feature, or remove it.

**Verdict: implemented and working.** No code changes needed in V7.

**Verification:**
- Guest portal web page exists and is fully implemented ✅
- QR code on kiosk points to it (gated by `qrCodeEnabled` + Form module present + email enabled) ✅
- `guestPortalEnabled` flag is dead — documented, deferred to V8 ✅

---

### ~~TASK-6.2 — Fix sessions table schema drift (add `status` + `module_outputs` columns)~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** Nothing
**Files touched:**
- `apps/web/supabase/migrations/<timestamp>_add_status_module_outputs_to_sessions.sql` (new)
- `apps/web/src/repositories/session.repository.ts` (verify writes are correct after migration)

**What:**
The `sessions` table migration (`20260401000000_create_sessions.sql`) is missing two columns that `session.repository.ts` already tries to write:
- `status TEXT NOT NULL DEFAULT 'in_progress'` — written by `startSession()` and `completeSession()`
- `module_outputs JSONB` — written by `completeSession()`

These columns don't exist in the DB, so every `completeSession()` call silently fails to persist them. Create a new migration to add both columns.

Migration content:
```sql
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS module_outputs JSONB;
```

After adding the migration, read `session.repository.ts` fully and verify the column names in `startSession()` and `completeSession()` match exactly.

**Verification:**
1. Run the migration in Supabase SQL editor (or confirm it applies cleanly)
2. Complete a full photobooth session → inspect the `sessions` row in Supabase → `status` = `'completed'`, `module_outputs` populated

---

### ~~TASK-6.3 — Add `PATCH /api/session/photo` endpoint~~ ✅

**Status:** Complete
**Risk:** Low
**Depends on:** TASK-6.2
**Files touched:**
- `apps/web/src/routes/api.session.photo.ts` (new)
- `apps/web/src/repositories/session.repository.ts` (add `updatePhotoPath` method)

**What:**
Add a minimal authenticated endpoint that writes `photo_path` onto an existing session row. This is the only write needed to make the guest portal accessible without a Form module.

**Repository method** (`session.repository.ts`):
```typescript
async updatePhotoPath(sessionId: string, photoPath: string): Promise<void> {
  const { error } = await this.client
    .from('sessions')
    .update({ photo_path: photoPath })
    .eq('id', sessionId)
  if (error) throw new Error(error.message)
}
```

**Route** (`apps/web/src/routes/api.session.photo.ts`):
```typescript
// PATCH /api/session/photo
// Body: { sessionId: string, photoPath: string }
// Auth: Bearer API_CLIENT_KEY (same as /api/photo)
```

Reuse the existing auth pattern from `api.photo.ts` — check `Authorization: Bearer <API_CLIENT_KEY>` header. Return `{ ok: true }` on success.

**Verification:**
1. POST a valid `sessionId` + `photoPath` → `sessions` row updated
2. Missing/invalid bearer token → 401
3. Unknown `sessionId` → no error (UPDATE with no matching rows is not an error in Postgres — acceptable)

---

### ~~TASK-6.4 — Decouple QR code from Form + email in ResultModule~~ ✅

**Status:** Complete
**Risk:** Medium (touches core result save flow)
**Depends on:** TASK-6.3
**Files touched:** `apps/frontend/src/modules/ResultModule.tsx`

**What:**
Currently `qrUrl` is only set if `userInfo && isEmailEnabled` (line 265), because it was piggybacking on the `/api/photo` response. After TASK-6.3, we have a dedicated endpoint for setting `photo_path`, so the QR URL can always be built.

**Key insight:** `sessionId` is already in `outputs["sessionId"]` from the start of the pipeline (set by PipelineRenderer after the Welcome module). It doesn't need to come from a server response.

**Changes to `ResultModule.tsx`:**

1. After the Supabase Storage upload succeeds, always call `PATCH /api/session/photo`:
```typescript
// Always update photo_path on session (enables guest portal regardless of Form/email)
await fetch(`${apiBaseUrl}/api/session/photo`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiClientKey}`,
  },
  body: JSON.stringify({ sessionId, photoPath: supabasePath }),
})
// Build qrUrl immediately — sessionId was known from pipeline start
if (sessionId) {
  setQrUrl(`${apiBaseUrl}/result/${sessionId}`)
}
```

2. Remove `setQrUrl(...)` from inside the `/api/photo` response handler (line 295) — `qrUrl` is now set unconditionally after the storage upload.

3. The `/api/photo` call remains unchanged for Form + email flows — it still handles `user_info`, `module_outputs`, `status: 'completed'`, and email sending. It just no longer controls `qrUrl`.

**Guard:** Only call `PATCH /api/session/photo` if `sessionId` is truthy (it always should be for a properly configured flow with a Welcome module, but guard defensively).

**Verification:**
1. Flow **with** Form module + email enabled → QR code appears ✅, email sent ✅
2. Flow **without** Form module → QR code still appears ✅, no email ✅
3. Flow with Form module but `emailEnabled: false` → QR code still appears ✅
4. `qrCodeEnabled: false` in Result module config → QR modal not shown (existing gate unchanged) ✅
5. Guest scans QR → guest portal loads with correct photo ✅

---

## Design Review — Issues Identified and Resolved

### Issue 1 — TASK-0.1/0.2: No `photo_results` table in Supabase ✅ Resolved

**Type:** Implementation error (caught in review)
**Resolution:** Photos are stored in Supabase Storage, not a DB table. Photo count comes from `admin.storage.list(\`events/${eventId}/photos\`).length`. Tasks updated accordingly.

### Issue 2 — TASK-1.2: FK constraints block event deletion without explicit ordering ✅ Resolved

**Type:** Risk
**Resolution:** `event_configs` and `sessions` have non-cascading FKs to `events`. Server function must delete those rows first. `users.event_id` has no FK — orphaned rows are acceptable. Task updated with explicit delete sequence.

### Issue 3 — TASK-1.3: `events → organizations` FK also non-cascading ✅ Noted

**Type:** Risk (low — it's the desired behavior)
**Resolution:** `events.organization_id REFERENCES organizations(id)` without CASCADE. Our count-check guard fires first and gives a friendlier error than the raw FK violation. Noted in task.

### Issue 4 — TASK-2.3: Retry button cannot re-run AI gen without new pipeline capability ✅ Scoped down

**Type:** Design gap
**Resolution:** Both retry and back-home buttons currently call `reset()` (identical behavior). True retry-AI-gen requires a step-back capability the pipeline doesn't have. V7 scope: visibility flag only (`retryEnabled`). Actual retry behavior deferred to V8 with a TODO comment in code.

### Issue 5 — TASK-4.4: Button freeze root cause is a hanging Electron IPC, not state reset ✅ Resolved

**Type:** Wrong root cause diagnosis
**Resolution:** `window.electronAPI.print()` never resolves/rejects when no printer is connected. Fix is a 15s timeout wrapper in `usePrint.tsx`, not a modal-close handler fix. Task updated.

### Issue 6 — TASK-4.1: Progress stuck at 10% (not 25%) during Google AI wait ✅ Corrected

**Type:** Minor inaccuracy
**Resolution:** The frontend is stuck at 10% (`setProgress(10)` line 148) while awaiting the blocking create response. Jumps to 25% only after the server responds. Task description corrected.

### Issue 7 — TASK-6.1: Guest portal is implemented and working ✅ Resolved

**Type:** Scope risk
**Task:** TASK-6.1
**Resolution:** Guest portal web page (`apps/web/src/routes/result.$sessionId.tsx`) is fully implemented. Kiosk QR code points to it. The `guestPortalEnabled` flag in `TechConfig` is dead (QR is controlled by `ResultModuleConfig.qrCodeEnabled` instead). Dead flag deferred to V8.
