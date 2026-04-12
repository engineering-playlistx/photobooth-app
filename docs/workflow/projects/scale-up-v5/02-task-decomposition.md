# scale-up-v5 — Task Decomposition

**Project:** scale-up-v5
**Milestone:** V5 — Multi-Tenant Foundation (Organizations Layer)
**Status:** Planning 🔜

---

## How to use this document

- Each task is executable in a single Claude Code session
- Start each session by stating which prior tasks are complete
- Mark tasks done by striking through the heading and adding ✅ when the verification passes

---

## Phase 1 — Schema Foundation

### TASK-1.1 — Create `organizations` table migration

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
  slug       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Manual step (you do this):** Run the migration in the Supabase SQL editor.

**Verification:**
1. `SELECT * FROM organizations;` returns an empty table with the correct columns
2. `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'organizations';` shows all four columns

---

### TASK-1.2 — Add `organization_id` to `events`, seed default org, backfill

**What:** Write the migration that adds `organization_id` FK to `events`, seeds a default "Shell" org, backfills all existing events, and sets the column NOT NULL.

**Input state:** TASK-1.1 complete and run in Supabase.

**Files to read first:**
- `apps/web/supabase/migrations/20260331000000_create_event_configs.sql` (for events table structure)

**Files to read first:**
- `apps/web/supabase/migrations/20260331000000_create_event_configs.sql` — read to confirm the actual events table name before writing the migration (it may be `event_configs` or `events`)

**Files to create:**
- `apps/web/supabase/migrations/20260413000001_add_organization_id_to_events.sql`

**Migration content (substitute the correct table name confirmed above):**
```sql
-- Step 1: add nullable FK
ALTER TABLE event_configs  -- replace with actual table name if different
  ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Step 2: seed default org and backfill
-- CTE approach (preferred):
WITH inserted AS (
  INSERT INTO organizations (name, slug)
  VALUES ('Shell', 'shell-racing')
  RETURNING id
)
UPDATE event_configs
SET organization_id = inserted.id
FROM inserted
WHERE organization_id IS NULL;

-- Fallback if the CTE UPDATE doesn't work in the Supabase SQL editor:
-- INSERT INTO organizations (name, slug) VALUES ('Shell', 'shell-racing');
-- UPDATE event_configs SET organization_id = (SELECT id FROM organizations WHERE slug = 'shell-racing') WHERE organization_id IS NULL;

-- Step 3: enforce NOT NULL
ALTER TABLE event_configs
  ALTER COLUMN organization_id SET NOT NULL;
```

**Manual step (you do this):** Run the migration in the Supabase SQL editor. Use the CTE approach first; fall back to the two-statement approach if the SQL editor rejects it.

**Verification:**
1. `SELECT COUNT(*) FROM event_configs WHERE organization_id IS NULL;` → returns 0
2. `SELECT e.id, o.name FROM event_configs e JOIN organizations o ON e.organization_id = o.id LIMIT 5;` → returns rows with "Shell" (substitute correct table name)

---

### TASK-1.3 — TypeScript types: `Organization` type + update `EventConfig` type

**What:** Add an `Organization` TypeScript type and add `organizationId` to the existing `EventConfig` type used in the backend.

**Input state:** TASK-1.2 complete.

**Files to read first:**
- `apps/web/src/repositories/session.repository.ts` (for type pattern used in repositories)
- Search for where `EventConfig` or event types are defined in `apps/web/src/`

**Files to change:**
- Wherever the `EventConfig` backend type is defined — add `organizationId: string`
- Create or update a types file with:
```typescript
export interface Organization {
  id: string
  name: string
  slug: string
  createdAt: string
}
```

**Verification:**
1. `git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint` — no new errors
2. TypeScript compiles: `pnpm wb typecheck` (or equivalent) — no new type errors

---

## Phase 2 — Backend: Organization Repository

### TASK-2.1 — Create `OrganizationRepository`

**What:** Create `apps/web/src/repositories/organization.repository.ts` with CRUD methods.

**Input state:** TASK-1.3 complete.

**Files to read first:**
- `apps/web/src/repositories/session.repository.ts` (pattern to follow)
- `apps/web/src/utils/supabase-admin.ts`

**Files to create:**
- `apps/web/src/repositories/organization.repository.ts`

**Methods to implement:**
```typescript
class OrganizationRepository {
  async findAll(): Promise<Organization[]>
  async findById(id: string): Promise<Organization | null>
  async create(data: { name: string; slug: string }): Promise<Organization>
  async update(id: string, data: { name?: string; slug?: string }): Promise<Organization>
}
```

**Files to create (tests):**
- `apps/web/src/repositories/organization.repository.test.ts`

**Test cases:** `findAll` returns array, `create` inserts and returns, `findById` returns null when not found.

**Verification:**
1. `pnpm wb test` — all tests pass
2. `npx eslint apps/web/src/repositories/organization.repository.ts` — no errors

---

### TASK-2.2 — Add org-scoped event fetching + org field to event creation

**What:** Add the ability to fetch events by org and ensure event creation stores `organizationId`. There may not be a dedicated `EventRepository` class — events may be fetched directly in route loaders. Read before assuming.

**Input state:** TASK-2.1 complete.

**Files to read first:**
- `apps/web/src/routes/dashboard/_layout.index.tsx` — read fully to find where events are fetched (server function, loader, or direct Supabase call)
- Follow the fetch pattern to its source — that is the file to change

**Files to change:**
- Wherever events are currently fetched — add org filtering (accept optional `organizationId` parameter)
- Wherever events are currently created — add `organizationId` as required field

**Verification:**
1. TypeScript compiles with no new errors
2. `npx eslint` on changed files — no new errors

---

### TASK-2.3 — API: organizations CRUD endpoints

**What:** Create API endpoints for the dashboard to manage organizations.

**Input state:** TASK-2.1 complete.

**Files to read first:**
- `apps/web/src/routes/dashboard/_layout.tsx` — read to understand how the dashboard fetches data (server functions vs API routes vs direct Supabase calls)
- `apps/web/src/routes/dashboard/_layout.index.tsx` — read to see the pattern used for the events list (this is the pattern to follow for org endpoints)
- `apps/web/src/routes/api.config.ts` — read to compare API route pattern

> **Important:** The dashboard may fetch data via TanStack Start server functions rather than bearer-auth API routes. Match the pattern already in use — do not introduce a second pattern. If dashboard routes use server functions, create org CRUD as server functions, not bearer-auth API routes.

**Files to create (exact filenames depend on pattern found above):**
- Org list + create endpoint/server function
- Org get + update endpoint/server function

**Endpoints (bearer-auth pattern, if that's what's in use):**
```
GET  /api/organizations          → { organizations: Organization[] }
POST /api/organizations          → { organization: Organization }   body: { name, slug }
GET  /api/organizations/:orgId   → { organization: Organization }
PATCH /api/organizations/:orgId  → { organization: Organization }   body: { name?, slug? }
```

**Verification:**
1. `curl -H "Authorization: Bearer <key>" http://localhost:3000/api/organizations` → returns JSON with Shell org
2. POST creates a new org; GET returns it
3. `npx eslint` on new files — no errors

---

## Phase 3 — Dashboard: Organizations UI

### TASK-3.1 — Organizations list page

**What:** Create `/dashboard/organizations` page listing all orgs with event count and a "New Organization" button.

**Input state:** TASK-2.3 complete.

**Files to read first:**
- `apps/web/src/routes/dashboard/_layout.tsx` (layout, nav, auth pattern)
- `apps/web/src/routes/dashboard/_layout.index.tsx` (events list — for UI pattern)

**Files to create:**
- `apps/web/src/routes/dashboard/_layout.organizations.tsx`

**UI:**
- Table/list of organizations: name, slug, event count, created date
- "New Organization" button → opens create form (inline or navigate to create page)
- Empty state if no orgs

**Verification:**
1. Navigate to `/dashboard/organizations` in the browser — page loads
2. Shell org appears in the list
3. Event count is accurate

---

### TASK-3.2 — Create/edit organization form

**What:** Add a form for creating and editing organizations. Slug auto-generates from name but is editable.

**Input state:** TASK-3.1 complete.

**Files to read first:**
- `apps/web/src/routes/dashboard/_layout.organizations.tsx` (from TASK-3.1)
- `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx` (for form UI pattern)

**Files to change:**
- `apps/web/src/routes/dashboard/_layout.organizations.tsx` — add create/edit form (modal or inline)

**Behavior:**
- Name field: free text, required
- Slug field: auto-populated from name (lowercase, spaces→hyphens), user-editable, validated unique on submit
- On submit: POST `/api/organizations`, refresh list, close form
- Edit mode: PATCH `/api/organizations/:orgId`

**Verification:**
1. Fill name → slug auto-populates
2. Submit → new org appears in list
3. Duplicate slug shows a validation error

---

### TASK-3.3 — Events list grouped by org + org filter

**What:** Update the dashboard events list to show org name per event and allow filtering by org.

**Input state:** TASK-2.2 and TASK-3.1 complete.

**Files to read first:**
- `apps/web/src/routes/dashboard/_layout.index.tsx` (events list — read fully before changing)

**Files to change:**
- `apps/web/src/routes/dashboard/_layout.index.tsx`

**Changes:**
- Fetch orgs alongside events on page load
- Display org name as a badge/label on each event card or table row
- Add an org filter dropdown at the top of the list (`All organizations` default → filter to single org)
- Group events by org when no filter is active (optional: just a label is acceptable)

**Verification:**
1. Events list shows org name label on each event
2. Selecting an org in the filter shows only that org's events
3. "All organizations" shows all events

---

### TASK-3.4 — Event creation: org selector

**What:** Add a required organization dropdown to the new event creation form.

**Input state:** TASK-3.3 complete.

**Files to read first:**
- `apps/web/src/routes/dashboard/_layout.index.tsx` — the create event form is likely here (inline or as a modal). Read fully to locate it before changing anything.

**Files to change:**
- Event creation form — add `organizationId` dropdown (required, lists all orgs)
- Event creation API call — pass `organizationId` in POST body
- Backend event creation handler — accept and save `organizationId`

**Verification:**
1. Open create event form → org dropdown is visible and populated
2. Submit without selecting org → validation error
3. Submit with org selected → event is created and appears in the org's event list

---

## Phase 4 — Resilience Fixes

> **Note:** TASK-4.1 and TASK-4.2 are fully independent of Phases 1–3 and of each other. They can be pulled forward and executed at any time — e.g. as a quick first win before the schema work starts.

### TASK-4.1 — OFFLINE-01: fail-silently on `POST /api/session/start`

**What:** Wrap the session start API call in `PipelineRenderer.tsx` so it fails silently when offline — guest session proceeds without blocking.

**Input state:** Any prior tasks can be complete; this is independent.

**Files to read first:**
- `apps/frontend/src/components/PipelineRenderer.tsx` (read fully — the fetch is in a `useEffect` around line 37)

**Files to change:**
- `apps/frontend/src/components/PipelineRenderer.tsx`

**Changes:**
- Wrap the `fetch('/api/session/start', ...)` call in try-catch
- On any error (network failure, non-2xx, timeout): `console.warn('Session start failed, proceeding offline:', error)`, call `setSessionId(null)`, and advance — the guest flow must not be blocked
- Keep the `sessionStartError` state for operator diagnostics (e.g. log it), but do not render the error screen to the guest — the session proceeds silently
- Search for all uses of `sessionId` in the pipeline and confirm that `null` is handled gracefully everywhere (it should already be `string | null` but verify)

**Verification:**
1. Disconnect network (or set backend to a wrong URL in `.env`)
2. Tap through the welcome screen — guest session starts without a hard error
3. Session proceeds through camera → form → result without crashing
4. Console shows the warn log, not an uncaught error

---

### TASK-4.2 — SCALE-02: photos page pagination

**What:** Replace the unbounded `.list()` call in the photos page with a paginated fetch.

**Input state:** Any prior tasks can be complete; this is independent.

**Files to read first:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx` (read fully)

**Files to change:**
- `apps/web/src/routes/dashboard/_layout.events.$eventId.photos.tsx`

**Changes:**
- Add `PAGE_SIZE = 24` constant
- Add `page` state variable (default `0`)
- Change the primary `.list()` call to: `{ limit: PAGE_SIZE, offset: page * PAGE_SIZE, sortBy: { column: 'created_at', order: 'desc' } }`
- For total count: use a second `.list({ limit: 1, offset: 0 })` to check whether more pages exist (or track `hasMore` from whether the page returned `PAGE_SIZE` items)
- Add "Previous" / "Next" pagination controls below the photo grid, disabled when at boundary

**Verification:**
1. Event with < 24 photos: all photos shown, no pagination controls (or controls disabled)
2. Event with > 24 photos: first 24 shown, "Next" enabled
3. Navigate to page 2: next 24 shown, "Previous" enabled
4. `npx eslint` on changed file — no new errors
