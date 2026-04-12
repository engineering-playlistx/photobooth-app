# scale-up-v5 — Creator Input

**Captured:** 2026-04-13 (planning session before execution started)

---

## Context

No post-V4 field testing has occurred yet (V4 was completed 2026-04-10 and no kiosk is deployed). This document captures the planning conversation that shaped V5 scope.

---

## Key Decisions

### V5 scope should be narrow

Original MASTER-PLAN.md described V5 as "Multi-Tenant SaaS" covering organizations, client accounts, client dashboard access, automated reporting, AI provider fallback chain, and config version history. Creator confirmed that is too wide for a single milestone.

**Decision:** V5 is scoped to the organizations layer (data model foundation) only.

### No client accounts in V5

Client dashboard login, self-serve event management, and per-client API key isolation are explicitly out of V5 scope. The organizations layer is being built as a data model foundation — the admin dashboard remains internal-only.

**Rationale:** Client accounts require auth changes, RLS redesign, and invite flow work that exceeds V5 scope. The org table delivers value now (data isolation, clean grouping) without that complexity.

### Multi-event-only was considered and rejected

An alternative scope was discussed: skip the organizations table entirely and just improve multi-event operations (OFFLINE-01, SCALE-02, QR pairing). This was rejected because:

1. The schema migration is trivially cheap now and expensive later once production data accumulates
2. Without the org FK on events, V6 reporting and RLS policies require a retrofit across many files
3. A default "Shell" org can be seeded immediately — zero operational impact

### OFFLINE-01 and SCALE-02 included

Two V4-deferred items are included in V5 because they become more impactful at multi-org scale:
- **OFFLINE-01** — `POST /api/session/start` fails hard offline; must fail-silently
- **SCALE-02** — photos page fetches all Storage metadata on every navigation; needs pagination

---

## What Goes to V6+

- Client accounts / dashboard login
- Automated reporting and scheduled email delivery
- AI provider fallback chain (CARRY-01)
- Config version history and rollback (CARRY-02)
- Session crash recovery / SQLite mid-flow persistence (GAP-01)
- SQLite offline sync-back to Supabase (GAP-05)
- Operator-facing error dashboard (GAP-03)
- QR kiosk pairing
- Silent Electron auto-update
- Per-module layout templates (CUSTOM-03)
- Visual CSS builder
- Guest portal V2
- Form field builder
- PERF-01 (JWT revocation window)
