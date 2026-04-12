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

| ID | Issue | Reason deferred |
|----|-------|-----------------|
| CLIENT-01 | Client dashboard login + self-serve access | Requires auth redesign + invite flow — V6 scope |
| REPORT-01 | Automated reporting + scheduled email delivery | Depends on client accounts — V6 |
| CARRY-01 | AI provider fallback chain | Architecture change to `ai_jobs` — V6 |
| CARRY-02 | Config version history + rollback snapshots | Low urgency while one operator manages all configs |
| GAP-01 | Session crash recovery (SQLite mid-flow persistence) | Deferred since V2; still low urgency |
| GAP-05 | SQLite offline sync-back to Supabase | Depends on GAP-01 design |
| GAP-03 | Operator-facing error dashboard | V6 ops polish |
| QR-01 | QR kiosk pairing | Adds Electron scope; PIN screen (V4) is sufficient for now |
| CUSTOM-03 | Per-module layout template selection | Complex V6 UX work |
| CSS-01 | Visual CSS builder in dashboard | V6 UX work |
| GUEST-01 | Guest portal V2 (social share, multiple result items) | V6 product work |
| FIELD-01 | Form field builder (custom fields beyond name/email/phone) | V6 product work |
| PERF-01 | `getSession()` JWT 1-hour revocation window | Low risk; acceptable until client accounts exist |
| CODE-02 | Supabase Storage discriminated union lint note | Doc-only; not a runtime issue |
