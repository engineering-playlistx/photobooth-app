# scale-up-v5 — Project Scope

**Milestone:** V5 — Multi-Tenant Foundation (Organizations Layer)
**Status:** Planning 🔜
**Depends on:** `scale-up-v4` complete ✅

---

## What This Project Delivers

One sentence: **This project delivers an `organizations` data layer above events — scoping all client data under an org, adding org management to the dashboard, and fixing two multi-event resilience gaps — moving the platform toward a clean multi-tenant foundation.**

---

## Definition of Done

- `organizations` table exists in Supabase with `id`, `name`, `slug`, `created_at`
- `events` table has a non-nullable `organization_id` FK referencing `organizations`
- All existing events are assigned to a default "Shell" organization (zero data loss)
- Dashboard has an organizations list page: view all orgs, create a new org
- Dashboard events list is scoped and grouped by organization
- New event creation requires selecting an organization
- Kiosk behavior is completely unchanged — it still uses `eventId` only, org layer is invisible to kiosk
- `POST /api/session/start` from the kiosk fails silently when offline — guest session proceeds without a `sessionId`
- Dashboard photos page fetches only the current page's metadata (paginated), not all files at once

---

## Architecture Decisions (Resolved)

### A — Organizations table schema

```sql
CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,  -- URL-safe, e.g. "shell-racing"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`slug` is auto-generated from `name` on creation (lowercase, hyphens). It is editable but must remain unique. It is the human-readable identifier used in dashboard URLs.

---

### B — Migration strategy for existing events

**Decision: two-step migration.**

Step 1 — Add `organization_id` as nullable:
```sql
ALTER TABLE events ADD COLUMN organization_id UUID REFERENCES organizations(id);
```

Step 2 — Insert default "Shell" org, backfill all existing events, then set NOT NULL:
```sql
INSERT INTO organizations (id, name, slug) VALUES (gen_random_uuid(), 'Shell', 'shell-racing')
  RETURNING id;  -- capture this id for the backfill

UPDATE events SET organization_id = '<shell-org-id>' WHERE organization_id IS NULL;

ALTER TABLE events ALTER COLUMN organization_id SET NOT NULL;
```

Both steps are in a single migration file. The migration is safe to run on an empty or live database.

> **Manual step required before TASK-1.2:** Run the migration in the Supabase SQL editor, then confirm with `SELECT COUNT(*) FROM events WHERE organization_id IS NULL;` → should return 0.

---

### C — Dashboard approach: org-scoped events list, no routing restructure

**Decision: add an org context to the existing dashboard, not a full routing restructure.**

V5 does NOT change the `/dashboard/events/:eventId/...` route structure. Instead:

- A new `/dashboard/organizations` page lists all orgs
- The existing events list page (`/dashboard/`) gains an org filter/grouper — events are grouped by org name
- Event creation form adds an "Organization" dropdown (required)
- Each event card/row in the list shows its org name as a label

Full nested routing (`/dashboard/orgs/:orgId/events/:eventId/...`) is V6 scope, when client accounts create a need for per-org access boundaries.

**Rationale:** Nested routing requires updating every existing dashboard link, breadcrumb, and `useParams` call. The flat routing with org labels achieves the same UX value for the internal operator with a fraction of the churn.

---

### D — Kiosk is org-unaware

**Decision: the kiosk never receives or uses `organizationId`.**

The kiosk fetches config via `GET /api/config?eventId=<id>`. The backend resolves the event (which now has an `organizationId`) but the response to the kiosk does not include `organizationId`. The kiosk only knows its `eventId`.

This means zero changes to the Electron app, `PipelineRenderer`, `PhotoboothContext`, or any kiosk route.

---

### E — OFFLINE-01: fail-silently strategy

**Decision: catch network errors in `PipelineRenderer.tsx` and proceed without a `sessionId`.**

`PipelineRenderer.tsx` calls `POST /api/session/start` on welcome module entry. Change:
- Wrap the `fetch` in try-catch
- On network error or non-2xx response: log to console, call `setSessionId(null)`, and advance — do not block the guest
- Show no error UI to the guest (they don't know or care about session tracking)
- Downstream code that uses `sessionId` (e.g. `POST /api/photo`) must already handle nullable `sessionId` — verify before closing task

---

### F — SCALE-02: photos page pagination strategy

**Decision: pass `{ limit, offset }` to Supabase Storage `.list()` calls.**

`_layout.events.$eventId.photos.tsx` currently calls `.list()` twice with no limit. Change:
- Add `page` state (default 0) and a constant `PAGE_SIZE = 24`
- First `.list()` call: `{ limit: PAGE_SIZE, offset: page * PAGE_SIZE, sortBy: ... }` — returns current page metadata
- Total count: derive from a separate `.list({ limit: 1, offset: 0 })` response or use a `count` query on the `sessions` table as a proxy
- Add previous/next pagination controls to the UI

---

## Rough Phase Plan

| Phase | Focus | Backlog Items |
|-------|-------|---------------|
| V5-Phase 1 | Schema foundation | ORG-01 (schema + migration + TypeScript types) |
| V5-Phase 2 | Backend: org repository + event scoping | ORG-01 (repository layer) |
| V5-Phase 3 | Dashboard: org management UI | ORG-01 (dashboard pages) |
| V5-Phase 4 | Dashboard: events list scoped by org | ORG-01 (events list update) |
| V5-Phase 5 | Resilience fixes | OFFLINE-01, SCALE-02 |

---

## What This Project Does NOT Cover

These are V6+ scope (do not plan them in scale-up-v5):

- Client dashboard login or per-client auth
- Per-org API key isolation
- Nested routing restructure (`/orgs/:orgId/events/:eventId/...`)
- Automated reporting or scheduled email delivery
- AI provider fallback chain (CARRY-01)
- Config version history (CARRY-02)
- Session crash recovery (GAP-01, GAP-05)
- Operator error dashboard (GAP-03)
- QR kiosk pairing
- Silent Electron auto-update
- Per-module layout templates, visual CSS builder, guest portal V2, form field builder
