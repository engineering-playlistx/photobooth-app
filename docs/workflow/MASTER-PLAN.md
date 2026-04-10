# Shell Photobooth — Master Plan

**This is the north-star document.** When scope is unclear, when two documents disagree, or when you're unsure which project a task belongs to — start here.

---

## 1. Product Vision

This Photobooth App is a managed, AI-powered, modular photobooth platform sold as a service to brands and agencies. Every visual and functional aspect of the guest experience is assembled from configurable modules and controlled remotely from a dashboard — no code changes, no redeployment required.

The product has two layers:
- **Kiosk app** — Electron desktop app at the venue. Renders whatever the config says.
- **Platform** — Backend + dashboard that configures the kiosk remotely per event.

---

## 2. Architecture Invariants

These decisions are permanently settled. Every project must respect them.

| Invariant | Rule |
|-----------|------|
| Source of truth | Supabase wins over SQLite. If they differ, Supabase is correct. |
| Entity scope | Every piece of data is scoped to an `eventId`. |
| Config delivery | The kiosk reads all its configuration from the backend on each session start — nothing is hardcoded in the build. |
| Additive DB changes | Schema changes are additive only — new columns with defaults, new tables. Never drop or rename. |
| Credential safety | `SUPABASE_SERVICE_KEY` is server-side only, never in the frontend or git. |
| Risk tolerance | 2/5 — validate before deploying. No "move fast" shortcuts. |

---

## 3. Strategic Milestones

Each milestone is a definition of done at the product level. Task lists live in individual project docs.

### ✅ V1 — Configuration-Driven Platform
**Done:** 2026-04-01

The kiosk reads all config from a remote `EventConfig`. No hardcoded branding, themes, or AI settings in the build. Operator can manage events and data from a dashboard. Guest portal with QR-code photo download.

Delivered by: [`scale-up-v1`](projects/scale-up-v1/)

### ✅ V2 — Modular Pipeline
**Done:** 2026-04-02

The guest flow is assembled from interchangeable modules, configurable per event in the dashboard. New modules can be added without touching the flow infrastructure.

Delivered by: [`scale-up-v2`](projects/scale-up-v2/)

### ✅ V3 — Remote Asset Management + Carryover
**Done:** 2026-04-05

Per-event, per-module asset uploads via dashboard (frames, templates, backgrounds). Multi-event support gap closure. Known carryover fixes from V2.

Delivered by: [`scale-up-v3`](projects/scale-up-v3/)

### V4 — Platform Polish + Deep Customization ← Current Target
Polished kiosk startup with asset pre-loading and error handling; deep per-module customization (copy, inline CSS) from the dashboard; unified flow builder as the single configuration hub; basic analytics; kiosk event ID persistence (no manual JSON editing).

Definition of done:
- Kiosk startup loading screen with progress bar; assets pre-loaded before first module renders
- Kiosk handles all negative startup cases (network error, backend error) with operator-facing messages
- Kiosk has persistent event ID selection — no manual `kiosk.config.json` edits
- Per-module copy and inline CSS customizable from dashboard flow builder
- Result module has configurable feature toggles (email, QR, printing) per event
- Dashboard flow builder is the single config hub — assets and module-specific config inline in panels
- Basic analytics: total visits, unique guests, daily trend per event

> Electron auto-update was scoped out of V4 — blocked on Windows code signing. Parked at [`docs/workflow/projects/[parked]-auto-update/`](projects/[parked]-auto-update/).

Being planned by: [`scale-up-v4`](projects/scale-up-v4/)

### V5 — Multi-Tenant SaaS (Future)
Organizations layer, client account management, client dashboard access, automated reporting and email delivery, AI provider fallback chain, config version history.

---

## 4. Project Registry

| Project | Milestone | Status | Docs |
|---------|-----------|--------|------|
| `scale-up-v1` | V1 | ✅ Done | [projects/scale-up-v1/](projects/scale-up-v1/) |
| `scale-up-v2` | V2 | ✅ Done | [projects/scale-up-v2/](projects/scale-up-v2/) |
| `scale-up-v3` | V3 | ✅ Done | [projects/scale-up-v3/](projects/scale-up-v3/) |
| `scale-up-v4` | V4 | 🔜 Planning | [projects/scale-up-v4/](projects/scale-up-v4/) |

---

## 5. Rules for Scope Clarity

These rules exist to prevent the type of task identity confusion that emerged in `scale-up-v1`, where "Phase 6" simultaneously meant "resilience patch" in the task decomposition and "V2 modular pipeline" in the migration strategy.

**Rule 1 — A task belongs to exactly one project.**
If a task is deferred from one project, it moves to the next project's backlog — it does not get a phase number in the current project.

**Rule 2 — The master plan defines milestones, not tasks.**
Milestones are product-level outcomes. Tasks live in project decomposition docs only. Never put task tracking in this document.

**Rule 3 — When two documents disagree, this document wins.**
Align the task decomposition to the master plan — not the other way around.

**Rule 4 — "Phase N" is project-internal language, not product language.**
Say "V1", "V2", "V3" when talking about the product roadmap. Say "Phase 2" only inside a specific project's docs. Never say "Phase 6 = V2" across documents — that's where identity confusion starts.

**Rule 5 — Backlog items carry their origin.**
When a task is deferred, record: what it is, why it was deferred, and which milestone it serves. This prevents orphaned backlog items.

**Rule 6 — Before starting a new project, write its scope in one sentence.**
If you can't complete "This project delivers [outcome] which moves [milestone] forward by [what specifically]" — the scope is not yet clear enough to start.

---

## 6. Related Documents

| Document | Purpose |
|----------|---------|
| [HOW-WE-WORK.md](HOW-WE-WORK.md) | Execution methodology — session structure, verification, git, prompting |
| [docs/design/design-document.md](../design/design-document.md) | Full product and technical design — module catalog, data models, V1/V2 scope |
