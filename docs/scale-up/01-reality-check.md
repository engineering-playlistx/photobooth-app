# Reality Check — What Will Break and Why

**Purpose:** Honest analysis of risks, hidden bugs, and real-world ops issues before any migration work begins.

---

## 1. Active Bugs in Production Right Now

These are not migration risks — they exist today and should be fixed immediately regardless of any scaling work.

### CRITICAL: SQLite table is dropped on every app restart

**File:** `apps/frontend/src/database/sqlite.ts:19`

```ts
db.exec("DROP TABLE IF EXISTS photo_results");
```

This line runs every time the Electron app starts. **All local SQLite records are destroyed on every restart.** Local data is not the primary source of truth (Supabase is), but the `/data` admin view and offline fallback are completely unreliable. This needs to be fixed before any migration — it will corrupt any new session/event model built on top of it.

**Fix:** Remove the `DROP TABLE` line. Use `CREATE TABLE IF NOT EXISTS` only.

---

### MEDIUM: `REPLICATE_API_KEY` is required even when using Google AI

**File:** `apps/web/src/services/ai-generation.service.ts:49–53`

```ts
const replicateApiKey = process.env.REPLICATE_API_KEY
if (!replicateApiKey) {
  throw new Error('REPLICATE_API_KEY environment variable is required')
}
this.replicate = new Replicate({ auth: replicateApiKey })
```

The constructor always initializes Replicate — even when `AI_PROVIDER === 'google'`. If the key is missing the service crashes on every request. A Cloudflare deployment that only uses Google AI still requires a dummy Replicate key.

---

### MEDIUM: Google AI job store is in-memory — ephemeral on Cloudflare Workers

**File:** `apps/web/src/services/ai-generation.service.ts:36–43`

```ts
// NOTE: This works for Node.js long-running servers. For Cloudflare Workers
// (stateless/ephemeral), replace with a persistent store
const googleJobStore = new Map<string, GoogleJobEntry>()
```

The comment already acknowledges this. In practice, the synchronous Google AI path (`generateGoogleAISync`) is currently used, so the job store is bypassed. But if ever reverted to async polling, the map will be gone between requests on Workers, causing infinite poll loops.

---

## 2. What Breaks When V1 Migration Begins

### Themes are hardcoded as TypeScript types throughout the frontend

The `RacingTheme` union type `"pitcrew" | "motogp" | "f1"` is baked into:
- `PhotoboothContext.tsx:4` — exported type used by all routes
- `loading.tsx:23` — `FRAME_MAP: Record<RacingTheme, string>`
- `select.tsx:7` — `THEME_IMAGES: Record<RacingTheme, string>`
- `ai-generation.service.ts:4` — backend service type
- `api.ai-generate.ts:10` — `VALID_THEMES` validation array

**Risk:** Moving to a config-driven theme list means this entire type system needs to change to `string` or a runtime-validated union. There is no "gradual" path — the theme type touches every route.

**Mitigation:** Replace the static type with `string` and validate at runtime. The V1 `EventConfig` defines the theme list — the kiosk renders whatever the config says.

---

### Frame overlay dimensions are hardcoded for current Shell event

**File:** `apps/frontend/src/routes/loading.tsx:17–27`

```ts
const PHOTO_WIDTH = 1004;
const PHOTO_HEIGHT = 1507;
const PHOTO_OFFSET_X = 0;
const PHOTO_OFFSET_Y = 0;
const canvasWidth = 1205;
const canvasHeight = 1920;
```

These pixel values are tuned for the current Shell racing frame assets. A different client with different frame artwork will produce misaligned composites. This needs to move into the theme/AI config in `EventConfig`.

---

### API credentials are read from Vite env at module level

**Files:** `loading.tsx:9–12`, `result.tsx:14–19`

```ts
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:3000";
const API_CLIENT_KEY = (import.meta as any).env?.VITE_API_CLIENT_KEY || "";
```

These are baked at build time. The V1 plan replaces these with `kiosk.config.json` read at runtime. Until that migration happens, changing the API URL requires a rebuild and redeploy of the Electron app — defeating the remote config goal.

---

### No concept of eventId anywhere in the frontend

The kiosk currently has no notion of "which event am I running." There is no `eventId` in any IPC call, SQLite record, or API request. Adding event-scoped config requires threading this ID through:
- The startup config fetch
- Every SQLite record
- Every Supabase upload path
- Every API call to the backend

This is the single largest structural change in V1 and touches every route.

---

### Supabase storage paths are not event-scoped

**File:** `apps/frontend/src/routes/result.tsx:21–22`

```ts
const SUPABASE_BUCKET = "photobooth-bucket";
const SUPABASE_FOLDER = "public";
```

All photos from all events land in `public/`. Mixing clients' photos in the same flat folder makes:
- Post-event data export error-prone (manual filtering needed)
- Per-client access controls impossible
- Bulk download script fragile (already relies on filename prefix)

**Migration target:** `events/<eventId>/photos/<filename>` — but this is a breaking change for existing photos already stored in `public/`.

---

### QR code points to raw Supabase URL — not a guest portal

**File:** `apps/frontend/src/routes/result.tsx:95–98`

```ts
const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath)
setQrUrl(data.publicUrl)
```

The QR code guests scan takes them directly to a Supabase storage URL (`https://<project>.supabase.co/storage/v1/object/public/...`). This:
- Is not branded
- Offers no download button in mobile browsers (just opens the raw image)
- Will break if the bucket becomes private
- Is not replaceable with a proper guest portal without a session model

---

### `AI_PROVIDER` is resolved at module load time

**File:** `apps/web/src/services/ai-generation.service.ts:23`

```ts
export const AI_PROVIDER = process.env.AI_PROVIDER || 'replicate'
```

This is a module-level constant. On Cloudflare Workers, modules are evaluated once per worker instance. Changing the provider requires a redeploy — it cannot be changed per-event via `EventConfig`. This is fine for V1 (global setting), but V2's per-event AI config will require the provider to be passed in at call time.

---

## 3. Real-World Ops Risks

### Risk: Kiosk has no recovery path if the backend is unreachable

Currently the kiosk calls `/api/ai-generate` and `/api/photo` during the guest flow. If the backend is down (network issue at the venue, Cloudflare outage):
- The loading page shows an error and offers "Try Again" and "Back to Home"
- No photo is generated; no data is saved to Supabase
- The SQLite record IS saved locally (after the result page loads), but the result page never loads if AI fails

**Gap:** There is no offline queue for Supabase uploads or API calls. If the venue has spotty Wi-Fi and AI generation fails mid-event, guests walk away with nothing.

**V1 mitigation to consider:** Separate the AI generation step (requires internet) from the data submission step (can be queued offline).

---

### Risk: Multiple kiosks at one event share no coordination

If two kiosks run simultaneously at the same event, both upload to `public/` with UUID-prefixed filenames. There is no collision risk in storage, but:
- The admin `/data` page shows SQLite records from **that kiosk only** — operators can't see the combined guest count across devices
- The bulk download script hits Supabase and gets all photos, but has no way to know which event or kiosk they came from
- If eventId is introduced in V1, this becomes manageable — but it needs to be added to every record from day one

---

### Risk: Inactivity timeout is not implemented

The design document specifies an inactivity timeout (N seconds → return to Welcome). This does **not exist** in the current code. At a live event, if a guest walks away mid-flow, the kiosk stays frozen on whatever screen they left it on, blocking the next guest. This is an ops gap that should be in V1.

---

### Risk: Printer name is hardcoded

**File:** `apps/frontend/src/main.ts:378`

```ts
deviceName: "DS-RX1",
```

If the operator brings a different printer, or the Windows device name differs from the exact string `"DS-RX1"`, silent print failures occur (no error surfaced to the guest, since print is fire-and-forget from the result page). Moving `printerName` into `techConfig` in `EventConfig` is a V1 requirement.

---

### Risk: Print is fire-and-forget with no confirmation

The `handlePrint` call in `result.tsx` runs silently. If the printer is offline or out of paper, the guest sees nothing — no feedback that printing failed. The print flow creates a temp HTML file, sends it to the printer, then closes the window 1 second later regardless of outcome. There is no success/failure signal back to the UI.

---

### Risk: No session-level data linking

Currently, a guest's data (name, email, phone, Supabase photo path, SQLite record, printed photo) is linked only by the UUID in the filename. If any step fails (Supabase upload error, SQLite error, API error), some pieces exist and others don't, with no way to detect or reconcile the inconsistency. A proper session model (V2) is the full fix, but even in V1 a `sessionId` threaded through all operations would help.

---

## 4. Summary Table

| Issue | Severity | Exists Now | Introduced by Migration |
|-------|----------|------------|------------------------|
| SQLite DROP TABLE on restart | Critical | Yes | No |
| Replicate key required for Google AI | Medium | Yes | No |
| Theme type hardcoded as TS union | High | Yes | Exposed by V1 |
| Frame dimensions hardcoded | High | Yes | Exposed by V1 |
| API URL baked at build time | High | Yes | Blocked by V1 |
| No eventId anywhere | High | Yes | Required for V1 |
| Storage paths not event-scoped | Medium | Yes | Required for V1 |
| QR → raw Supabase URL | Medium | Yes | Required for V1 |
| AI_PROVIDER is module-level const | Low | Yes | Required for V2 |
| No inactivity timeout | Medium | Yes | Should be V1 |
| Printer name hardcoded | Medium | Yes | Required for V1 |
| No offline queue for API calls | Medium | Yes | V2 consideration |
| No cross-kiosk guest count | Low | Yes | Fixed by eventId in V1 |
| Print fire-and-forget, no feedback | Low | Yes | V1 improvement |
