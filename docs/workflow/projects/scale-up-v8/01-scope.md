# scale-up-v8 — Project Scope

**Milestone:** V8 — AI Pipeline Hygiene
**Status:** Complete ✅ (2026-04-18)
**Depends on:** `scale-up-v7` complete ✅

---

## What This Project Delivers

One sentence: **This project decouples the AI generation module from the rest of the pipeline, fixes broken retry behaviors throughout the flow, and adds a per-event AI provider fallback chain so the photobooth is resilient, truly modular, and recoverable when generation fails.**

---

## Definition of Done

### Kiosk App

- The photobooth flow works end-to-end with the `ai-generation` module removed — `ResultModule` displays, saves, and prints the raw camera photo without error
- "Try Again" in the AI generation loading screen actually restarts the generation request (new network call made)
- "Back to Home" in the AI generation error state navigates to the welcome screen (not one step back)
- "Retry Result" in the result screen re-runs AI generation with the same photo and theme without restarting the whole session
- "Retry Result" shows its own lightweight confirmation modal ("Regenerate your photo?") — separate from the "Leave anyway?" dialog
- After jumping back to AI generation from retry, the guest's camera photo and form data are preserved
- A `TypeError` on `selectedTheme.id` (ResultModule line 300) is fixed — optional chaining used

### PipelineContext

- A `jumpToIndex(index)` function exists that sets `currentIndex` to the given index and clears `finalPhoto` from `moduleOutputs`

### Dashboard (Flow Builder)

- Attempting to add a second `ai-generation` module to a flow shows a banner error and is blocked

### AI Provider Fallback (Backend + Config)

- `AiGenerationModuleConfig` has a `providerFallback?: 'replicate' | 'google'` field
- The flow builder AI gen module config panel has a "Fallback Provider" dropdown
- If the primary provider CREATE request fails, the backend automatically retries with the fallback provider before returning an error to the frontend
- Fallback is per-event — configurable independently per event in the flow builder

---

## Architecture Decisions (Resolved)

### ARCH-01 — ResultModule falls back to originalPhoto

**Decision:** `ResultModule` reads `outputs["finalPhoto"] ?? outputs["originalPhoto"]` for the photo to display and save. If AI gen is absent from the flow, the raw camera photo is used throughout (display, auto-save to SQLite, Supabase upload, print).

**Rationale:** Minimal change, maximum flexibility. The frame overlay stays inside `AiGenerationModule` — if AI gen is absent, the result shows the unframed photo. This is an acceptable and expected operator choice.

---

### ARCH-02 — PipelineContext gets `jumpToIndex`, not `jumpTo(moduleId)`

**Decision:** `PipelineContext` exposes `jumpToIndex(index: number)` which sets `currentIndex` and clears `finalPhoto` from `moduleOutputs`. The call site (ResultModule) resolves the module index from `EventConfigContext.config.moduleFlow` using `.findIndex(m => m.moduleId === 'ai-generation')`.

**Rationale:** PipelineContext has no dependency on EventConfigContext and should stay that way. Keeping the lookup in ResultModule avoids coupling contexts. If `findIndex` returns `-1` (AI gen not in flow), the retry button is not rendered.

**What is NOT cleared on jump-back:** `originalPhoto`, `selectedTheme`, `userInfo`, `sessionId` — all preserved. Only `finalPhoto` is cleared (stale result replaced by new generation on success).

---

### ARCH-03 — Retry confirmation is a lightweight modal, separate from "Leave anyway?"

**Decision:** The "Retry Result" button shows its own modal: *"Regenerate your photo? Your current result will be replaced."* with "Regenerate" and "Cancel". The existing "Leave anyway?" modal is unchanged and is only triggered by "Back to Home".

**Rationale:** Retry is not leaving — it's a different action. Sharing the modal implies they do the same thing, which was the original bug.

---

### ARCH-04 — `providerFallback` lives in `AiGenerationModuleConfig`

**Decision:** Add `providerFallback?: 'replicate' | 'google'` to `AiGenerationModuleConfig` alongside the existing `provider` field. No change to `TechConfig`.

**Rationale:** Primary `provider` is already per-module. Fallback belongs there too — it's part of AI gen behavior, not global tech config.

---

### ARCH-05 — Fallback triggers at CREATE step only

**Decision:** If the primary provider fails during the initial CREATE request (`/api/ai-generate` handler), the backend retries with the fallback provider. If the fallback also fails, the error is returned to the frontend. Mid-generation polling failures (Replicate job fails after being accepted) surface as errors — no automatic fallback at that stage.

**Rationale:** Simpler, no in-flight prediction management. Covers the most common failure mode (provider down/overloaded at request time). The guest can manually retry after a mid-generation failure.

---

### ARCH-06 — Duplicate ai-generation module: hard-blocked in flow builder

**Decision:** When an operator attempts to add a second `ai-generation` module to a flow, show a banner error ("Only one AI Generation module is allowed per flow") and block the addition. No handling needed in PipelineContext — `jumpToIndex` always targets first occurrence.

**Rationale:** Multiple instances would create ambiguous `jumpToIndex` behavior. Hard-blocking removes the ambiguity permanently.

---

### ARCH-07 — Form-after-AI-gen retry: accepted behavior

**Decision:** If the flow is configured `... → ai-generation → form → result`, a retry from the result screen jumps back to AI gen. After generation succeeds, `advance()` takes the guest to the form step — they must re-enter their info. This is documented and accepted.

**Rationale:** The standard Shell flow is `... → form → ai-generation → result` (form before AI gen). The re-entry case is an unusual configuration and the behavior is technically correct, if surprising. Handling it properly would require clearing and re-rendering form state, which is out of scope.

---

## Phase Plan


| Phase      | Focus                         | Key Items                                                                                 |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| V8-Phase 0 | Small bug fixes               | selectedTheme?.id fix, "Back to Home" reset fix                                           |
| V8-Phase 1 | AI gen decoupling             | ResultModule photo fallback                                                               |
| V8-Phase 2 | Fix broken retry in loading   | retryCount trigger in AiGenerationModule                                                  |
| V8-Phase 3 | True retry from result screen | jumpToIndex in PipelineContext, retry modal in ResultModule, flow builder duplicate guard |
| V8-Phase 4 | AI provider fallback          | Type change, dashboard dropdown, backend fallback logic                                   |


---

## What This Project Does NOT Cover

- Frame overlay as a separate module (frame stays inside AiGenerationModule)
- Form-after-AI-gen re-entry handling (accepted behavior, documented above)
- Session crash recovery (BACKLOG-P3 — recurring deferral)
- Mid-generation polling fallback (ARCH-05 — fallback at CREATE step only)
- QR / `guestPortalEnabled` dead flag resolution (BACKLOG-P2)
- Any other BACKLOG items not listed in this scope

