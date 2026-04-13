# scale-up-v5 — Task Decomposition

**Project:** scale-up-v5
**Milestone:** V5 — Multi-Tenant Foundation (Organizations Layer)
**Status:** Complete ✅ (2026-04-13)

---

## Verified Facts

Facts confirmed by reading the codebase during planning — not inferred from filenames or prior docs.

| Fact | Source | Confirmed value |
|------|--------|-----------------|
| Events table name | `_layout.index.tsx` loader (`.from('events')`) | `events` |
| Dashboard data-fetch pattern | `_layout.index.tsx` | TanStack Start `createServerFn` — not bearer-auth API routes |
| Migration timestamp format | Latest migration file (`20260406000000_...`) | `YYYYMMDDHHMMSS` |
| Session start fetch location | `PipelineRenderer.tsx` line ~37 | `fetch(\`${apiBaseUrl}/api/session/start\`, ...)` inside `useEffect` |
| Photos `.list()` location | `_layout.events.$eventId.photos.tsx` lines 23–25, 65–67 | Two unbounded `.list()` calls, no `limit`/`offset` |
| Event creation UI | `_layout.index.tsx` (read fully) | Does not exist — no form, no server function, no "New Event" button |

---

## How to use this document

- Each task is executable in a single Claude Code session
- Start each session by stating which prior tasks are complete
- Mark tasks done by striking through the heading and adding ✅ when the verification passes

---

## Phase 1 — Schema Foundation

### ~~TASK-1.1 — Create `organizations` table migration~~ ✅

**What:** Write the SQL migration that creates the `organizations` table and commit it as a migration file.

**Input state:** V4 complete. No `organizations` table exists.

**Files to read first:**
- `apps/web/supabase/migrations/20260406000000_add_get_event_analytics_fn.sql` (for timestamp convention)

**Files to create:**
- `apps/web/supabase/migrations/20260413000000_create_organizations.sql`

**Migration content:**
```sql
CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,  -- URL-safe, e.g. "shell-racing"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Manual step (you do this):** Run the migration in the Supabase SQL editor.

**Verification:**
1. `SELECT * FROM organizations;` returns an empty table with the correct columns
2. `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'organizations';` shows all four columns

---

### ~~TASK-1.2 — Add `organization_id` to `events`, seed default org, backfill~~ ✅

**What:** Write the migration that adds `organization_id` FK to `events`, seeds a default "Shell" org, backfills all existing events, and sets the column NOT NULL.

**Input state:** TASK-1.1 complete and run in Supabase.

**Files to read first:**
- `apps/web/supabase/migrations/20260331000000_create_event_configs.sql` (for events table structure)

**Files to create:**
- `apps/web/supabase/migrations/20260413000001_add_organization_id_to_events.sql`

**Manual step (you do this):** Run the migration in the Supabase SQL editor.

**Verification:**
1. `SELECT COUNT(*) FROM events WHERE organization_id IS NULL;` → returns 0
2. `SELECT e.id, o.name FROM events e JOIN organizations o ON e.organization_id = o.id LIMIT 5;` → returns rows with "Shell"

---

### ~~TASK-1.3 — TypeScript types: `Organization` type~~ ✅

**What:** Add an `Organization` TypeScript type exported from `@photobooth/types`.

**Files created:**
- `packages/types/src/organization.ts`
- Updated `packages/types/src/index.ts`

**Verification:**
1. `npx eslint` on changed files — no new errors ✅

---

## Phase 2 — Backend: Organization Repository

### ~~TASK-2.1 — Create `OrganizationRepository`~~ ✅

**Files created:**
- `apps/web/src/repositories/organization.repository.ts`
- `apps/web/src/repositories/organization.repository.test.ts`

**Verification:**
1. `pnpm wb test` — 18 tests pass ✅

---

### ~~TASK-2.2 — Add org-scoped event fetching + org field to event creation~~ ✅

**Files changed:**
- `apps/web/src/routes/dashboard/_layout.index.tsx` — events now fetched with org join; `createEvent` server fn added with `organizationId` as required field

**Verification:**
1. TypeScript compiles with no new errors ✅
2. `npx eslint` on changed files — no new errors ✅

---

### TASK-2.3 — API: organizations CRUD endpoints

> **Superseded.** Dashboard uses `createServerFn` pattern (not bearer-auth API routes). Org CRUD was implemented as server functions directly in `_layout.organizations.tsx` and `_layout.index.tsx`. No separate API route file needed.

---

## Phase 3 — Dashboard: Organizations UI

### ~~TASK-3.1 — Organizations list page~~ ✅

**Files created:**
- `apps/web/src/routes/dashboard/_layout.organizations.tsx`

**Verification:**
1. Navigate to `/dashboard/organizations` — page loads ✅
2. Shell org appears in the list with event count ✅

---

### ~~TASK-3.2 — Create/edit organization form~~ ✅

Implemented inline in `_layout.organizations.tsx`.

**Verification:**
1. Fill name → slug auto-populates ✅
2. Submit → new org appears in list ✅
3. Duplicate slug → Supabase unique constraint returns error message ✅

---

### ~~TASK-3.3 — Events list grouped by org + org filter~~ ✅

**Files changed:**
- `apps/web/src/routes/dashboard/_layout.index.tsx`

**Verification:**
1. Events list shows org name badge on each row ✅
2. Selecting an org in the filter shows only that org's events ✅
3. "All organizations" shows all events ✅

---

### ~~TASK-3.4 — Event creation form~~ ✅

**Files changed:**
- `apps/web/src/routes/dashboard/_layout.index.tsx`

**Verification:**
1. "New Event" button visible ✅
2. Org dropdown populated ✅
3. Submit without org → validation error ✅
4. Submit with all fields → event created, appears in list with org badge ✅
5. "View →" on new event opens detail page without errors ✅

---

## Phase 4 — Resilience Fixes

### ~~TASK-4.1 — OFFLINE-01: fail-silently on `POST /api/session/start`~~ ✅

**Files changed:**
- `apps/frontend/src/components/PipelineRenderer.tsx`

**Verification (2026-04-13):**
1. Backend stopped → tap welcome screen → `ERR_CONNECTION_REFUSED` on session start ✅
2. Console: `Session start failed, proceeding offline: TypeError: Failed to fetch` ✅
3. Flow advanced to next screen — no error shown to guest ✅

---

### TASK-4.2 — SCALE-02: photos page pagination

> **Already done in V4.** The photos page (`_layout.events.$eventId.photos.tsx`) was found to already implement server-side pagination with `PAGE_SIZE = 48`, `page` search param, and previous/next controls. No changes needed.

---
