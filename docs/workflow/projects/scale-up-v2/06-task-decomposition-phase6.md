# Task Decomposition — V2 Phase 6 (V1 Carryover Closure)

**Status:** 🔜 In Progress
**Scope:** V2-Phase 6 — address all V1 carryover items from `02-backlog.md` Part A that were not resolved in Phases 1–5
**Depends on:** Phases 1–5 complete ✅

**Format per task:** What · Files · Input · Output · Verification · Risk
**Per-task workflow:** read → change → lint → test → commit → mark done (see CLAUDE.md)

---

## Goal

Close out all outstanding technical debt from V1. After Phase 6, the backlog's Part A section is fully resolved and the system is ready for new feature work in V3.

---

## Pre-work Note — Already Resolved

The following backlog items were found resolved before Phase 6 execution began:

| ID | Finding |
|----|---------|
| ~~V2-6.7~~ (TASK-B.08) | `getKioskConfig()` is already typed as `Promise<KioskConfig>` in `global.d.ts:15` and `preload.ts:106`. Type and implementation match. No action needed. |
| ~~V2-6.17~~ (CODE-06) | `RacingTheme` has zero references anywhere in `apps/frontend/src/`. Already cleaned up during V2 work. No action needed. |
| ~~V2-6.22~~ (QR-01) | `apps/web/src/routes/result.$sessionId.tsx` exists and is fully implemented — reads session from Supabase, shows guest photo with download button, uses `BrandingConfig`. No action needed. |

---

## Dependency Chain

```
V2-6.1 (login error)          — standalone
V2-6.2 (name sanitization)   — standalone
V2-6.3 (unique constraint)   — standalone
V2-6.4 (temp photo cleanup)  — standalone
V2-6.5 (save indicator)      — standalone
  ↓
V2-6.10 (print after save)   — depends on V2-6.5 (same file; V2-6.5 adds isSaving state V2-6.10 leverages)
V2-6.6 (DS-RX1 fallback)     — standalone
V2-6.8 (dashboard pagination) — standalone
V2-6.9 (server-side ZIP)      — standalone (but read V2-6.8 first for context)
V2-6.11 (Cache-Control)       — standalone
V2-6.12 (re-enable email)     — standalone
V2-6.13 (SQLite JSON.parse)   — standalone
V2-6.14 (last retake warning) — standalone
V2-6.15 (bucket constant)     — do last; touches many files; no other task adds new bucket usages
V2-6.16 (auth cache)          — standalone
V2-6.21 (AI error handling)   — standalone
```

---

## Tasks

---

### V2-6.1 — Dashboard login: map Supabase errors to generic message (SEC-02)

**What:**
The `signIn` server function in `login.tsx` returns `error.message` directly from Supabase (e.g. `"Email not confirmed"`, `"Invalid login credentials"`). These strings confirm account existence to an attacker. Replace with a single generic message.

1. In the `signIn` server function handler, change `if (error) return { error: error.message }` to `if (error) return { error: 'Incorrect email or password.' }`.
2. No other change needed — the error string is already rendered as-is by the `LoginPage` component.

**Files:**
- `apps/web/src/routes/dashboard/login.tsx`

**Input:** Current code at line 18: `if (error) return { error: error.message }`.

**Output:**
- Any Supabase auth error (wrong password, unconfirmed email, unknown account) shows exactly `"Incorrect email or password."` — no information about which field is wrong.
- Valid logins continue to work.

**Verification:**
- Layer 1: Lint the file — no new errors.
- Layer 3: Manually attempt login with a wrong password → confirm generic error message appears. Attempt with correct credentials → confirm redirect to `/dashboard`.

**Risk:** Trivial. Single string change. No logic change.

---

### V2-6.2 — Name sanitization: max length + control character filtering (SEC-03)

**What:**
`sanitizeName` in `api.photo.ts` only strips `<` and `>`. No maximum length guard and no control character filtering.

1. After stripping `<>`, also strip control characters: `.replace(/[\x00-\x1F\x7F]/g, '')`.
2. Truncate to 100 characters: `.slice(0, 100)`.
3. The existing `if (!sanitizedName)` check already handles the empty-after-sanitization case — no change needed there.

**Files:**
- `apps/web/src/routes/api.photo.ts`

**Input:** Current `sanitizeName` at lines 47–49:
```typescript
function sanitizeName(name: string): string {
  return name.trim().replace(/[<>]/g, '')
}
```

**Output:**
```typescript
function sanitizeName(name: string): string {
  return name.trim().replace(/[<>]/g, '').replace(/[\x00-\x1F\x7F]/g, '').slice(0, 100)
}
```

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 2: No dedicated test needed (pure string transform; no business logic branching).
- Layer 3: POST `/api/photo` with a 200-character name → confirm truncated to 100 in Supabase. POST with control characters in name → confirm they are stripped.

**Risk:** Low. Additive constraint only — valid names are unaffected.

---

### V2-6.3 — Unique constraint on `(email, event_id)` in `users` table (DATA-03)

**What:**
Duplicate guest records are possible if a guest submits twice (e.g., retries after a network error). Add a unique constraint and switch the repository to upsert.

1. **Supabase SQL migration** — run in the Supabase SQL editor:
   ```sql
   ALTER TABLE users
     ADD CONSTRAINT users_email_event_id_unique UNIQUE (email, event_id);
   ```
   Note: run this only after confirming no existing duplicate `(email, event_id)` pairs in the table. If duplicates exist, resolve them manually first.

2. **Repository change** — in `user.repository.ts`, change `.insert({...})` to `.upsert({...}, { onConflict: 'email,event_id' })`. The upsert updates `photo_path`, `selected_theme`, and `phone` on conflict — i.e. if the same guest submits again, their record is updated, not duplicated.

**Files:**
- Supabase SQL (direct migration — no migration file needed, one-time DDL)
- `apps/web/src/repositories/user.repository.ts`

**Input:**
- Current `createUser`: uses `.insert()` which throws on duplicate if constraint is added.
- No constraint currently on `users` table.

**Output:**
- `users_email_event_id_unique` constraint exists in Supabase.
- `createUser` uses `.upsert({ ...fields }, { onConflict: 'email,event_id' })`.
- Duplicate guest submission updates the existing record rather than creating a duplicate or throwing.

**Verification:**
- Layer 1: Lint `user.repository.ts` — no new errors.
- Layer 3: Submit a guest flow twice with the same email + event → confirm Supabase `users` table has one row (not two) and the second submission's data overwrites the first.

**Risk:** Medium. The SQL migration requires manual duplicate check first. Upsert semantics change: second submission overwrites first. This is intentional and acceptable — the last submission is the authoritative one.

---

### V2-6.4 — Clean up temp photo on Replicate prediction failure (DATA-04)

**What:**
In `api.ai-generate.ts`, when using the Replicate provider, a temp photo is uploaded to `photobooth-bucket/temp/` before calling `aiService.createPrediction()`. If `createPrediction` throws, `tempPath` is set but the catch block (line 293) never deletes it — the temp file leaks indefinitely.

1. In the `catch` block (after `console.error` at line 294), add a cleanup step:
   ```typescript
   if (tempPath) {
     const supabase = getSupabaseAdminClient()
     await supabase.storage.from(SUPABASE_BUCKET).remove([tempPath])
   }
   ```
2. `tempPath` is declared at line 153 and only set inside the Replicate branch (line 152). The cleanup runs only if `tempPath` is non-empty, so Google AI paths are unaffected.
3. Use `void` or `await` — use `await` since we're already in a catch block and cleanup failure should be logged, not swallowed.
4. Wrap the cleanup itself in a try/catch that logs but doesn't rethrow, so a cleanup failure doesn't shadow the original error.

**Files:**
- `apps/web/src/routes/api.ai-generate.ts`

**Input:** `catch` block at line 293 — currently only logs and returns a 500 error response.

**Output:**
- If `tempPath` is non-empty at catch time, Supabase `remove([tempPath])` is called before returning the error response.
- If Supabase removal fails, the failure is logged but the original error response is still returned.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 3: Hard to test in isolation without forcing a `createPrediction` failure. Acceptable to skip Layer 3 here — the logic is straightforward and the path is recoverable (orphaned temp files don't break anything, they just accumulate).

**Risk:** Low. Cleanup is additive. The only new risk is if the cleanup `await` causes unexpected delays — mitigated by wrapping in try/catch.

---

### V2-6.5 — Save progress indicator on result page (UX-01)

**What:**
`ResultModule` silently saves photo + user data in the background on mount. The guest has no indication of whether saving is complete, in-progress, or failed. Add a status indicator near the QR/button area.

1. Add `isSaving: boolean` state, initialized to `true`.
2. In `saveToDatabase()`:
   - Set `setIsSaving(true)` before the try block (it's already true from init, but explicit is cleaner).
   - Set `setIsSaving(false)` in the `finally` block (after success or failure).
3. Add a small status indicator in the JSX, rendered below the "Print & Download" button:
   - While `isSaving && !hasSaved.current`: show `"Saving your photo…"` in muted text.
   - When save completes (`!isSaving && hasSaved.current`): show `"✓ Saved"` or nothing.
   - If save failed (`!isSaving && !hasSaved.current`): the toast already handles this — no separate indicator needed.
4. Optionally: disable the "Print & Download" button while `isSaving` is true to prevent printing before `savedPhotoPath` is set. This feeds into V2-6.10.

**Files:**
- `apps/frontend/src/modules/ResultModule.tsx`

**Input:** `useEffect → saveToDatabase()` at line 165. The `hasSaved` ref is the only save state signal currently.

**Output:**
- `isSaving: boolean` state in `ResultModule`.
- Status indicator rendered in JSX while save is in progress or complete.
- (Optional, feeds V2-6.10): "Print & Download" button disabled while `isSaving`.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 3: Start a kiosk flow → reach result page → observe "Saving your photo…" briefly → confirm it resolves to "✓ Saved" (or disappears) after a few seconds.

**Risk:** Low. Display-only change (plus optional button disable). No logic change to the save path.

---

### V2-6.10 — Print only after save is confirmed (TASK-B.11)

**Depends on:** V2-6.5 (adds `isSaving` state and optionally disables the print button during save)

**What:**
In `handlePrintAndDownload`, `void handlePrint()` and `await uploadToSupabaseAndShowQR()` fire in parallel. `handlePrint` needs `savedPhotoPath` (set by the auto-save `useEffect` on mount). If the user taps "Print & Download" before the mount save finishes, `savedPhotoPath` is `null` and `handlePrint` shows an error toast.

1. Remove the `void handlePrint()` parallel call from `handlePrintAndDownload`.
2. Instead, wait for upload to succeed, then call print:
   ```typescript
   const handlePrintAndDownload = async () => {
     if (!finalPhoto) { addToast("Photo is missing.", "error"); return; }
     setIsProcessing(true);
     try {
       await uploadToSupabaseAndShowQR();
       await handlePrint();
     } finally {
       setIsProcessing(false);
     }
   };
   ```
3. If `savedPhotoPath` is still null when `handlePrint` runs (unlikely after V2-6.5 disables the button during save), the existing guard in `handlePrint` will show an error toast — this is acceptable behavior.

**Files:**
- `apps/frontend/src/modules/ResultModule.tsx`

**Input:** Current `handlePrintAndDownload` at lines 116–130 — fires print in parallel with upload.

**Output:**
- Print is called only after `uploadToSupabaseAndShowQR()` resolves successfully.
- If the upload fails, print is not attempted.
- `isProcessing` remains true until both upload and print complete.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 3: Run the kiosk flow to the result page → tap "Print & Download" → confirm the QR modal appears first (upload done), then print fires. Confirm no "Photo not saved yet" error toast.

**Risk:** Low. The only behavior change is that print now waits for upload. In the unlikely case upload is slow, print is also delayed — this is intentional.

---

### V2-6.6 — Throw error if `printerName` is empty (CODE-08)

**What:**
In `main.ts`, the `print-window` IPC handler uses `printerName ?? "DS-RX1"` as the device name (line 401). If `printerName` is not configured, it silently falls back to `"DS-RX1"`, which may not be the connected printer on other events' hardware, causing a silent print failure.

1. Remove the `?? "DS-RX1"` fallback.
2. Before attempting to print, check: `if (!printerName) { throw new Error("printerName is required but was not configured") }`.
3. The thrown error is caught by the `catch` block at line 418, which already returns `{ success: false }` and logs — so the error propagates correctly back to the caller (`usePrint` hook → `ResultModule` toast).

**Files:**
- `apps/frontend/src/main.ts`

**Input:** `deviceName: printerName ?? "DS-RX1"` at line 401.

**Output:**
- If `printerName` is undefined or empty, the print IPC handler throws, `handlePrint` in `ResultModule` catches it and shows an error toast.
- If `printerName` is set, behavior is unchanged.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 3: In dev mode (no printer configured), tap "Print & Download" → confirm an error toast appears instead of a silent failure. In prod/staging with a printer configured, confirm print still works.

**Risk:** Low. Makes a previously silent failure loud. Operators will see an error instead of a phantom print job — this is the desired behavior.

---

### V2-6.8 — Dashboard pagination for guest list and photo gallery (TASK-B.09)

**What:**
Both `guests.tsx` and `photos.tsx` load all records with no limit. At 300+ guests or photos, this will be slow or crash the browser tab.

**Guests page (`guests.tsx`):**
1. Accept a `page` search param via `Route.useSearch()` (default: `1`).
2. Pass `page` to the `getGuests` server function.
3. In `getGuests`, add `.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)` to the Supabase query. Use `PAGE_SIZE = 50`.
4. Return `{ guests, totalCount }` (use Supabase's `{ count: 'exact' }` option to get total).
5. Render "Previous / Next" pagination controls using the `totalCount`.

**Photos page (`photos.tsx`):**
1. Same pattern: `page` search param, `getPhotos` adds `.range()`, returns `{ photos, totalCount }`.
2. Use `PAGE_SIZE = 48` (grid-friendly: 4 columns × 12 rows).
3. Same "Previous / Next" controls.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.guests.tsx`
- `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx`

**Input:** Both server functions currently return all records with no pagination.

**Output:**
- Guests page shows 50 per page with Previous/Next controls. URL reflects `?page=N`.
- Photos page shows 48 per page with Previous/Next controls.
- Total count shown in page header: `Guests (247) — Page 2 of 5`.

**Verification:**
- Layer 1: Lint both files — no new errors.
- Layer 3: Navigate to guests page with 0, 1, and 50+ guests. Verify page controls appear only when needed. Verify URL param changes on navigation.

**Risk:** Medium. Router search param handling in TanStack Router requires `validateSearch` configuration — read the existing search param pattern in the codebase before implementing. Incorrect range params can cause Supabase to return empty arrays — test edge cases (last page, single page).

---

### V2-6.9 — Server-side photo ZIP download (TASK-B.10)

**What:**
`photos.tsx` fetches all photos to the browser and zips them client-side using `fflate`. At 300+ photos (~2MB each), this loads ~600MB into browser memory and causes crashes.

Move ZIP generation server-side:

1. Create a new server function `downloadPhotosZip({ eventId })` inside `photos.tsx` (or a new `createServerFn`). The server function:
   - Lists all files in `events/${eventId}/photos` from Supabase Storage.
   - Downloads each file as an `ArrayBuffer` (using `supabase.storage.from(...).download(path)`).
   - Zips all buffers using `import { zipSync } from 'fflate'` (already a dependency in `apps/web`).
   - Returns the zipped `Uint8Array` as a base64 string (server functions serialize as JSON).
2. On the client, `downloadPhotosZip` is called on button click. The response (base64 ZIP) is decoded with `atob()` and downloaded as a `Blob`.
3. Remove the existing `downloadAll` client function that fetches photos in the browser.

**Files:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx`

**Input:** Current `downloadAll` client function at lines 37–54 — fetches and zips in browser.

**Output:**
- Zipping happens server-side (Worker memory, not browser memory).
- Client receives a base64 ZIP, triggers download.
- The `zipping` state and button remain — only the implementation changes.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 3: Download all photos for an event with 10+ photos → confirm ZIP downloads correctly and contains all photos. Confirm no browser memory spike.

**Risk:** Medium. Cloudflare Workers have a 128MB memory limit — a ZIP of 300 × 2MB photos (~600MB) would exceed this. Scope this task to work up to ~50MB total (25 photos at ~2MB each). If the event has more photos, show a warning and fall back to individual downloads. Document the limit in a comment. Server-side `fflate` — confirm `fflate` is importable in the Workers runtime (it's a pure JS library, so it should be).

---

### V2-6.11 — Add `Cache-Control` to `/api/config` response (TASK-B.12)

**What:**
`api.config.ts` returns event config with no caching headers. The kiosk fetches config on every session start — with multiple simultaneous kiosks at an event, this hits Supabase repeatedly for the same data.

1. On the successful `json(data.config_json as EventConfig)` response, add a `Cache-Control` header:
   ```
   Cache-Control: max-age=60, stale-while-revalidate=300
   ```
2. Use TanStack Start's `json()` second argument for headers:
   ```typescript
   return json(data.config_json as EventConfig, {
     headers: { 'Cache-Control': 'max-age=60, stale-while-revalidate=300' }
   })
   ```
3. Do not add Cache-Control to error responses (401, 400, 404, 500) — only the 200 success path.

**Files:**
- `apps/web/src/routes/api.config.ts`

**Input:** Current `return json(data.config_json as EventConfig)` at line 58 (no headers).

**Output:**
- Successful config responses include `Cache-Control: max-age=60, stale-while-revalidate=300`.
- Config is served from CDN/browser cache for up to 60 seconds; stale config served for up to 5 minutes while revalidating.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 3: Fetch `GET /api/config?eventId=...` via curl or browser DevTools → confirm `Cache-Control` header present on 200 response. Confirm it is absent on 404 and 401 responses.

**Risk:** Low. Read-only header addition. The 60-second cache means config changes take up to 60 seconds to propagate to kiosks — acceptable given that operators save config via the dashboard, not in real-time.

---

### V2-6.12 — Re-enable email sending (TASK-B.14)

**What:**
Email sending in `submit-photo.usecase.ts` is commented out (lines 76–86). The `EmailService` is fully implemented (`sendPhotoEmail` in `email.service.tsx` with Resend + idempotency key). Re-enable it.

1. Uncomment the email block in `submit-photo.usecase.ts`.
2. Call `this.emailService.sendPhotoEmail({ recipientEmail: request.email, recipientName: request.name, photoUrl })` after session is completed.
3. Do not rethrow email failures — log them and continue. A failed email must not fail the overall request. Wrap in try/catch:
   ```typescript
   try {
     await this.emailService.sendPhotoEmail({ recipientEmail: request.email, recipientName: request.name, photoUrl })
   } catch (emailError) {
     console.error('Failed to send email:', emailError)
   }
   ```
4. `photoUrl` is already computed on line 50 (`supabase.storage.getPublicUrl(request.photoPath)`).
5. Verify `RESEND_API_KEY` is set in `apps/web/.env` and Cloudflare Workers secrets before testing in staging.

**Files:**
- `apps/web/src/usecases/submit-photo.usecase.ts`

**Input:** Commented-out email block at lines 76–86.

**Output:**
- After a successful session completion, `sendPhotoEmail` is called.
- Email is sent via Resend. If RESEND_API_KEY is missing, `EmailService` logs instead of sending (existing behavior in `email.service.tsx`).
- Email failures are caught and logged — the API response is still 200.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 3: Run a full kiosk flow → reach result page → confirm email is received at the submitted address. Check Resend dashboard for delivery status.

**Risk:** Low. The `EmailService` is already implemented and tested in isolation. The only risk is Resend API key not being set — mitigated by the existing null-guard in `EmailService` constructor.

---

### V2-6.13 — SQLite `JSON.parse` error handling (TASK-B.16)

**What:**
In `sqlite.ts`, `JSON.parse(r.selected_theme as string)` and `JSON.parse(r.user_info as string)` have no error handling. A corrupt or null value in the DB crashes the entire admin data view (`/data` route) for all records, not just the bad one.

Fix all three parse sites (in `getAllPhotoResultsFromSQLite` and `getPhotoResultByIdFromSQLite`):

```typescript
function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    console.warn('[sqlite] JSON.parse failed — returning fallback. Raw value:', json);
    return fallback;
  }
}
```

Then replace:
- `JSON.parse(r.selected_theme as string)` → `safeParse(r.selected_theme as string, { theme: '' })`
- `JSON.parse(r.user_info as string)` → `safeParse(r.user_info as string, { name: '', email: '', phone: '' })`

Use the same helper in both `getAllPhotoResultsFromSQLite` and `getPhotoResultByIdFromSQLite`.

**Files:**
- `apps/frontend/src/database/sqlite.ts`

**Input:** Bare `JSON.parse` calls at lines 83, 84, 104, 105.

**Output:**
- A corrupt or null DB row is returned with sentinel empty values instead of crashing.
- The admin data view continues to render all other rows even if one is corrupt.
- Corrupt rows are logged with a warning.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 2 (optional): If writing a unit test, mock the DB row with a corrupt JSON string and confirm the function returns the sentinel value without throwing.
- Layer 3: Manually insert a row with `selected_theme = 'not-valid-json'` via Electron's DevTools or SQLite editor → open `/data` route → confirm no crash.

**Risk:** Low. Additive guard. The sentinel values are empty strings — the admin view may show blank fields for corrupt rows, but this is better than a full crash.

---

### V2-6.14 — "Last retake" warning on camera page (TASK-B.18)

**What:**
`CameraModule` has no visual indicator when the user is on their last retake. If `maxRetakes = 2` and the user has already retaken once (`retakeCount === maxRetakes - 1`), the next retake locks them in — they should see a warning.

1. After a photo is captured and displayed, read `retakeCount` and `maxRetakes` from state/config.
2. If `retakeCount === maxRetakes - 1` (i.e. user is viewing their last retake opportunity), show a warning banner or text near the retake button: `"This is your last retake"`.
3. The warning should appear only when a photo has been captured (i.e. when the retake button is visible), not on the initial capture.
4. Read `CameraModule.tsx` fully before implementing to understand where the retake button is rendered and what `retakeCount`/`capturedPhotos` state looks like.

**Files:**
- `apps/frontend/src/modules/CameraModule.tsx`

**Input:** `retakeCount: number` state and `maxRetakes: number` from `config` — both already available.

**Output:**
- When `retakeCount === maxRetakes - 1` and a photo has been captured: a visible warning appears near the retake/accept UI.
- When `retakeCount < maxRetakes - 1`: no warning.
- When `maxRetakes === 0` (retakes disabled): warning is never shown.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 3: Configure an event with `maxRetakes: 2`. Take a photo → retake → confirm warning appears. Take the second photo → confirm warning disappears (now locked in, retake button hidden).

**Risk:** Low. Display-only. Read the full file first to understand the flow — camera state machine is somewhat complex (countdown, capture, retake loop).

---

### V2-6.15 — Extract `'photobooth-bucket'` to a shared constant (TASK-B.19)

**What:**
`'photobooth-bucket'` is hardcoded as a string literal in 7 files. If the bucket name changes, all 7 must be updated manually.

**Frontend (apps/frontend):**
1. Create `apps/frontend/src/utils/constants.ts`:
   ```typescript
   export const SUPABASE_BUCKET = 'photobooth-bucket'
   ```
2. In `apps/frontend/src/modules/ResultModule.tsx` — replace the local `const SUPABASE_BUCKET = 'photobooth-bucket'` with `import { SUPABASE_BUCKET } from '../utils/constants'`.

**Backend (apps/web):**
1. Create `apps/web/src/utils/constants.ts`:
   ```typescript
   export const SUPABASE_BUCKET = 'photobooth-bucket'
   ```
2. Replace the `const SUPABASE_BUCKET = 'photobooth-bucket'` local constants in:
   - `apps/web/src/usecases/submit-photo.usecase.ts`
   - `apps/web/src/routes/result.$sessionId.tsx`
   - `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx`
   - `apps/web/src/routes/dashboard/_layout.events.$eventId.guests.tsx`
   - `apps/web/src/routes/api.ai-generate.ts`
   - `apps/web/src/routes/api.ai-generate-status.ts`

**Files:**
- `apps/frontend/src/utils/constants.ts` (new)
- `apps/frontend/src/modules/ResultModule.tsx`
- `apps/web/src/utils/constants.ts` (new)
- 6 files in `apps/web/src/` listed above

**Input:** 7 files with `const SUPABASE_BUCKET = 'photobooth-bucket'` or inline `'photobooth-bucket'` string literals.

**Output:**
- Two `constants.ts` files (one per app).
- All 7 files import `SUPABASE_BUCKET` from their app's constants file.
- Zero inline `'photobooth-bucket'` string literals remaining.

**Verification:**
- Layer 1: Lint all changed files — no new errors.
- `grep -r "photobooth-bucket" apps/ --include="*.ts" --include="*.tsx"` → confirm only `constants.ts` files match.
- Layer 3: Run a full kiosk session → confirm photo uploads to Supabase correctly (bucket name still resolves).

**Risk:** Low. Mechanical rename. Run the grep verification to catch any missed occurrences.

---

### V2-6.16 — Dashboard auth: replace `getUser()` with `getSession()` (PERF-01)

**What:**
`_layout.tsx` and `login.tsx` both call `supabase.auth.getUser()` in server functions. `getUser()` makes a network round-trip to Supabase Auth on every call to validate the JWT. This fires on every dashboard page navigation (TanStack Router runs `beforeLoad` on every navigation). In production (Cloudflare Workers), this is a Supabase round-trip per navigation per user.

Replace `auth.getUser()` with `auth.getSession()` in both server functions. `getSession()` decodes and validates the JWT locally from the session cookie — no network call. The JWT is signed by Supabase and has its own expiry (typically 1 hour), so local validation is safe. The tradeoff is that a revoked session is not detected until JWT expiry — acceptable for an operator dashboard with low security risk.

1. In `_layout.tsx` `getSession` server function: change `supabase.auth.getUser()` → `supabase.auth.getSession()`. Change `const { data: { user } }` → `const { data: { session } }`. Return `{ user: session?.user ?? null }`.
2. In `login.tsx` `getSession` server function: same change. The `if (user) throw redirect(...)` guard is the only consumer — it only needs a truthy check, so `session?.user` works.
3. Do not change the `signIn` call — that should remain `signInWithPassword` which creates the session cookie.

**Files:**
- `apps/web/src/routes/dashboard/_layout.tsx`
- `apps/web/src/routes/dashboard/login.tsx`

**Input:**
- `_layout.tsx` line 13: `const { data: { user } } = await supabase.auth.getUser()`
- `login.tsx` line 10: `const { data: { user } } = await supabase.auth.getUser()`

**Output:**
- Both server functions use `getSession()` instead of `getUser()`.
- Dashboard navigation no longer makes a Supabase Auth network call per page.
- Authenticated users continue to be redirected to the dashboard; unauthenticated users to login.

**Verification:**
- Layer 1: Lint both files — no new errors.
- Layer 3: Log out → navigate to `/dashboard` → confirm redirect to login. Log in → confirm redirect to `/dashboard`. Navigate between dashboard pages → confirm no auth errors in the server logs.

**Risk:** Low–Medium. The `getSession()` approach is documented by Supabase as acceptable for server-side usage when reading from cookies. The risk is a 1-hour window where a revoked session still grants dashboard access — acceptable for this use case. If this becomes a concern later, add a scheduled `getUser()` validation (e.g., once per minute via a background interval in the layout loader).

---

### V2-6.21 — User-friendly error for AI provider 5xx failures (AI-01)

**What:**
When Google AI returns a 503 (high demand), the error propagates as a raw internal error string from the backend → kiosk shows the raw error message. Fix: detect provider-level 5xx errors and return a user-friendly message.

1. In `api.ai-generate.ts`, the Google AI synchronous path calls `aiService.generateGoogleAISync(...)`. If Google returns 503, it throws an error with a message containing the raw Google error string.
2. In the `catch` block (lines 293–300), before returning `{ error: error.message }`, check if the error message indicates a provider overload:
   ```typescript
   const isProviderOverload =
     error instanceof Error &&
     (error.message.includes('503') || error.message.toLowerCase().includes('overloaded') || error.message.toLowerCase().includes('high demand'))
   
   if (isProviderOverload) {
     return json({ error: 'AI service is temporarily unavailable due to high demand. Please try again in a moment.' }, { status: 503 })
   }
   ```
3. Read `apps/web/src/services/ai-generation.service.ts` first to understand what error shape `generateGoogleAISync` throws on a 503 — the check strings must match the actual error message format.

**Files:**
- `apps/web/src/routes/api.ai-generate.ts`
- Read-only: `apps/web/src/services/ai-generation.service.ts`

**Input:** `catch` block at line 293 — currently returns raw `error.message` for all errors.

**Output:**
- Google AI 503 / overload errors return HTTP 503 with a user-friendly message.
- All other errors continue to return HTTP 500 with `error.message`.
- Kiosk's `AiGenerationModule` shows the friendly message to the guest.

**Verification:**
- Layer 1: Lint — no new errors.
- Layer 3: Difficult to force a Google AI 503 in isolation. Acceptable to defer Layer 3 until it naturally occurs, or to test by temporarily throwing a mock 503 error in the service.

**Risk:** Low. The check strings must match what Google actually sends — read `ai-generation.service.ts` first to confirm. The worst case of a false negative (overload error not matching) is the same bad UX as today.

---

## Summary Table

| Task | What | Files | Depends On | Priority |
|------|------|-------|------------|----------|
| ~~V2-6.7~~ | ~~getKioskConfig type~~ | ~~global.d.ts~~ | — | ✅ Already done |
| ~~V2-6.17~~ | ~~RacingTheme stale ref~~ | ~~database.ts~~ | — | ✅ Already done |
| ~~V2-6.22~~ | ~~QR result page~~ | ~~result.$sessionId.tsx~~ | — | ✅ Already done |
| V2-6.1 | Login error message | `login.tsx` | — | P1 Security |
| V2-6.2 | Name sanitization | `api.photo.ts` | — | P1 Security |
| V2-6.3 | Unique constraint users | `user.repository.ts` + SQL | — | P2 Data |
| V2-6.4 | Temp photo cleanup | `api.ai-generate.ts` | — | P2 Data |
| V2-6.5 | Save indicator | `ResultModule.tsx` | — | P2 UX |
| V2-6.10 | Print after save | `ResultModule.tsx` | V2-6.5 | P2 Bug |
| V2-6.6 | DS-RX1 throw | `main.ts` | — | P2 Code |
| V2-6.11 | Cache-Control config | `api.config.ts` | — | P2 Perf |
| V2-6.21 | AI 503 friendly error | `api.ai-generate.ts` | — | P2 UX |
| V2-6.12 | Re-enable email | `submit-photo.usecase.ts` | — | P2 Feature |
| V2-6.13 | SQLite JSON.parse | `sqlite.ts` | — | P2 Code |
| V2-6.14 | Last retake warning | `CameraModule.tsx` | — | P3 UX |
| V2-6.15 | Bucket constant | 8 files (2 new) | — | P3 Code |
| V2-6.8 | Dashboard pagination | `guests.tsx`, `photos.tsx` | — | P3 Scale |
| V2-6.9 | Server-side ZIP | `photos.tsx` | — | P3 Scale |
| V2-6.16 | Auth cache | `_layout.tsx`, `login.tsx` | — | P3 Perf |

---

## Notes

- **Execution order:** Work top-to-bottom in the table above (P1 → P2 → P3). V2-6.10 must follow V2-6.5 since they both modify `ResultModule.tsx`. All other tasks are independent.
- **SQL migrations (V2-6.3):** Run in Supabase SQL editor. Check for existing duplicates before adding unique constraint — `SELECT email, event_id, COUNT(*) FROM users GROUP BY email, event_id HAVING COUNT(*) > 1`.
- **No new modules needed.** All tasks are fixes to existing code.
- **V2-6.9 scale limit:** Server-side ZIP is bounded by Cloudflare Worker memory (128MB). Document the limit; fall back to individual download for events with 50+ high-res photos.
- **After Phase 6:** The backlog's Part A is fully closed. Phase 7 (if any) is new product work from the `MASTER-PLAN.md` V3 roadmap.
