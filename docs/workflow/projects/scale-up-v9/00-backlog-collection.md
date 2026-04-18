# scale-up-v8 — Backlog Collection

**Status:** Pre-planning — collecting holes and improvement areas only. No scope decisions made yet.
**Collected:** 2026-04-17
**Sources:** V4–V7 "What This Project Does NOT Cover" sections, MASTER-PLAN.md V8 note, code TODOs, and TASK-6.1 investigation findings.

---

---

---

---

### BACKLOG-P2 — Wire or remove `guestPortalEnabled` flag

**Origin:** V7 TASK-6.1 investigation
**What:** `TechConfig.guestPortalEnabled` is stored in `event_configs` and has a dashboard checkbox (`_layout.events.$eventId.config.tsx:446`), but it is **never read by the kiosk**. QR visibility is independently controlled by `ResultModuleConfig.qrCodeEnabled`. The flag is dead — it has no effect. Decision needed: wire it to gate the QR feature (replacing or complementing `qrCodeEnabled`), or remove it entirely.
**Deferred because:** Architectural decision deferred to V8.

---

### BACKLOG-P3 — Session crash recovery

**Origin:** V4/V5/V6/V7 scopes (recurring deferral)
**What:** If the kiosk crashes mid-session, the guest loses all progress. Session state should be persisted locally (SQLite) so a crash mid-flow is recoverable — the guest can resume from the last completed module step. Currently sessions are tracked in Supabase (`sessions` table) but local SQLite only stores final `photo_results`.
**Deferred because:** Requires significant pipeline and local DB changes. Kept deferring as lower priority than active features.

---

### BACKLOG-P4 — QR kiosk pairing (replace PIN-based event ID entry)

**Origin:** V4/V5 scopes
**What:** Currently the kiosk is paired to an event by manually entering an event ID through a PIN-gated settings screen. A QR pairing flow would let the dashboard generate a QR code per event; the operator scans it with the kiosk to pair automatically — no manual ID entry.
**Deferred because:** PIN-based settings screen delivered in V4 was sufficient for current operator use. QR pairing is a UX improvement, not a blocker.

---

### BACKLOG-P5 — SQLite offline sync-back to Supabase

**Origin:** V4/V5 scopes (GAP-05)
**What:** When the kiosk loses internet during a session, results are saved to local SQLite only. There is no mechanism to sync those orphaned SQLite rows back to Supabase when connectivity is restored. Supabase is the source of truth, so unsynced local records represent a data gap.
**Deferred because:** Complexity. Partial session saves are allowed (offline-first constraint), but recovery is still manual.

---

## 2. Multi-Tenant & Client Access

### BACKLOG-M1 — Client account management + client dashboard login

**Origin:** MASTER-PLAN.md V8 note, V4/V5/V6/V7 scopes (CLIENT-01)
**What:** Add per-client authentication so brand clients can log into the dashboard with their own credentials and see only their org's events and data. Currently the dashboard is internal-operator-only (no auth, no access boundaries).
**Deferred because:** Requires auth layer (Supabase Auth or similar), RLS policy updates, and a full login/session UI. Major scope.

---

### BACKLOG-M2 — Per-org API key isolation

**Origin:** V5 scope
**What:** Currently all kiosks use the same `API_CLIENT_KEY`. In a true multi-tenant setup, each org (or each event) should have its own API key so a compromised key for one client doesn't expose other clients.
**Deferred because:** Requires backend auth refactor and kiosk config updates.

---

### BACKLOG-M3 — Nested org routing

**Origin:** V5/V6 scopes
**What:** Dashboard URLs are currently flat: `/dashboard/events/:eventId/...`. In a multi-client setup, routing should be org-scoped: `/dashboard/orgs/:orgId/events/:eventId/...`. This creates proper URL structure for per-org access control.
**Deferred because:** Requires updating every dashboard link, breadcrumb, and `useParams` call. High churn, low current priority.

---

---

---

### BACKLOG-F2 — Config version history + rollback

**Origin:** V4/V5/V6/V7 scopes (CARRY-02)
**What:** Every save to `event_configs` overwrites the previous config with no history. Operators should be able to view past config versions and roll back to a prior state.
**Deferred because:** Requires a `event_config_history` table or equivalent versioning mechanism.

---

### BACKLOG-F3 — Automated reporting + scheduled email delivery

**Origin:** V4/V5/V6/V7 scopes (REPORT-01)
**What:** Send daily or per-event reports to clients automatically (guest count, photo count, etc.) via scheduled email. Currently reporting is manual dashboard access only.
**Deferred because:** Requires a scheduler (Cloudflare Cron Triggers or similar) and report templating.

---

## 4. Dashboard Gaps

### BACKLOG-D1 — Operator error dashboard

**Origin:** V4/V5 scopes (GAP-03)
**What:** No visibility into kiosk errors from the dashboard. When a kiosk encounters a runtime error (AI generation failure, print error, etc.), there is no log or alert surface for the operator.
**Deferred because:** Needs error reporting infrastructure (Sentry is already integrated, but a dashboard view of errors is not).

---

### BACKLOG-D2 — Event status backend enforcement

**Origin:** V7 scope (explicitly removed status display from frontend; column kept but not enforced)
**What:** The `events.status` column (`draft` / `active`) exists in the DB but is not enforced by any backend logic. Config is served regardless of status. If enforcement is ever needed (e.g. block a `draft` event from serving config to a kiosk), this needs gating logic in the config endpoint.
**Deferred because:** No current use case requires it. ARCH-01 in V7 scoped this out deliberately.

---

## 5. Guest Experience & Kiosk Enhancements

### BACKLOG-G1 — Guest portal V2 (social share, multiple result items)

**Origin:** V4/V5 scopes
**What:** Current guest portal (`/result/:sessionId`) shows a single photo with a download button. V2 could add social share links (Instagram, WhatsApp), display multiple results per session, or allow re-download by email.
**Deferred because:** No pressing client requirement yet.

---

### BACKLOG-G2 — Form field builder (custom fields)

**Origin:** V4/V5 scopes
**What:** The Form module is limited to name, email, phone, and consent — togglable but not extensible. Operators can't add custom fields (e.g. "What's your team?", "Favourite driver?"). A form field builder in the flow builder would allow custom field definitions.
**Deferred because:** Requires type changes, kiosk rendering changes, and dashboard UI. Significant scope.

---

### BACKLOG-G3 — Per-module layout template selection

**Origin:** V4 scope (CUSTOM-03), recurring
**What:** Each module has a single hardcoded layout. A template selector would let operators pick from predefined layout variations per module (e.g. full-bleed photo vs. side-by-side).
**Deferred because:** High design complexity. Deferred multiple times.

---

### BACKLOG-G4 — Visual CSS builder in dashboard

**Origin:** V4 scope (noted as explicit non-goal)
**What:** Currently per-module CSS customization uses raw textarea inputs (any valid CSS). A visual CSS builder with element pickers, color selectors, and live preview would lower the barrier for non-technical operators.
**Deferred because:** High implementation complexity; raw textarea approach works for current technical users.

---

## 6. Electron Auto-Update (Parked)

### BACKLOG-AU — Electron auto-update

**Origin:** V4 Phase 7 — parked at `docs/workflow/projects/[parked]-auto-update/01-plan.md`
**What:** Kiosk auto-update via Supabase S3 static storage. Full architecture (AU-1, AU-2, AU-3) is documented in the parked plan.
**Blocked by:** Windows EV/OV code signing certificate (business decision, ~$300–500/year, 3–10 business day verification). Cannot unblock with code changes alone.
**Unblock condition:** Certificate obtained + `pnpm fe make` produces a signed Windows installer.

---

## 7. Code Tech Debt

### BACKLOG-T3 — Orphaned Supabase photo file when guest retries AI generation

**Origin:** V8 planning (noted in TASK-3.2 design notes)
**What:** When a guest retries AI generation from the result screen, `ResultModule` remounts as a new component instance. `photoUuid` is a `useMemo(() => crypto.randomUUID(), [])` — it regenerates on remount, producing a new filename. The retry therefore uploads a second photo file to Supabase Storage under a different name. The original file from the first generation attempt is never deleted. Over time, retried sessions leave orphaned files in `events/{eventId}/photos/`.
**Impact:** Storage bloat. No functional impact on the current session or the guest portal. The session's `photo_path` on the `sessions` row is updated to the latest file (via `PATCH /api/session/photo`), so the guest portal always shows the correct photo.
**Fix options:** (a) Derive `photoUuid` from `sessionId` (stable across remounts, always the same per session), which would cause the upsert to overwrite the old file rather than create a new one. (b) Explicit cleanup: delete the previous file from Supabase before uploading the new one. Option (a) is simpler and has no side effects.
**Not in V8 because:** Discovered during task decomposition; low impact for the current scale. Worth fixing before retry becomes a high-frequency feature.

---

### BACKLOG-T1 — `renderer.tsx` TypeScript suppression

**Origin:** `apps/frontend/src/renderer.tsx:14`
**What:** `@ts-expect-error` suppresses a TypeScript error on the CSS import (`import "./index.css"`). The comment says "TODO: Fix ts error". Should be resolved properly (correct tsconfig `moduleResolution` or a `.d.ts` declaration for CSS files) rather than suppressed.
**Risk:** Low — suppression is harmless but noisy.

---

### BACKLOG-T2 — `supabase.ts` ESLint suppressions

**Origin:** `apps/frontend/src/utils/supabase.ts:3`
**What:** Two `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments suppress type errors on `import.meta.env` access. The comment says "TODO: Fix eslint". Should be resolved with a proper `ImportMeta` interface declaration (via `vite/client` types or a custom `env.d.ts`).
**Risk:** Low — suppressions work correctly.

---

## Summary Table


| ID         | Area         | Item                                            | Priority Signal                                |
| ---------- | ------------ | ----------------------------------------------- | ---------------------------------------------- |
| BACKLOG-P1 | Pipeline     | True retry-AI-gen (step-back)                   | ✅ Addressed in V8                              |
| BACKLOG-P2 | Pipeline     | Wire or remove `guestPortalEnabled`             | Dead code, decision needed                     |
| BACKLOG-P3 | Pipeline     | Session crash recovery                          | Recurring deferral (4+ versions)               |
| BACKLOG-P4 | Kiosk        | QR kiosk pairing                                | UX improvement, not a blocker                  |
| BACKLOG-P5 | Data         | SQLite offline sync-back                        | Recurring deferral                             |
| BACKLOG-P6 | Pipeline     | Duplicate module instances — undefined behavior | Design decision needed                         |
| BACKLOG-P7 | Pipeline     | Form re-entry on retry (form-after-AI-gen flow) | Accepted behavior, prereq: P3                  |
| BACKLOG-M1 | Multi-tenant | Client account + dashboard login                | Named in MASTER-PLAN V8                        |
| BACKLOG-M2 | Multi-tenant | Per-org API key isolation                       | Security, named in V5                          |
| BACKLOG-M3 | Multi-tenant | Nested org routing                              | Structural, low urgency                        |
| BACKLOG-F1 | Platform     | AI provider fallback chain                      | ✅ Partially addressed in V8 (CREATE step only) |
| BACKLOG-F2 | Platform     | Config version history                          | Recurring (CARRY-02)                           |
| BACKLOG-F3 | Platform     | Automated reporting                             | Recurring (REPORT-01)                          |
| BACKLOG-F4 | Platform     | Mid-generation polling fallback                 | V8 out-of-scope (complex)                      |
| BACKLOG-D1 | Dashboard    | Operator error dashboard                        | Recurring (GAP-03)                             |
| BACKLOG-D2 | Dashboard    | Event status enforcement                        | Deliberate deferral (ARCH-01)                  |
| BACKLOG-G1 | Guest UX     | Guest portal V2                                 | Nice-to-have                                   |
| BACKLOG-G2 | Guest UX     | Form field builder                              | Extensibility feature                          |
| BACKLOG-G3 | Guest UX     | Per-module layout templates                     | High complexity, low urgency                   |
| BACKLOG-G4 | Dashboard    | Visual CSS builder                              | High complexity, low urgency                   |
| BACKLOG-AU | Infra        | Electron auto-update                            | Parked — external blocker                      |
| BACKLOG-T1 | Tech debt    | `renderer.tsx` TS suppression                   | Low                                            |
| BACKLOG-T2 | Tech debt    | `supabase.ts` ESLint suppression                | Low                                            |
| BACKLOG-T3 | Tech debt    | Orphaned Supabase photo on AI gen retry         | Low — storage bloat, fix before retry scales   |


# scale-up-v6 — Backlog

**Purpose:** Issues and improvements carried over from V5, plus new items from creator feedback, triaged against V6 scope.

**Status:** Triaged 2026-04-13 against V6 scope decisions in `00-creator-feedback.md`.

---

## How to use this document

Each entry has:

- **ID** — reference for task decomposition
- **Category** — Security / Data / UX / Perf / Code / Scale / Ops / Resilience
- **Issue** — what the problem is
- **Context** — where it was found and why it matters
- **Suggested fix** — directional recommendation (not a spec)

---

## Part A — New Items for V6 (from creator feedback)

### BUG-01 — Config page returns 500 on any event created via the V5 New Event form

**Category:** Data / UX
**Issue:** Navigating to `/dashboard/events/:eventId/config` for an event created via the V5 New Event form throws a 500 error: "Cannot coerce the result to a single JSON object." The same error hits the flow builder (`/dashboard/events/:eventId/flow`).
**Context:** Root cause confirmed via codebase read. `createEvent` in `apps/web/src/routes/dashboard/_layout.index.tsx:43–59` inserts into `events` but never seeds a corresponding `event_configs` row. Both the config route and flow route call `.from('event_configs').select().eq('event_id', eventId).single()` — which returns PGRST116 (no rows) and throws. All events created before V5's New Event form had configs seeded via manual migration. This is a regression introduced in V5.
**Suggested fix:** In `createEvent`, after the successful `events` insert, also insert a minimal default `event_configs` row for the new event ID.

---

### BUG-02 — Existing events created via V5 form have no event_configs row (data repair needed)

**Category:** Data
**Issue:** Any event created via the V5 New Event form between V5 launch and BUG-01 fix will have no `event_configs` row. BUG-01 fixes new events going forward, but existing broken events need a repair migration.
**Context:** Identified as a consequence of BUG-01. Events with no `event_configs` row are unrecoverable from the dashboard without direct SQL access.
**Suggested fix:** Write a repair SQL migration that inserts a default `event_configs` row for any event that doesn't have one. Safe to run on a live database (uses `LEFT JOIN ... WHERE IS NULL` pattern).

---

### CUSTOM-04 — Theme-selection module shown even when only one theme is configured

**Category:** UX
**Issue:** When a `theme-selection` module is configured with exactly one theme, the kiosk still shows the theme selection screen — forcing the guest to tap a single option before proceeding. There is no user choice, so the screen is wasted friction.
**Context:** From creator feedback: "the most urgent one is to skip ai theme selection page when the theme is only one." `ThemeSelectionModuleConfig.themes` is an `Array<{ id, label, previewImageUrl }>`. The downstream module (`ai-generation`) needs `moduleOutputs.selectedTheme = { id, label }`, which is what `ThemeSelectionModule.handleSelectTheme` sets.
**Suggested fix:** In `PipelineRenderer.tsx`, when the current module is `theme-selection` and `themes.length === 1`, auto-advance with `{ selectedTheme: { id: themes[0].id, label: themes[0].label } }` via a `useEffect` — skipping the UI entirely. No config flag needed; this is always the correct behavior.

---

## Part B — Carried Over from V5 (explicitly deferred to V6+)

These items were deferred from V5. Subset relevant to V6 "multi-event seamlessness" goal listed here.


| ID        | Issue                                          | V6 decision                                          |
| --------- | ---------------------------------------------- | ---------------------------------------------------- |
| CARRY-02  | Config version history + rollback snapshots    | ⏸️ Defer to V7 — low urgency, no client accounts yet |
| GAP-03    | Operator-facing error dashboard                | ⏸️ Defer to V7                                       |
| CLIENT-01 | Client dashboard login + self-serve access     | ⏸️ Defer to V7                                       |
| REPORT-01 | Automated reporting + scheduled email delivery | ⏸️ Defer to V7 (depends on CLIENT-01)                |
| CARRY-01  | AI provider fallback chain                     | ⏸️ Defer to V7                                       |
| CUSTOM-03 | Per-module layout template selection           | ⏸️ Defer to V7 — complex UX                          |
| CSS-01    | Visual CSS builder in dashboard                | ⏸️ Defer to V7                                       |
| GUEST-01  | Guest portal V2                                | ⏸️ Defer to V7                                       |
| FIELD-01  | Form field builder                             | ⏸️ Defer to V7                                       |
| GAP-01    | Session crash recovery (SQLite mid-flow)       | ⏸️ Defer — still low urgency                         |
| GAP-05    | SQLite offline sync-back to Supabase           | ⏸️ Defer — depends on GAP-01                         |
| QR-01     | QR kiosk pairing                               | ⏸️ Defer — PIN screen sufficient                     |
| PERF-01   | `getSession()` JWT 1-hour revocation window    | ⏸️ Defer — low risk until client accounts exist      |


# scale-up-v5 — Backlog

**Purpose:** Issues and improvements carried over from V4, triaged against V5 scope.

**Status:** Triaged 2026-04-13 against V5 scope decisions in `00-creator-feedback.md`.

---

## How to use this document

Each entry has:

- **ID** — reference for task decomposition
- **Category** — Security / Data / UX / Perf / Code / Scale / Ops / Resilience
- **Issue** — what the problem is
- **Context** — where it was found and why it matters
- **Suggested fix** — directional recommendation (not a spec)

---

## Part A — New Items for V5

### ORG-01 — No organizations layer: events are flat with no client/brand grouping

**Category:** Data / Scale
**Issue:** All events exist in a single flat list with no concept of which client or brand they belong to. As the platform grows to serve multiple clients, there is no way to group events by client, isolate data per client, or scope future reporting per client.
**Context:** Core V5 scope. Current state: `events` table has no `organization_id`. All data queries are event-scoped but no org layer exists above events.
**Suggested fix:**

1. Create `organizations` table (`id`, `name`, `slug`, `created_at`)
2. Add `organization_id` FK to `events` (nullable → backfill → NOT NULL)
3. Seed a default "Shell" organization and assign all existing events to it
4. Add org management to the dashboard (list, create, edit)
5. Scope the events list in dashboard by organization

---

## Part B — Carried Over from V4

### OFFLINE-01 — `POST /api/session/start` fails hard when offline

**Category:** Resilience
**Issue:** When the kiosk starts a guest session, it POSTs to `/api/session/start` before allowing the guest to proceed. If the backend is unreachable (offline event venue, network blip), this call fails and the guest sees a hard error screen — the session cannot start at all.
**Context:** Deferred from V4. Identified in V3 backlog. File: `apps/frontend/src/components/PipelineRenderer.tsx` — the fetch is in a `useEffect` that gates session start on a successful API response.
**Suggested fix:** Wrap the `POST /api/session/start` fetch in a try-catch. On network failure, log the error and allow the session to proceed without a `sessionId`. The backend row will be missing for that session (acceptable — offline-first design) but the guest experience is uninterrupted.

---

### SCALE-02 — Photos page fetches all Storage metadata on every navigation

**Category:** Scale / Perf
**Issue:** The dashboard photos page calls `supabase.storage.from(bucket).list(folder)` with no limit, returning all file metadata for the event on every page load and navigation. At 100+ photos per event this is slow; at 1000+ it will hit Supabase Storage API limits.
**Context:** Deferred from V4. File: `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx` — `.list()` is called twice (once for metadata count, once for the visible page slice) but both calls fetch all files.
**Suggested fix:** Pass `{ limit, offset }` to `.list()` so only the current page's metadata is fetched. The total count can be derived from a separate lightweight `.list()` call with `{ limit: 1, offset: 0 }` or estimated from the first page response.

---

## Part C — Explicitly Deferred to V6+

These items were considered for V5 and rejected. They remain in the backlog for future planning.


| ID        | Issue                                                      | Reason deferred                                            |
| --------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| CLIENT-01 | Client dashboard login + self-serve access                 | Requires auth redesign + invite flow — V6 scope            |
| REPORT-01 | Automated reporting + scheduled email delivery             | Depends on client accounts — V6                            |
| CARRY-01  | AI provider fallback chain                                 | Architecture change to `ai_jobs` — V6                      |
| CARRY-02  | Config version history + rollback snapshots                | Low urgency while one operator manages all configs         |
| GAP-01    | Session crash recovery (SQLite mid-flow persistence)       | Deferred since V2; still low urgency                       |
| GAP-05    | SQLite offline sync-back to Supabase                       | Depends on GAP-01 design                                   |
| GAP-03    | Operator-facing error dashboard                            | V6 ops polish                                              |
| QR-01     | QR kiosk pairing                                           | Adds Electron scope; PIN screen (V4) is sufficient for now |
| CUSTOM-03 | Per-module layout template selection                       | Complex V6 UX work                                         |
| CSS-01    | Visual CSS builder in dashboard                            | V6 UX work                                                 |
| GUEST-01  | Guest portal V2 (social share, multiple result items)      | V6 product work                                            |
| FIELD-01  | Form field builder (custom fields beyond name/email/phone) | V6 product work                                            |
| PERF-01   | `getSession()` JWT 1-hour revocation window                | Low risk; acceptable until client accounts exist           |
| CODE-02   | Supabase Storage discriminated union lint note             | Doc-only; not a runtime issue                              |


