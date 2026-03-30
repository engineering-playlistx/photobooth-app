# Constraints & Invariants Interview

**Purpose:** Define what must never break, change, or regress — so every migration decision can be tested against these rules.

**Status:** Questions drafted. Answers to be filled in by the product owner.

---

## How to Use This Document

For each question, answer directly under **Answer:**. Once all answers are captured, the migration strategy and task decomposition will be revised against these constraints.

---

## Section A — Operational Continuity

These questions define what must keep working without interruption during the migration.

**A1.** Are there events currently scheduled in the next 30–60 days that the current kiosk app needs to run, unmodified?

> Answer: it needs to run but we need to modify it. so we can start the migration / scaling up slowly

---

**A2.** Is there guest data already stored in Supabase (the `users` table and `public/` folder) that must remain accessible and not be disrupted by schema changes?

> Answer: we will start with a new supabase project. so it's okay to modify the schema

---

**A3.** Can the backend be taken down for maintenance (even briefly), or does it need zero-downtime deploys at all times?

> Answer: it's okay, no backend is running right now

---

**A4.** Are there multiple physical kiosks currently deployed in the field, or is there only one?

> Answer: no kiosk is deployed currently

---

**A5.** If the kiosk app needs to be updated (new Electron build), how does that happen today? Manual USB install? Remote update? Who does it?

> Answer: usually manual usb install by me or my team members. ideally, it should be with remote update with existing auto update feature

---

## Section B — Data Integrity

**B1.** What is the source of truth for guest data: local SQLite, or Supabase? In other words — if they ever differ, which one wins?

> Answer: supabase wins. local sqlite is just for a backup, especially when the internet is down

---

**B2.** Is it acceptable for a guest session to be partially saved (e.g. photo uploaded to Supabase but user record not written)? Or does it need to be all-or-nothing?

> Answer: in the real world, there might be a session that is not finished. so we need to allow partial save. but this needs to be defined, so that we don't overspend but still effective

---

**B3.** When we introduce `eventId` and per-event storage paths (`events/<eventId>/photos/`), what happens to photos already in `public/`? Do they need to be migrated, or can they be left as-is (orphaned from the new system)?

> Answer: we will start fresh, so it's okay to start a new path.

---

**B4.** Are guest records (name, email, phone) subject to any data retention or GDPR-type requirements? Can they be deleted after a certain period?

> Answer: not gdpr but we might keep it as long as we got the space.

---

## Section C — Guest Experience Invariants

These define what the guest-facing kiosk flow can never regress on.

**C1.** What is the maximum acceptable wait time for AI generation from the guest's perspective? (e.g. "more than 45 seconds feels broken")

> Answer: one minute is max

---

**C2.** Must the kiosk always produce a print, even if Supabase or the backend is unreachable? Or is "sorry, try again" acceptable when the network is down?

> Answer: this will depend on the project / event requirements. sometimes, there are no printing needed. but when we need printing, it MUST print the results AFTER we got the results. but if the backend is unreachable when generating the results, yes we can throw "sorry, try again" error.

---

**C3.** Is the current 3-theme flow (Pitcrew / MotoGP / F1) locked for the Shell client, or is Shell OK with the theme selection screen becoming config-driven (potentially different themes for future clients)?

> Answer: shell is the current client, we will serve other clients. so yeah the app will be okay if we make it config-driven.

---

**C4.** Can the guest flow ever be reordered? For example, could a future event skip the theme selection and go directly to camera? Or is the current sequence fixed?

> Answer: yes it can be customized. it can skip it.

---

## Section D — Business Constraints

**D1.** Will there ever be two simultaneous clients (separate events, separate configs) running at the same time? Or is the pipeline sequential — one event ends, then the next is set up?

> Answer: yes it will happen. we need to prepare for that.

---

**D2.** Who configures the dashboard in V1 — only the operator (your team internally), or does the client get any access to it?

> Answer: *(already resolved: operator only. Daily report to client. Revisit if this changes.)*

---

**D3.** When you say "daily report to the client" — what should be in it? Guest count? Photo gallery link? Raw CSV? Something else?

> Answer: usually just guest count is enough.

---

**D4.** Does the client need to approve the AI-generated photo quality before it goes to guests, or is fully automated generation acceptable?

> Answer: it is automated, no approval is needed.

---

**D5.** Is the backend always Cloudflare Workers, or could a future event require a self-hosted backend (e.g. offline venue with no internet)?

> Answer: it might require that, but less priority for now to mid-term.

---

## Section E — Technical Constraints

**E1.** Is TypeScript strictness (no `any`, full type coverage) a requirement, or is pragmatic typing acceptable during migration?

> Answer: it should follow the current practice. how is it? if we disallow it right now, then we must disallow it during the migration.

---

**E2.** Is there a test coverage requirement? (unit tests, integration tests, e2e tests?)

> Answer: we need to define each case. but I think yes we need unit tests at least.

---

**E3.** The current Electron app uses React Router v7 with HashRouter and a flat route structure. Is it acceptable to change the routing architecture (e.g. introduce nested routes, a route registry for modules) as part of V2?

> Answer: yes it can as long as it is more effective and not costly. we should discuss it further technically.

---

**E4.** Is Supabase a permanent dependency, or should the architecture stay storage-provider-agnostic (e.g. could swap to S3 or Cloudflare R2 later)?

> Answer: for now yes we're dependent to supabase. but I think we need to make this more storage-provider-agnostic later to ensure scalability.

---

**E5.** The current `PhotoboothContext` holds all session state in React memory. If the app crashes mid-session, that state is lost. Is this acceptable, or does session state need to survive crashes (e.g. persisted to SQLite or `kiosk.config.json`)?

> Answer: yes the ideal case would be persisted state, saved locally.

---

## Section F — Migration Risk Tolerance

**F1.** On a scale of 1–5 (1 = "do not touch anything that works", 5 = "move fast, we'll fix issues as they come"), what is your risk tolerance for the migration?

> Answer: I think we're in the scale of 2.

---

**F2.** Is it acceptable to run V1 (remote config) and the current hardcoded version simultaneously on different kiosks during a transition period? Or does every kiosk need to be on the same version at all times?

> Answer: to reduce complexity, let's run just the same version at all times.

---

**F3.** What is the rollback plan if a migration step breaks a live event? Is there a way to fall back to the previous version quickly?

> Answer: fortunately, no deployment is on going right now. so I can just revert via git.

---

## After This Interview

Once these questions are answered, the following documents will be updated:

- `03-migration-strategy.md` — constraints from sections A, C, D, F will shape the migration phases and go/no-go gates
- `04-task-decomposition.md` — constraints from sections B, E will shape task scope and acceptance criteria
- `05-execution-strategy.md` — constraint from F1 will shape how aggressively we batch changes
