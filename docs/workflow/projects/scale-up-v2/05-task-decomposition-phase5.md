# Task Decomposition — V2 Phase 5 (Mini Quiz Module)

**Status:** 🔜 Not started
**Scope:** V2-Phase 5 — Mini Quiz Module (first net-new V2 module)
**Depends on:** Phases 1, 2, 3, 4 complete ✅

**Format per task:** What · Files · Input · Output · Verification · Risk
**Per-task workflow:** read → change → lint → test → commit → mark done (see CLAUDE.md)

---

## Goal

Prove the V2 module system works end-to-end for a net-new module by shipping `MiniQuizModule`. The dashboard flow builder (V2-4.8) already supports configuring Mini Quiz — this phase builds and registers the kiosk-side component so the module is fully live.

---

## Pre-work Note

**V2-5.3 is already complete.** The Mini Quiz config panel (questions + options editor) was built as part of Phase 4 (V2-4.8). The backlog lists V2-5.3 as a Phase 5 task, but it was executed early inside `flow.tsx`. Mark it done below.

---

## Architecture Decisions for Phase 5

### Question navigation
MiniQuizModule manages internal question state (`currentQuestion` index). It does **not** call `onBack()` / `onComplete()` on every question — only on module boundaries:
- Back button on **question 0** → calls `onBack()` (exits module to previous pipeline step)
- Back button on **question N > 0** → steps back to previous question (internal navigation)
- Selecting an option on the **last question** → calls `onComplete()`

### Output shape
`onComplete({ quizAnswer: string[] })` — array of selected option strings, one per question, in question order.

### Auto-advance on option select
Selecting an option immediately advances to the next question (or completes the module if last). No separate "Confirm" button. This matches the kiosk tap-and-go UX pattern used by ThemeSelectionModule.

### Empty questions guard
If `config.questions` is empty (misconfigured), call `onComplete({ quizAnswer: [] })` immediately on mount. Do not show a broken empty screen.

### Styling
Match the kiosk's existing dark card pattern used by `ThemeSelectionModule`. Full-height layout (`h-svh aspect-9/16`). Options as large tappable cards.

---

## Dependency Chain

```
V2-5.1 (MiniQuizModule.tsx)
  ↓
V2-5.2 (register 'mini-quiz' in MODULE_REGISTRY)
  ↓
V2-5.4 (manual E2E verification)
```

V2-5.3 (flow builder config panel) ✅ already done.

---

## Tasks

---

### ~~V2-5.3 — Flow builder: Mini Quiz config panel~~ ✅

Done as V2-4.8. No action needed.

---

### V2-5.1 — Build `MiniQuizModule.tsx`

**What:**
1. Create `apps/frontend/src/modules/MiniQuizModule.tsx`.
2. Cast `config` to `MiniQuizModuleConfig` to read `config.questions`.
3. Local state: `currentQuestion: number` (starts at 0) and `answers: string[]` (grows as questions are answered).
4. Empty guard: if `config.questions.length === 0`, call `onComplete({ quizAnswer: [] })` in a `useEffect` on mount.
5. Render the current question: question text + option cards.
6. On option tap:
   - Append the selected option to `answers`.
   - If more questions remain: increment `currentQuestion`.
   - If last question: call `onComplete({ quizAnswer: [...answers, selectedOption] })`.
7. Back button:
   - If `currentQuestion > 0`: decrement `currentQuestion` and remove last entry from `answers`.
   - If `currentQuestion === 0`: call `onBack()`.
8. Progress indicator: `Question N of M` at the top.
9. Layout: `h-svh aspect-9/16 mx-auto` — consistent with other modules.
10. Options: full-width tappable cards. Selected option has no special state (auto-advance, no selection highlight needed).

**Files:**
- `apps/frontend/src/modules/MiniQuizModule.tsx` (new)

**Input:** `MiniQuizModuleConfig` from `types/module-config.ts`. `ModuleProps` interface from `modules/types.ts`.

**Output:**
- `MiniQuizModule` component exported.
- Compiles with no TypeScript errors.
- Empty questions guard fires `onComplete` immediately.
- Back on question 0 calls `onBack()`.
- Back on question N > 0 returns to previous question.
- Selecting last option calls `onComplete({ quizAnswer: string[] })`.

**Verification:**
- Layer 1: Lint the new file — no new errors.
- Layer 2: n/a — no pure business logic to unit test (state transitions are trivially verified by manual test).
- Layer 3: see V2-5.4.

**Risk:** Low. Follows an established pattern (ThemeSelectionModule). No API calls. No cross-module sync.

---

### V2-5.2 — Register `'mini-quiz'` in `MODULE_REGISTRY`

**What:**
1. Import `MiniQuizModule` from `./MiniQuizModule` in `registry.ts`.
2. Add `MODULE_REGISTRY["mini-quiz"] = MiniQuizModule`.

**Files:**
- `apps/frontend/src/modules/registry.ts`

**Input:** V2-5.1 complete.

**Output:**
- `'mini-quiz'` is a registered key in `MODULE_REGISTRY`.
- `PipelineRenderer` will find and render it without hitting the "unknown module" error card.

**Verification:**
- Layer 1: Lint.
- Layer 3: see V2-5.4.

**Risk:** Trivial.

---

### V2-5.4 — Manual E2E verification

**What:**
Full end-to-end test of the Mini Quiz module in the kiosk flow.

**Steps:**
1. Open the Flow Builder for the Shell event at `/dashboard/events/:eventId/flow`.
2. Add a `Mini Quiz` module. Configure 2 questions, each with 3 options.
3. Position it before `Camera` (pre-photo placement).
4. Save the flow.
5. Start the kiosk (`pnpm fe dev`).
6. Tap "Tap to Start" → pass through any pre-quiz modules → reach Mini Quiz.
7. Confirm question 1 text and all 3 options render.
8. Tap an option → confirm auto-advance to question 2.
9. On question 2: tap Back → confirm return to question 1.
10. Answer question 1 again → advance to question 2 → tap an option.
11. Confirm the module exits (pipeline advances to Camera).
12. Complete the rest of the flow.
13. Check Supabase `sessions.module_outputs` → confirm `quizAnswer` array contains both selected options.
14. Back-test: on question 1, tap Back → confirm previous pipeline module appears.

**Files:** None (manual test only).

**Input:** V2-5.2 complete. Kiosk dev server running.

**Risk:** Low. The module itself is simple; the main risk is the Supabase `module_outputs` write (handled by `ResultModule` from Phase 3 — not touched in Phase 5).

---

## Summary Table

| Task | What | Files | Depends On |
|------|------|-------|------------|
| ~~V2-5.3~~ | ~~Flow builder Mini Quiz config panel~~ | ~~flow.tsx~~ | ~~Done (V2-4.8)~~ |
| V2-5.1 | Build `MiniQuizModule.tsx` | `modules/MiniQuizModule.tsx` (new) | Phase 3 ✅ |
| V2-5.2 | Register `'mini-quiz'` in `MODULE_REGISTRY` | `modules/registry.ts` | V2-5.1 |
| V2-5.4 | Manual E2E verification | — (manual) | V2-5.2 |

---

## Notes

- **No backend changes needed.** `module_outputs` is already a JSONB column (added in V2-2.1) and `ResultModule` already writes to it. `quizAnswer` is just another key in that object.
- **No new types needed.** `MiniQuizModuleConfig` and its `questions` shape are already defined in `apps/frontend/src/types/module-config.ts`.
- **Phase 5 is intentionally small.** It proves the module system works without introducing new infrastructure. The real complexity was in Phase 3 (pipeline renderer) and Phase 4 (flow builder).
- **After Phase 5:** Phase 6 (V1 carryover closure) is next. See `02-backlog.md` Part A for the full list.
