# scale-up-v8 — Backlog Collection

**Status:** Pre-planning — collecting holes and improvement areas only. No scope decisions made yet.
**Collected:** 2026-04-17
**Sources:** V4–V7 "What This Project Does NOT Cover" sections, MASTER-PLAN.md V8 note, code TODOs, and TASK-6.1 investigation findings.

---

## 1. Pipeline & Kiosk Behavior

### BACKLOG-P1 — True retry-AI-gen (pipeline step-back)
**Origin:** V7 TASK-2.3 (scoped down), code TODO at `apps/frontend/src/modules/ResultModule.tsx:410`
**What:** The "Retry Result" button currently calls `reset()` — it sends the guest back to home, not back to the AI generation step. True retry requires the pipeline to support stepping back to a specific module (e.g. re-run AI gen with the same photo and theme). `PipelineContext` currently has no step-back capability — `reset()` is the only exit.
**Deferred because:** Too large for V7 scope; needs pipeline architecture change.

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

## 3. Platform Features

### BACKLOG-F1 — AI provider fallback chain
**Origin:** V4/V5/V6/V7 scopes (CARRY-01)
**What:** If the primary AI provider (Replicate or Google) fails or times out, automatically retry with a secondary provider. Currently a failure shows an error with no fallback.
**Deferred because:** Requires rearchitecting the AI generation service to support a provider chain with retry logic.

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

| ID | Area | Item | Priority Signal |
|----|------|------|----------------|
| BACKLOG-P1 | Pipeline | True retry-AI-gen (step-back) | Mentioned by creator, TODO in code |
| BACKLOG-P2 | Pipeline | Wire or remove `guestPortalEnabled` | Dead code, decision needed |
| BACKLOG-P3 | Pipeline | Session crash recovery | Recurring deferral (4+ versions) |
| BACKLOG-P4 | Kiosk | QR kiosk pairing | UX improvement, not a blocker |
| BACKLOG-P5 | Data | SQLite offline sync-back | Recurring deferral |
| BACKLOG-M1 | Multi-tenant | Client account + dashboard login | Named in MASTER-PLAN V8 |
| BACKLOG-M2 | Multi-tenant | Per-org API key isolation | Security, named in V5 |
| BACKLOG-M3 | Multi-tenant | Nested org routing | Structural, low urgency |
| BACKLOG-F1 | Platform | AI provider fallback chain | Recurring (CARRY-01) |
| BACKLOG-F2 | Platform | Config version history | Recurring (CARRY-02) |
| BACKLOG-F3 | Platform | Automated reporting | Recurring (REPORT-01) |
| BACKLOG-D1 | Dashboard | Operator error dashboard | Recurring (GAP-03) |
| BACKLOG-D2 | Dashboard | Event status enforcement | Deliberate deferral (ARCH-01) |
| BACKLOG-G1 | Guest UX | Guest portal V2 | Nice-to-have |
| BACKLOG-G2 | Guest UX | Form field builder | Extensibility feature |
| BACKLOG-G3 | Guest UX | Per-module layout templates | High complexity, low urgency |
| BACKLOG-G4 | Dashboard | Visual CSS builder | High complexity, low urgency |
| BACKLOG-AU | Infra | Electron auto-update | Parked — external blocker |
| BACKLOG-T1 | Tech debt | `renderer.tsx` TS suppression | Low |
| BACKLOG-T2 | Tech debt | `supabase.ts` ESLint suppression | Low |
