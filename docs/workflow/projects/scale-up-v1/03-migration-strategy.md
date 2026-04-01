# Migration Strategy — Current → V1 → V2

**Status: V1 COMPLETE ✅ — 2026-04-01**
Phases 0–5 shipped. Phase 6 (V2 Modular Pipeline) is out of scope for this project — tracked in [`scale-up-v2`](../scale-up-v2/).

---

## Guiding Principles

1. **Never break a live event.** Each phase must be independently deployable and backwards-compatible with the previous phase.
2. **Fix active bugs first.** The SQLite DROP TABLE bug is non-negotiable — fix it before any migration work.
3. **Config before UI.** Build the data model and API layer before building the dashboard UI. The kiosk can consume config from a JSON file or API endpoint — the UI to manage it comes later.
4. **Additive changes only** during V1. No renames, no schema drops, no removal of existing behavior. Only add.
5. **One kiosk update per phase.** Each phase produces exactly one new Electron build (or none at all if only the backend changed).

---

## Phase 0 — Hotfixes (Do Before Anything Else)

These are production bugs. They are not migration work. Fix them in a single PR before starting V1.

| Fix | File | What to do |
|-----|------|------------|
| Remove `DROP TABLE` on startup | `database/sqlite.ts:19` | Delete that line. Add migration guard if schema changes are needed. |
| Guard Replicate init when using Google AI | `ai-generation.service.ts:49–53` | Only initialize `Replicate` when `AI_PROVIDER === 'replicate'` |
| Add inactivity timeout to kiosk | New hook | Start with a configurable constant; make it config-driven in V1 |

**Go/no-go gate:** All three fixes deployed to production. No events scheduled during deploy.

---

## Phase 1 — Foundation: EventId + Session Tracking

**Goal:** Thread `eventId` through the entire system without changing any visible behavior. No UI changes. No dashboard. No config endpoint yet.

### What changes

**Backend:**
- Add `eventId` column to `users` table in Supabase (nullable, default null — backwards compatible with existing rows)
- `POST /api/photo` accepts optional `eventId` in the request body
- Add `events` table with minimal schema: `id, name, status, created_at`
- Manually insert the first event row in Supabase

**Frontend:**
- Read `VITE_EVENT_ID` from env (temporary — becomes `kiosk.config.json` in Phase 2)
- Pass `eventId` to `/api/photo`
- Save `eventId` in SQLite `photo_results` table (add nullable column)
- Upload photos to `events/<eventId>/photos/<filename>` in Supabase instead of `public/`

### What does NOT change
- All routes, UX, themes — identical
- No new API endpoints visible to the kiosk beyond the `eventId` field
- No dashboard
- QR still points to Supabase public URL

### Migration note for existing photos
Existing photos in `public/` are left in place. The new path applies only to new sessions. The download script will need to handle both path formats.

### Go/no-go gate
- New guest sessions have `eventId` in the SQLite record and Supabase `users` row
- Photos appear in `events/<eventId>/photos/` in Supabase Storage
- Old photos in `public/` still accessible
- Kiosk fully functional

---

## Phase 2 — Foundation: kiosk.config.json + Config Endpoint

**Goal:** The kiosk reads its configuration from a local JSON file and a remote API endpoint. No more env-based baked-in config.

### What changes

**Frontend:**
- Add a config loader that reads `kiosk.config.json` from the app data directory on startup
- `kiosk.config.json` schema: `{ "eventId": "...", "apiBaseUrl": "...", "apiClientKey": "..." }`
- Remove `VITE_API_BASE_URL`, `VITE_API_CLIENT_KEY`, `VITE_EVENT_ID` from env usage at runtime (keep for local dev only)
- Add `GET /api/config?eventId=<id>` call on startup → receive `EventConfig` JSON
- Store `EventConfig` in a React context (`EventConfigContext`) — all routes read from it
- Apply branding CSS custom properties from `EventConfig.branding` (even if just using existing Shell brand values)

**Backend:**
- Add `GET /api/config` endpoint — reads `event_configs` table by `eventId`
- Add `event_configs` table: `event_id, config_json, updated_at`
- Manually insert the first `event_config` row with current Shell config values (themes, prompts, template URLs, branding, printer name)
- Move `AI_PROVIDER`, `RACING_TEMPLATE_*_URL`, `RACING_PROMPT_*` from Cloudflare env into the `event_config` JSON

**Kiosk:**
- `kiosk.config.json` written once during setup by the operator
- Config is re-fetched at the start of each new guest session (tap "Start")

### What does NOT change
- All routes, UX, themes — identical
- Still hardcoded `RacingTheme` type in the frontend (removing it comes in Phase 3)
- No dashboard UI yet

### Risk
This is the highest-risk phase — it changes how the kiosk boots. A fallback is needed: if the config fetch fails, fall back to the last successfully fetched config (cached in memory or localStorage). If there is no cached config and the API is unreachable, show an error screen with a retry button (operator-facing, not guest-facing).

### Go/no-go gate
- Kiosk boots from `kiosk.config.json`
- Config is fetched from `/api/config` on startup and on each new guest session
- Changing a value in Supabase `event_configs` takes effect within one session cycle — no kiosk restart needed
- Full fallback to cached config if API is unreachable

---

## Phase 3 — Config-Driven Themes

**Goal:** Theme list, labels, images, frame URLs, canvas dimensions, and prompts all come from `EventConfig`. No hardcoded theme values remain in the frontend.

### What changes

**Frontend:**
- Remove `RacingTheme` union type — replace with `string`
- Remove `RACING_THEMES`, `THEME_IMAGES`, `FRAME_MAP` constants — replace with data from `EventConfig`
- Theme selection screen renders whatever themes are in `EventConfig.moduleFlow[themeSelection].themes`
- Frame overlay and canvas dimensions come from `EventConfig` per-theme config
- Loading slideshow images come from `EventConfig.branding`

**Backend:**
- `EventConfig` schema updated to include per-theme: `{ id, label, previewImageUrl, frameImageUrl, templateImageUrl, prompt, canvasWidth, canvasHeight, photoWidth, photoHeight, photoOffsetX, photoOffsetY }`
- `VALID_THEMES` in `api.ai-generate.ts` replaced with dynamic lookup from `EventConfig`

### What does NOT change
- Route structure, flow sequence
- Camera, form, result behavior

### Risk
Frame alignment is pixel-precise. The current `PHOTO_WIDTH = 1004` values were tuned manually. Moving them to config means an operator error (wrong value) produces a visibly broken composite. Add a validation step or preview tool before this goes to production.

### Go/no-go gate
- A new event with different theme names can be configured in Supabase without code changes
- Frame composite looks identical to today's output for the Shell event
- Can add or remove a theme without redeploying

---

## Phase 4 — Basic Dashboard

**Goal:** Operator can manage event config, view guests, and view photos via a web dashboard — without touching Supabase directly.

### What changes

**Backend (`apps/web`):**
- Add dashboard routes under `/dashboard/*`
- Authentication: simple session-based login for operator (no client access yet)
- Screens: Event list, Event detail (config editor), Guest list + CSV export, Photo gallery
- Config editor: edit the `event_configs` JSON via form UI (branding, AI config, themes, printer settings)
- Guest list: read from `users` table filtered by `eventId`

### What does NOT change
- Kiosk app — no new build required
- Guest-facing flow

### Go/no-go gate
- Operator can update branding or a theme prompt from the dashboard
- Change takes effect in the kiosk within one session cycle
- Guest list and photo gallery load correctly

---

## Phase 5 — Guest Portal

**Goal:** QR code points to a proper guest-facing web page, not raw Supabase storage URL.

### What changes

**Backend:**
- Add `sessions` table: `id, event_id, photo_path, user_info, created_at`
- `POST /api/photo` creates a `sessions` row and returns `sessionId`
- Add `GET /result/:sessionId` web page — server-rendered, shows photo + download button + event branding

**Frontend:**
- QR code URL changes from raw Supabase URL to `https://<domain>/result/<sessionId>`
- `sessionId` returned from `/api/photo` and stored locally

### Go/no-go gate
- QR scan on a mobile phone shows branded page with the guest's photo and a working download button
- Page works without any login

---

## Phase 6 — V2: Modular Pipeline

**Status: Out of scope for scale-up-v1. Tracked in [`scale-up-v2`](../scale-up-v2/).**

**Goal:** The kiosk renders its flow from the `moduleFlow` array in `EventConfig`. Modules are registered React components. Flow builder in dashboard.

This is a separate project (`scale-up-v2`). Refer to `docs/design/design-document.md` Section 9 for V2 technical scope and `docs/workflow/projects/scale-up-v2/01-scope.md` for the project plan.

---

## Phase Summary

| Phase | Focus | Kiosk Rebuild? | Backend Deploy? | Risk |
|-------|-------|---------------|----------------|------|
| 0 | Hotfixes | Yes | Yes | Low |
| 1 | EventId threading | Yes | Yes | Low |
| 2 | kiosk.config.json + config endpoint | Yes | Yes | High |
| 3 | Config-driven themes | Yes | Yes | Medium |
| 4 | Basic dashboard | No | Yes | Low |
| 5 | Guest portal | Yes | Yes | Medium |
| 6 | V2 modular system | Yes | Yes | High |

---

## Rollback Strategy

Each phase is designed so that rolling back means reverting the backend deploy and rebuilding the previous Electron version. To make this safe:

1. Every DB change is additive (new columns with defaults, new tables — never drops)
2. Every new API endpoint is additive (old endpoints stay unchanged)
3. The previous Electron build must be kept accessible until the new phase is confirmed stable

For Phase 2 (config endpoint), the fallback is the most important: if the config endpoint is unreachable, the kiosk must degrade gracefully, not crash.
