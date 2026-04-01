# scale-up-v2 — Project Scope

**Milestone:** V2 — Modular Pipeline
**Status:** 🔜 Planning
**Depends on:** `scale-up-v1` complete ✅

---

## What This Project Delivers

The kiosk's guest flow becomes a runtime-rendered pipeline of configurable modules, assembled per event from the dashboard — not a hardcoded sequence of React Router routes.

One sentence: **This project replaces the hardcoded 5-step kiosk flow with a dynamic module pipeline driven entirely by `EventConfig`.**

---

## Definition of Done

- `moduleFlow: ModuleConfig[]` is a fully typed array (no longer a stub)
- The kiosk reads `moduleFlow` and renders each module component in sequence — no hardcoded routes drive the flow
- Flow builder exists in the dashboard (add, remove, reorder modules; configure each)
- At least one new non-core module is built on the system (Mini Quiz is the target)
- Session model is complete: rows are created on session start, include `module_outputs`
- All V1 carryover items from the backlog are resolved or explicitly deferred to V3

---

## Architecture Decisions Needed Before Starting

These need answers before task decomposition begins. Do not start coding until these are resolved.

### A — Module rendering strategy

**Question:** Does V2 keep React Router routes for each module (low risk, limited flexibility) or replace the router with a module state machine (proper V2, higher risk)?

| Option | Pros | Cons |
|--------|------|------|
| Router-mapped modules | Low risk, familiar pattern | Flow order is still constrained by router; adding a module = adding a route |
| State machine pipeline | True dynamic flow; any order possible | Bigger refactor; `PhotoboothContext` must be rebuilt |

**Recommendation:** State machine. The entire point of V2 is that flow order comes from config, not code. A router-mapped approach still hardcodes the flow sequence in the routes.

### B — Session lifecycle

**Question:** When is a session row created?

Current (V1): session is created on `POST /api/photo` (end of flow).
V2 intent (design doc): session is created when the guest starts (taps "Welcome"), so mid-session data is recoverable on crash.

This requires a new `POST /api/session/start` endpoint and changes to how `sessionId` propagates through the kiosk flow.

### C — `PhotoboothContext` migration

The current context is tightly coupled to the V1 flow:
```typescript
{ originalPhotos, finalPhoto, selectedTheme, userInfo }
```

V2 needs a generic session context:
```typescript
{ sessionId, moduleOutputs: Record<string, unknown> }
```

This is a breaking change for every existing route. Plan the migration carefully — wrap existing routes to read from both contexts during transition, or do a clean cut.

### D — `moduleFlow` type design

Current stub: `moduleFlow: Array<string>`

V2 needs at minimum:
```typescript
type ModuleConfig =
  | WelcomeModuleConfig
  | CameraModuleConfig
  | ThemeSelectionModuleConfig
  | AIGenerationModuleConfig
  | ResultModuleConfig
  | MiniQuizModuleConfig

interface BaseModuleConfig {
  moduleId: string
  position: 'fixed-first' | 'pre-photo' | 'fixed-camera' | 'post-photo' | 'fixed-last' | 'flexible'
  outputKey?: string  // key written to moduleOutputs for downstream modules
}
```

Design this type before any implementation starts. Both `apps/frontend` and `apps/web` need the same type.

---

## Rough Phase Plan

This is directional — full task decomposition goes in `02-backlog.md` once decisions A–D are answered.

| Phase | Focus |
|-------|-------|
| V2-Phase 1 | Type system — define `ModuleConfig` types; replace `moduleFlow` stub |
| V2-Phase 2 | Session model — `POST /api/session/start`; `moduleOutputs` in sessions table |
| V2-Phase 3 | Module renderer — replace hardcoded routes with state machine pipeline; migrate `PhotoboothContext` |
| V2-Phase 4 | Flow builder UI — dashboard drag/drop or ordered list; per-module config panels |
| V2-Phase 5 | First new module — Mini Quiz, built on the V2 module system |
| V2-Phase 6 | V1 carryover closure — all remaining tech debt from `06-backlogs.md` |

---

## What This Project Does NOT Cover

These are V3 scope (do not plan them in scale-up-v2):

- `organizations` table / multi-tenancy
- Client dashboard access
- Email delivery (TASK-B.14 is carryover from V1 — completing it here is acceptable, but the full email pipeline design is V3)
- Asset upload via dashboard (frames, templates)
- Form field builder (custom fields beyond name/email/phone)
- Guest portal V2 (social share, multiple result items, brand CTA)
