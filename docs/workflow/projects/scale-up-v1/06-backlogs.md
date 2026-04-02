# Phase 0–4 Migration Review — Risks, Vulnerabilities & Backlog

**Scope:** Deep analysis of all code changes from Phase 0 (hotfixes) through Phase 4 (dashboard).
**Purpose:** Surface findings before Phase 5 work begins, and define a prioritized backlog.
**Date:** 2026-03-31

---

## 1. Executive Summary

The migration from single-client hardcoded app → config-driven multi-client SaaS is structurally sound. The core data flow (kiosk → AI generation → Supabase → dashboard) works end-to-end. The Electron frontend, TanStack Start backend, and Supabase storage layer are all integrated correctly.

However, several issues have accumulated that need resolution before a live event deployment:

- **One critical architectural flaw** that will silently break AI generation in production (Google AI + Cloudflare Workers incompatibility)
- **Two security issues** that need fixing before public exposure
- **One UX compliance gap** (consent not enforced on form submit)
- A wider set of medium-priority bugs, code quality issues, and UX gaps that will degrade operator and guest experience at scale

---

## 2. Critical Risks (P0)

These will cause silent failures or data loss in production.

---

### RISK-01: Google AI job store is incompatible with Cloudflare Workers

**File:** `apps/web/src/services/ai-generation.service.ts:42`
**Severity:** Critical

The Google AI provider stores in-flight predictions in a module-level `Map`:

```ts
const googleJobStore = new Map<string, GoogleJobEntry>()
```

This is acknowledged in a comment (`NOTE: For Cloudflare Workers, replace with persistent store`), but the fix is not implemented. Cloudflare Workers are stateless and ephemeral — each Worker invocation may run on a different V8 isolate. When the frontend polls `/api/ai-generate-status` for a Google job, the `googleJobStore` on that isolate is empty, and the job is returned as "not found" or failed.

**Effect:** Google AI provider is broken in production (Cloudflare deployment) even though it works in `pnpm wb dev` (single long-running Node process). This is a silent failure — no crash, just a "generation failed" error to the guest.

**Fix required:** Replace the in-memory Map with a Supabase `ai_jobs` table (or equivalent persistent store). A new task is defined for this in Section 8.

---

### RISK-02: Supabase upload failure leaves an irrecoverable partial save

**File:** `apps/frontend/src/routes/result.tsx:160–215`
**Severity:** High

The auto-save flow on the result page is:

1. Save photo file locally (Electron file system) ✅
2. Insert row into SQLite ✅
3. Upload photo blob to Supabase Storage
4. POST to `/api/photo` (creates Supabase `users` record)

Steps 3 and 4 run after steps 1 and 2. If the network drops between steps 2 and 3:
- Local records exist (SQLite + file on disk)
- Supabase has nothing
- `hasSaved.current = false` is reset on error (line 214), so the save will re-attempt if the user stays on the result page

But there is no cross-check between local and cloud state. If the user taps "Reset" (or the inactivity timer fires) before the retry succeeds, the local record is orphaned with no cloud counterpart. Supabase is the source of truth per project invariants.

**Effect:** Guests' photos and records can be permanently lost from the cloud view without the operator knowing.

**Fix required:** A background sync mechanism or a session-state recovery queue. This is tracked as a Phase 6 item already in the migration plan; this review re-prioritizes it.

---

### RISK-03: Print timing is a race condition, not a guarantee

**File:** `apps/frontend/src/main.ts:376`
**Severity:** High (events-blocking)

The print handler waits a fixed `500ms` after `printWindow.loadFile()` before calling `webContents.print()`:

```ts
await new Promise((resolve) => setTimeout(resolve, 500));
printWindow.webContents.print({ ... });
```

A `setTimeout` is not a load guarantee. On a slow machine or with a large base64 photo, the print dialog fires before the image is fully rendered, resulting in a blank or partially-rendered print. The print window is then closed after a further 1-second `setTimeout` — again, not waiting for the print job to actually complete.

**Effect:** Blank prints at events. The operator sees "Print successful" but the physical output is blank.

**Fix required:** Listen to `webContents.did-finish-load` event before printing, and use `printWindow.webContents.on('after-print')` for cleanup.

---

## 3. Security Vulnerabilities

---

### SEC-01: `VITE_API_CLIENT_KEY` is baked into the frontend JS bundle

**File:** `apps/frontend/.env`, `apps/frontend/src/routes/result.tsx`
**Severity:** High

Any environment variable prefixed `VITE_` is compiled directly into the Electron renderer bundle by Vite at build time. The `API_CLIENT_KEY` shared secret is readable by anyone who extracts and inspects the app's `asar` package:

```bash
npx asar extract app.asar ./extracted
grep -r "API_CLIENT_KEY" ./extracted
```

Since `API_CLIENT_KEY` is the only auth mechanism for `/api/photo` and `/api/ai-generate`, an attacker with physical access to a kiosk can make unlimited calls to the backend API.

**Mitigations to consider:**
1. Move the API key into `kiosk.config.json` (already in `userData`, not bundled) — Phase 2 put the `apiClientKey` there already, but `result.tsx` still reads `import.meta.env.VITE_API_CLIENT_KEY` directly
2. Add rate limiting by IP or origin header on the backend
3. Rotate keys per-event (low friction since config is already in Supabase)

**Current partial mitigation:** The kiosk runs in fullscreen/kiosk mode with DevTools disabled in production. But physical access to the machine bypasses this.

---

### SEC-02: Dashboard login exposes raw Supabase error messages

**File:** `apps/web/src/routes/dashboard/login.tsx:~92`
**Severity:** Medium

Auth failures show the raw Supabase error string:

```tsx
setError(authError.message)
```

Supabase auth errors can include details like "Email not confirmed" or "Invalid login credentials" that confirm account existence. This is a low-severity information leak but a real one.

**Fix:** Map known Supabase error codes to generic messages ("Incorrect email or password").

---

### SEC-03: Input sanitization strips only `<>` from name field

**File:** `apps/web/src/routes/api.photo.ts:46`
**Severity:** Low

```ts
function sanitizeName(name: string): string {
  return name.trim().replace(/[<>]/g, '')
}
```

This only prevents HTML tag injection. It does not prevent: null bytes, control characters, emoji clusters that may break downstream CSV exports, or names longer than a practical limit. The email template and CSV export receive this value.

**Fix:** Add max length (e.g. 100 chars), strip control characters, and consider a more comprehensive sanitizer.

---

### SEC-04: No rate limiting on any API endpoint

**Files:** `api.photo.ts`, `api.ai-generate.ts`, `api.config.ts`
**Severity:** Medium

All three API routes authenticate with a Bearer token but have no request rate limiting. A valid token can trigger unlimited Replicate predictions (each one costs real money) or write unlimited user records.

**Fix:** Add Cloudflare rate limiting rules in `wrangler.jsonc`, or use a Cloudflare Worker middleware.

---

## 4. Data Integrity Issues

---

### DATA-01: Consent checkbox is not enforced on form submit

**File:** `apps/frontend/src/routes/form.tsx:25–29`
**Severity:** High (legal/compliance)

`isConsentChecked` state is tracked, but `handleSubmit` never validates it:

```ts
const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  setShowKeyboard(false)
  setUserInfo({ name, email, phone })  // consent not checked
  void navigate('/loading')
}
```

A guest can submit the form without ticking the consent checkbox. Their photo, email, and phone are then saved to Supabase without consent. Under Indonesia's PDP Law (UU PDP), this may constitute unlawful data processing.

**Fix:** Add `if (!isConsentChecked) return` before the navigate call, and show a validation message. This should be gated on `config.formFields.consent`.

---

### DATA-02: `hasSaved.current` flag does not survive navigation

**File:** `apps/frontend/src/routes/result.tsx:153–218`
**Severity:** Medium

The auto-save guard uses a `useRef` (`hasSaved.current`) to prevent double-saves. Refs are scoped to a component instance. If the user navigates away from `/result` and back (e.g., by pressing the back button in dev mode or via browser history manipulation), the component remounts fresh with `hasSaved.current = false`, and the entire save flow runs again — creating a duplicate SQLite row and potentially a duplicate Supabase `users` record.

**Fix:** A session-scoped save lock (e.g. `sessionStorage` flag keyed on photo filename) that persists across remounts.

---

### DATA-03: Duplicate user records in Supabase — no unique constraint

**Files:** `apps/web/src/repositories/user.repository.ts`, Supabase schema
**Severity:** Medium

The `users` table has no unique constraint on `(email, event_id)` or `(phone, event_id)`. If a guest completes two sessions at the same event, or if the double-save race (DATA-02) fires, two rows with identical email/phone are created silently.

**Fix:** Add a Supabase unique index: `UNIQUE (email, event_id)` and handle conflict in the repository with an upsert.

---

### DATA-04: Supabase temp photo not cleaned up on AI generation failure

**File:** `apps/web/src/routes/api.ai-generate.ts:252–258`
**Severity:** Low

If the Replicate prediction creation call fails after the temp photo has been uploaded to `temp/`, the cleanup branch is only in the status endpoint (`api.ai-generate-status.ts`). A prediction that never starts polling will leave the temp file in `photobooth-bucket/temp/` indefinitely.

**Fix:** Add cleanup in the catch block of `api.ai-generate.ts` after upload success + prediction failure.

---

## 5. UX Improvement Areas

---

### UX-01: No visual feedback during Supabase save on result page

**File:** `apps/frontend/src/routes/result.tsx`

The result page shows the final photo immediately on mount and auto-saves in the background. If the save takes 3–5 seconds (normal on slow connections), the guest sees a fully loaded page but the "Save" / "QR code" might not be ready. There is no spinner, progress indicator, or "Uploading…" label.

**Recommendation:** Show a subtle "Saving…" / "Ready" indicator near the QR code area. Block printing until the photo path is confirmed (currently `handlePrint` fires in parallel with the upload on line 118 of result.tsx).

---

### UX-02: Inactivity timeout fires during loading/result if the config has a short timeout

**File:** `apps/frontend/src/hooks/useInactivityTimeout.ts`
**File:** `apps/frontend/src/routes/loading.tsx`

Phase 3 wired `inactivityTimeoutSeconds` from `EventConfig`, but the `/loading` page suppresses the timeout by checking `isLoading`. If the config uses a value less than the AI generation time (e.g., 30s config, 45s generation), the kiosk resets mid-generation.

The suppression logic is route-specific and fragile. If a new route is added without the suppression, timeout fires inappropriately.

**Recommendation:** Move timeout suppression to a context-level flag (`suppressInactivity`) that loading, printing, and any long-running operation can set, rather than per-route logic.

---

### UX-03: Empty theme list in select.tsx shows a blank screen

**File:** `apps/frontend/src/routes/select.tsx`

If `config.aiConfig.themes` is an empty array (misconfigured event), the theme selection page renders no buttons with no error message. The guest sees a blank screen with no indication of the problem.

**Recommendation:** Show an operator-facing error: "No themes configured for this event. Contact your event manager."

---

### UX-04: "Retake" on camera page does not warn the guest about retake limit

**File:** `apps/frontend/src/routes/camera.tsx`

The max retake limit is 2 (`MAX_RETAKE_COUNT`). When the guest uses their last retake, the button disappears without warning. On the second capture, the guest may not realize it's their final shot.

**Recommendation:** Show "Last retake!" warning text when retake count reaches `MAX_RETAKE_COUNT - 1`.

---

### UX-05: Dashboard config editor has no revert / undo

**File:** `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx`

Once an operator makes edits to the config form and saves, there is no way to undo. If a wrong prompt or broken URL is saved, the operator must manually correct all fields. The risk note in the task decomposition specifically called for a "validate" step, but only a browser `confirm()` dialog was implemented.

**Recommendation (short-term):** Add a "Discard changes" button that resets the form to the last loaded state (`initial` from loader).
**Recommendation (long-term):** Implement config versioning — store a history of `config_json` snapshots and allow rollback to any previous version.

---

### UX-06: Dashboard config editor accepts invalid values for numeric fields

**File:** `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx`

Canvas width/height, photo dimensions, and inactivity timeout accept any value including zero, negatives, and non-integers (browsers allow decimal input on `type="number"`). A zero canvas width will silently produce a corrupted composite image on the kiosk.

**Recommendation:** Add client-side validation before the save call: dimensions must be positive integers, timeout must be ≥ 10 seconds.

---

### UX-07: Dashboard guest list and photo gallery have no pagination

**Files:** `_layout.events.$eventId.guests.tsx`, `_layout.events.$eventId.photos.tsx`

Both pages load the entire dataset in one query. At 500+ guests or 500+ photos (realistic for a busy event day), this will result in a slow page load, high memory usage, and a large Supabase read.

**Recommendation:** Add server-side pagination (page param in query) with "Load more" or page navigation in the dashboard UI.

---

### UX-08: Bulk ZIP download loads all photos into browser memory

**File:** `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx:40`

The "Download All" feature fetches all photos in parallel via `Promise.all()`, stores them in browser memory, and then zips them client-side. For an event with 300 photos at ~500KB each, this is ~150MB in RAM before zip compression, likely crashing or freezing the browser tab.

**Recommendation:** Move ZIP generation server-side (streaming zip response), or paginate downloads in batches of 50.

---

## 6. Code Quality & Architecture

---

### CODE-01: `getKioskConfig()` is typed as synchronous but called asynchronously

**File:** `apps/frontend/src/types/global.d.ts:15`
**File:** `apps/frontend/src/contexts/EventConfigContext.tsx:51`

The global type declaration says `getKioskConfig(): KioskConfig` (synchronous return), but the implementation in `preload.ts` returns a `Promise` (invokes an async IPC call). The code works at runtime because it's called with `await`, but TypeScript believes it's synchronous and will not warn if `await` is accidentally dropped.

**Fix:** Update the type signature to `getKioskConfig(): Promise<KioskConfig>`.

---

### CODE-02: `useEffect` in index.tsx runs on every render (missing dependency array)

**File:** `apps/frontend/src/routes/index.tsx:16–18`

The `useEffect` that logs screen dimensions has no dependency array:

```ts
useEffect(() => {
  console.log('Screen dimensions:', window.innerWidth, window.innerHeight)
})  // ← no []
```

This runs on every render cycle. It's harmless (just logging) but is a pattern that will cause bugs if the effect is ever expanded to do real work.

**Fix:** Add `[]` as the dependency array.

---

### CODE-03: `SUPABASE_BUCKET` constant duplicated across multiple files

**Files:** `apps/frontend/src/routes/result.tsx:22`, `apps/web/src/routes/api.ai-generate.ts`, `apps/web/src/repositories/user.repository.ts`

The string `'photobooth-bucket'` appears in at least three separate files. A bucket rename would require finding and updating all three.

**Fix:** Define `SUPABASE_BUCKET` in a shared constants file per workspace and import from it.

---

### CODE-04: SQLite `JSON.parse` calls have no error handling

**File:** `apps/frontend/src/database/sqlite.ts:77–78`

```ts
selected_theme: JSON.parse(row.selected_theme as string),
user_info: JSON.parse(row.user_info as string),
```

If either column contains corrupted or truncated JSON (e.g., from a crash mid-write), `JSON.parse` throws synchronously and crashes the Electron renderer process. The admin `/data` view would be inaccessible.

**Fix:** Wrap in try/catch and return a sentinel value (or log and skip the row).

---

### CODE-05: `moduleFlow` is defined in `EventConfig` but never used

**File:** `apps/frontend/src/types/event-config.ts:4`
**File:** `apps/web/src/types/event-config.ts:4`

```ts
moduleFlow: Array<string> // stub — ordered list of step IDs
```

This is a stub for a future feature (configurable guest flow steps), but it is included in the seeded config, sent over the wire, and takes up space in every config object without doing anything.

**Note:** This is intentional scaffolding for a future phase. Leave as-is but document it here so it's tracked.

---

### CODE-06: `RacingTheme` type reference in `database.ts` may no longer be valid after Phase 3

**File:** `apps/frontend/src/utils/database.ts:1`

Phase 3 (TASK-3.1) removed the `RacingTheme` union type and replaced it with `string`. If `database.ts` still imports or references `RacingTheme`, it is either a dead import or a stale type cast.

**Action:** Verify this file and remove any lingering `RacingTheme` references.

---

### CODE-07: Email service is silently disabled

**File:** `apps/web/src/usecases/submit-photo.usecase.ts:46–56`

The email-sending call is entirely commented out. The success response still says "Photo uploaded and email sent successfully" (`api.photo.ts:122`), which is false. Guests expect to receive their photo by email.

**Fix (short-term):** Update the success message to "Photo saved successfully."
**Fix (long-term):** Re-enable email sending — the service and template are already built.

---

### CODE-08: Print handler hardcodes `"DS-RX1"` as fallback after Phase 3 supposedly removed it

**File:** `apps/frontend/src/main.ts:381`

```ts
deviceName: printerName ?? "DS-RX1",
```

Phase 3 (TASK-3.2) was supposed to move printer name into `EventConfig.techConfig`. The print handler does use the `printerName` variable (passed via IPC), which should come from config. But the `"DS-RX1"` fallback still exists here, meaning misconfigured events silently print to the wrong printer.

**Fix:** If `printerName` is empty or null, throw an error instead of silently falling back to the hardcoded name. The operator should be required to set a printer name in the config.

---

## 7. Performance & Scalability

---

### PERF-01: Session auth check hits Supabase on every dashboard navigation

**File:** `apps/web/src/routes/dashboard/_layout.tsx:10–16`

`getSession()` is a server function that calls `supabase.auth.getUser()` — a round-trip to Supabase — on every dashboard route load. With multiple operators using the dashboard simultaneously, this adds unnecessary latency on every page transition.

**Recommendation:** Cache the session in a short-lived server-side store (e.g., Cloudflare KV or an encrypted cookie with a 15-minute TTL), and only re-validate with Supabase on expiry.

---

### PERF-02: Event config fetched with no HTTP caching headers

**File:** `apps/web/src/routes/api.config.ts`

The `/api/config` endpoint returns no `Cache-Control` or `ETag` headers. Every kiosk session start triggers a fresh Supabase read. For a 1-minute inactivity loop with 10 kiosks, this generates ~600 Supabase reads per hour just for config.

**Recommendation:** Add `Cache-Control: max-age=60` or implement conditional GET with `ETag` based on `event_configs.updated_at`. The kiosk already has in-memory fallback for stale config, so a 60-second cache is safe.

---

### PERF-03: `getPublicUrl()` called in a loop per guest row

**File:** `apps/web/src/routes/dashboard/_layout.events.$eventId.guests.tsx:26–31`

```ts
return data.map((g) => {
  const photo_url = g.photo_path
    ? admin.storage.from('photobooth-bucket').getPublicUrl(g.photo_path).data.publicUrl
    : null
  return { ...g, photo_url }
})
```

`getPublicUrl()` is a synchronous client-side URL construction (no network call), but it is called inside a `.map()` on the server function's result set. For 500 guests this is 500 synchronous string operations in the server function. This is low impact today but worth noting.

---

## 8. Backlog Tasks

Tasks are ordered by priority. P0/P1 should be completed before or during Phase 5 work.

---

### ~~TASK-B.01 — Fix consent validation on form submit (P0, legal)~~ ✅

**What:** Check `isConsentChecked` before navigating from `/form` to `/loading`. If consent is required (`config.formFields.consent === true`) and unchecked, show a validation message and block navigation.

**Files:**
- `apps/frontend/src/routes/form.tsx`

**Risk:** Low — additive guard.

---

### ~~TASK-B.02 — Replace Google AI in-memory job store with Supabase table (P0, production blocker)~~ ✅

**What:** Create an `ai_jobs` table in Supabase. Replace `googleJobStore` Map with reads/writes to this table. `createGooglePrediction()` inserts a row; the background async process updates it; `getPredictionStatus()` reads from it.

**Files:**
- `apps/web/src/services/ai-generation.service.ts`
- Supabase migration SQL (new `ai_jobs` table)

**Schema:**
```sql
CREATE TABLE ai_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'processing', -- processing | succeeded | failed
  output TEXT,        -- base64 data URI
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Risk:** Medium — changes the AI generation path. The Replicate path is unaffected.

---

### ~~TASK-B.03 — Fix print race: wait for `did-finish-load` before printing (P0)~~ ✅

**What:** Replace the `setTimeout(500ms)` pre-print wait with a proper `webContents.did-finish-load` event listener. Use `webContents.on('after-print')` to close the window and clean up temp files instead of a fixed 1-second timeout.

**Files:**
- `apps/frontend/src/main.ts`

**Risk:** Low — improves reliability without changing the print flow.

---

### ~~TASK-B.04 — Move API client key out of Vite env into kiosk.config.json (P1, security)~~ ✅

**What:** The `apiClientKey` field already exists in `KioskConfig` (added in Phase 2). Update `result.tsx` to read `API_CLIENT_KEY` from `EventConfigContext` or `KioskConfig` IPC call rather than `import.meta.env.VITE_API_CLIENT_KEY`. Remove `VITE_API_CLIENT_KEY` from `apps/frontend/.env`.

**Files:**
- `apps/frontend/src/routes/result.tsx`
- `apps/frontend/src/contexts/EventConfigContext.tsx`
- `apps/frontend/.env`

**Risk:** Medium — changes how the key is accessed in the renderer; must verify IPC call is available at the point result.tsx runs.

---

### ~~TASK-B.05 — Add rate limiting to backend API endpoints (P1, security)~~ ✅

**What:** Configure Cloudflare rate limiting rules in `wrangler.jsonc` to limit:
- `/api/ai-generate`: max 5 req/min per IP
- `/api/photo`: max 10 req/min per IP
- `/api/config`: max 30 req/min per IP

**Files:**
- `apps/web/wrangler.jsonc`

**Risk:** Low — Cloudflare-side config change; does not affect code.

---

### ~~TASK-B.06 — Add validation to config editor before save (P1)~~ ✅

**What:** Before calling `saveEventConfig`, validate that:
- `primaryColor` and `secondaryColor` are valid hex color strings (`/^#[0-9a-fA-F]{6}$/`)
- `inactivityTimeoutSeconds` is an integer ≥ 10
- Canvas/photo dimensions are positive integers
- Theme labels and prompts are non-empty strings
- Image URLs are non-empty strings (optionally, valid `https://` URLs)

Show inline validation errors per field. Block the save if any field is invalid.

Add a "Discard changes" button that resets the form to the loaded state.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx`

**Risk:** Low.

---

### ~~TASK-B.07 — Fix misleading success message in `/api/photo` response (P1)~~ ✅

**What:** The response body says `"Photo uploaded and email sent successfully"` but email is disabled. Change it to `"Photo saved successfully"`.

**Files:**
- `apps/web/src/routes/api.photo.ts:122`

**Risk:** None.

---

### TASK-B.08 — Fix `getKioskConfig()` type signature (P2)

**What:** Update `global.d.ts` to declare `getKioskConfig(): Promise<KioskConfig>` instead of the current synchronous return type.

**Files:**
- `apps/frontend/src/types/global.d.ts`

**Risk:** None — pure type fix.

---

### TASK-B.09 — Add pagination to dashboard guest list and photo gallery (P2)

**What:** Add server-side pagination to both `getGuests()` and `getPhotos()` server functions. Pass `page` as a search param. Show "Page X of Y" navigation in both views.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.guests.tsx`
- `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx`

**Risk:** Low.

---

### TASK-B.10 — Move bulk ZIP generation server-side (P2)

**What:** Replace the client-side `JSZip` download with a server endpoint (`GET /api/dashboard/events/:eventId/photos.zip`) that streams a ZIP response. Use Supabase signed URLs + a streaming zip library in the Worker.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx`
- New route: `apps/web/src/routes/api.dashboard.events.$eventId.photos-zip.ts`

**Risk:** Medium — new backend work; requires streaming support in Cloudflare Workers (supported via `TransformStream`).

---

### TASK-B.11 — Enforce print only after Supabase upload confirms (P2)

**What:** In `result.tsx`, move `handlePrint()` to be called after the Supabase upload and `/api/photo` POST have both succeeded. Today it fires in parallel (`void handlePrint()` while upload runs). This ensures the photo path in the Supabase record matches the file being printed.

**Files:**
- `apps/frontend/src/routes/result.tsx`

**Risk:** Low — sequential instead of parallel. Increases result-page load time by the print delay, but ensures data consistency.

---

### TASK-B.12 — Add HTTP caching headers to `/api/config` (P2)

**What:** Return `Cache-Control: max-age=60, stale-while-revalidate=300` from the config endpoint. The kiosk already handles stale config gracefully.

**Files:**
- `apps/web/src/routes/api.config.ts`

**Risk:** None.

---

### TASK-B.13 — Add unique constraint to Supabase `users` table (P2)

**What:** Apply a unique index on `(email, event_id)` in Supabase. Update `user.repository.ts` to use upsert instead of insert, with conflict resolution on `(email, event_id)`.

**Files:**
- Supabase SQL migration
- `apps/web/src/repositories/user.repository.ts`

**Risk:** Low — additive index.

---

### TASK-B.14 — Re-enable email sending (P2)

**What:** Uncomment the email-sending block in `submit-photo.usecase.ts`. Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set in Cloudflare Workers secrets. Fix the attachment logic in `email.service.tsx` (currently passes a Supabase path as a file path, which is wrong — should pass the public URL or download the file first).

**Files:**
- `apps/web/src/usecases/submit-photo.usecase.ts`
- `apps/web/src/services/email.service.tsx`

**Risk:** Medium — touches the live email path; test with a real event config before enabling.

---

### ~~TASK-B.15 — Add empty-themes guard to select.tsx (P2)~~ ✅

**What:** If `config.aiConfig.themes.length === 0`, show an operator-visible error screen ("No themes configured for this event") instead of a blank button grid.

**Files:**
- `apps/frontend/src/routes/select.tsx`

**Risk:** None.

---

### TASK-B.16 — Add SQLite JSON.parse error handling (P3)

**What:** Wrap `JSON.parse(row.selected_theme)` and `JSON.parse(row.user_info)` in try/catch. On parse failure, log the corrupt row ID and return a sentinel value rather than crashing.

**Files:**
- `apps/frontend/src/database/sqlite.ts`

**Risk:** None.

---

### TASK-B.17 — Fix `useEffect` missing dependency array in index.tsx (P3)

**What:** Add `[]` as the second argument to the `useEffect` that logs screen dimensions.

**Files:**
- `apps/frontend/src/routes/index.tsx`

**Risk:** None.

---

### TASK-B.18 — Add "Last retake" warning on camera page (P3)

**What:** When `retakeCount === MAX_RETAKE_COUNT - 1`, display a warning below the retake button: "This is your last retake."

**Files:**
- `apps/frontend/src/routes/camera.tsx`

**Risk:** None.

---

### TASK-B.22 — Replicate transient "failed" status causes premature abort (P1, production bug)

**Root cause:** Replicate sometimes briefly reports a prediction as `status: "failed"` before its infrastructure retries it internally. The prediction ultimately succeeds, but our polling loop treats the first `"failed"` as final and aborts immediately.

**Observed behavior:**
- Both prediction IDs (`5asw88mdqdrmt0cx9ktsnrmnsm`, `vf7jwqa8k1rmy0cx9kybq16b8c`) confirmed `succeeded` in the Replicate dashboard with valid output URLs
- The app reported failure on Poll #1 (at T+2.5s) — before Replicate even completed (took 13–22s)
- The status endpoint also deletes the Supabase temp file on first `"failed"`, which is irreversible

**Fix — two parts:**

1. **Status endpoint** (`api.ai-generate-status.ts`): don't delete the temp file or return a definitive failure on the first `"failed"` status. Instead, pass the status through to the frontend and let the frontend accumulate consecutive failures before giving up. Or: only treat `"failed"` as final if `error !== null` in the Replicate prediction object.

2. **Frontend** (`AiGenerationModule.tsx`): add a consecutive-failure counter. Only throw after N consecutive `"failed"` statuses (e.g. 3), treating isolated `"failed"` polls as transient.

**Files:**
- `apps/web/src/routes/api.ai-generate-status.ts:59–68`
- `apps/frontend/src/modules/AiGenerationModule.tsx` (polling loop)

**Risk:** Low — the happy path is unchanged. Failed predictions that genuinely fail will still be caught after N retries.

---

### TASK-B.21 — Surface Replicate failure reason to the client (P2)

**What:** When Replicate reports `status: "failed"`, the backend logs the prediction `output` (which contains the model's error detail) but returns only a generic `{ error: "AI generation failed" }` to the frontend. The frontend then throws `Error: AI generation failed` with no actionable detail.

Two changes needed:
1. **Backend** (`api.ai-generate-status.ts`): include the Replicate error output in the response body — e.g. `{ status: 'failed', error: 'AI generation failed', detail: output }`
2. **Frontend** (`AiGenerationModule.tsx`): log the `detail` field to the console so it's visible without opening the Replicate dashboard, and optionally surface a short reason to the error UI

**Files:**
- `apps/web/src/routes/api.ai-generate-status.ts:59–68`
- `apps/frontend/src/modules/AiGenerationModule.tsx` (error handling block)

**Risk:** None — additive logging only; no change to the happy path.

---

### TASK-B.20 — Validate theme name early in `/api/ai-generate` (P2)

**What:** Before uploading the user photo or calling the AI provider, check that the requested theme has a configured template URL and prompt. If not, return a `400` immediately with a clear error message instead of letting the AI provider receive a bad or missing URL and return an opaque failure.

The check should also be done in the frontend `AiGenerationModule` — if the theme string is not in the event config's `aiConfig.themes`, show an operator-visible error before making any network call.

**Files:**
- `apps/web/src/routes/api.ai-generate.ts` — add guard before Supabase upload
- `apps/frontend/src/modules/AiGenerationModule.tsx` — add guard before fetch

**Risk:** None — purely additive validation; does not change the happy path.

---

### TASK-B.19 — Centralize `SUPABASE_BUCKET` constant (P3)

**What:** Define `export const SUPABASE_BUCKET = 'photobooth-bucket'` in a shared constants file for the web app and import it in all files that currently hardcode the string.

**Files:**
- `apps/web/src/utils/constants.ts` (new)
- `apps/web/src/routes/api.ai-generate.ts`
- `apps/web/src/routes/api.ai-generate-status.ts`
- `apps/web/src/repositories/user.repository.ts`

**Risk:** None — pure refactor.

---

## 9. Summary Table

| ID | Title | Priority | Phase |
|----|-------|----------|-------|
| RISK-01 | Google AI job store breaks on Cloudflare Workers | P0 | ✅ Done (TASK-B.02) |
| RISK-02 | Partial save has no recovery path | P0 | Phase 6 (existing) |
| RISK-03 | Print timing race condition | P0 | ✅ Done (TASK-B.03) |
| SEC-01 | API client key exposed in frontend bundle | P1 | ✅ Done (TASK-B.04) |
| SEC-02 | Dashboard login leaks Supabase error messages | P2 | Backlog |
| SEC-03 | Name sanitization too narrow | P2 | Backlog |
| SEC-04 | No rate limiting on API endpoints | P1 | ✅ Done (TASK-B.05) |
| DATA-01 | Consent not enforced on form submit | P0 | ✅ Done (TASK-B.01) |
| DATA-02 | `hasSaved` flag doesn't survive navigation | P2 | Backlog |
| DATA-03 | No unique constraint on users table | P2 | Backlog |
| DATA-04 | Supabase temp photo orphaned on failed prediction | P2 | Backlog |
| UX-01 | No save progress feedback on result page | P2 | Backlog |
| UX-02 | Inactivity fires mid-generation on short timeout | P2 | Backlog |
| UX-03 | Blank screen if themes array is empty | P2 | ✅ Done (TASK-B.15) |
| UX-04 | No "last retake" warning on camera page | P3 | Backlog |
| UX-05 | Config editor has no undo / revert | P2 | ✅ Done (TASK-B.06) |
| UX-06 | Config editor accepts invalid numeric values | P1 | ✅ Done (TASK-B.06) |
| UX-07 | No pagination on guest list and photo gallery | P2 | Backlog |
| UX-08 | Bulk ZIP crashes browser on large events | P2 | Backlog |
| CODE-01 | `getKioskConfig()` typed as sync, called as async | P2 | Backlog |
| CODE-02 | `useEffect` missing `[]` in index.tsx | P3 | Backlog |
| CODE-03 | `SUPABASE_BUCKET` constant duplicated | P3 | Backlog |
| CODE-04 | SQLite `JSON.parse` has no error handling | P2 | Backlog |
| CODE-05 | `moduleFlow` unused (intentional stub) | — | Future phase |
| CODE-06 | `RacingTheme` reference may be stale after Phase 3 | P2 | Verify |
| CODE-07 | Email silently disabled; success message is misleading | P1 | ✅ Done (TASK-B.07) |
| CODE-08 | `"DS-RX1"` fallback printer still hardcoded | P2 | Backlog |
| PERF-01 | Session auth hits Supabase on every dashboard nav | P2 | Backlog |
| PERF-02 | Config endpoint has no HTTP caching | P2 | Backlog |
| PERF-03 | `getPublicUrl()` in guest list map (minor) | P3 | Backlog |
| NEW-01 | No early validation of theme name in `/api/ai-generate` | P2 | Backlog (TASK-B.20) |
| NEW-02 | Replicate failure reason swallowed — client sees only generic error | P2 | Backlog (TASK-B.21) |
| NEW-03 | Replicate transient "failed" status causes premature abort | P1 | Backlog (TASK-B.22) |

---

## 10. Recommended Pre-Phase 5 Checklist

Before starting Phase 5 (Guest Portal), the following items should be resolved, as Phase 5 builds directly on the data and API layers analyzed above:

- [x] **TASK-B.01** — Consent validation (legal requirement) ✅
- [x] **TASK-B.02** — Google AI job store (breaks production if Google is the provider) ✅
- [x] **TASK-B.03** — Print timing race (blank prints at events) ✅
- [x] **TASK-B.04** — Move API key out of Vite env ✅
- [x] **TASK-B.05** — Rate limiting on API endpoints ✅
- [x] **TASK-B.06** — Config editor validation + discard button ✅
- [x] **TASK-B.07** — Fix misleading "email sent" message ✅
- [x] **UX-03 / TASK-B.15** — Empty themes guard in select.tsx ✅

**All pre-Phase 5 items completed 2026-03-31.**
