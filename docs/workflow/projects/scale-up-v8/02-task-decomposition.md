# scale-up-v8 — Task Decomposition

**Status:** Complete ✅ (2026-04-18)

---

## Verified Facts

Facts confirmed by reading the codebase — not inferred from filenames or prior docs.

| Fact | Source |
|------|--------|
| `AiGenerationModuleConfig.provider: 'replicate' \| 'google'` — primary provider is already per-module, NOT in TechConfig | `packages/types/src/module-config.ts:62` |
| `AiGenerationModuleConfig` has no `providerFallback` field yet | `packages/types/src/module-config.ts:58–68` |
| `ResultModuleConfig` has no `retryEnabled` as of V7 start — was added in TASK-2.3 | `packages/types/src/module-config.ts:76–83` |
| `handleRetry` resets `processedRef.current = false` but does NOT change any `useEffect` dep — retry never re-fires generation | `apps/frontend/src/modules/AiGenerationModule.tsx:294–299, 292` |
| `AiGenerationModule` already has `const { setSuppressInactivity, reset } = usePipeline()` — `reset` is available, just not used on the error "Back to Home" button | `apps/frontend/src/modules/AiGenerationModule.tsx:89` |
| "Back to Home" in error state calls `onBack` (one step back in pipeline), not `reset()` | `apps/frontend/src/modules/AiGenerationModule.tsx:368` |
| Both "Retry Result" and "Back to Home" in ResultModule call `setShowLeaveConfirm(true)` — functionally identical, both call `reset()` | `apps/frontend/src/modules/ResultModule.tsx:415–426` |
| `selectedTheme.id` at line 300 in ResultModule uses no optional chaining — `selectedTheme` is typed `{ id; label } \| undefined` | `apps/frontend/src/modules/ResultModule.tsx:86–91, 300` |
| `finalPhoto` is read as `outputs["finalPhoto"]` with no fallback to `originalPhoto` | `apps/frontend/src/modules/ResultModule.tsx:85` |
| `PipelineContext` has `advance`, `back`, `reset` — no `jumpTo` or `jumpToIndex` | `apps/frontend/src/contexts/PipelineContext.tsx:4–14` |
| `PipelineContext` stores `moduleOutputs` as `Record<string, unknown>` — individual keys can be deleted | `apps/frontend/src/contexts/PipelineContext.tsx:7, 22` |
| `api.ai-generate.ts` `resolveThemeConfig` returns `provider` from `aiModule.provider` — no fallback field read yet | `apps/web/src/routes/api.ai-generate.ts:66–71` |
| Google AI path in `api.ai-generate.ts` is `sync-then-store` (full generation inside the request, result stored in `ai_jobs` before responding) | `apps/web/src/routes/api.ai-generate.ts:148–208` |
| Replicate path uploads to Supabase temp storage, creates async prediction, returns `predictionId` | `apps/web/src/routes/api.ai-generate.ts:209–268` |
| Provider-specific error detection already exists (`isProviderOverload` check) in the catch block | `apps/web/src/routes/api.ai-generate.ts:293–308` |

---

## Phase 0 — Small Bug Fixes

### ~~TASK-0.1 — Fix `selectedTheme.id` TypeError in ResultModule~~ ✅

**Status:** ✅ Done
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/frontend/src/modules/ResultModule.tsx`

**What:**
Line 300 accesses `selectedTheme.id` without optional chaining. `selectedTheme` is typed `{ id: string; label: string } | undefined`. If a flow has no `theme-selection` module, `selectedTheme` is `undefined` and this throws at runtime during the `/api/photo` POST body construction.

**Change:**
```typescript
// Before (line 300)
selectedTheme: selectedTheme.id,

// After
selectedTheme: selectedTheme?.id ?? "",
```

This matches the existing pattern already used at line 246 (`selectedTheme?.id ?? ""`).

**Verification:**
1. Lint the file: `npx eslint apps/frontend/src/modules/ResultModule.tsx`
2. No TypeScript errors on `selectedTheme?.id`

---

### ~~TASK-0.2 — Fix "Back to Home" button in AiGenerationModule error state~~ ✅

**Status:** ✅ Done
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/frontend/src/modules/AiGenerationModule.tsx`

**What:**
The "Back to Home" button in the error state (line 368) calls `onBack`, which calls `back()` in PipelineContext — stepping back one module (to camera). The label implies going home but the behavior goes to camera. Fix: call `reset()` instead.

`reset` is already destructured at line 89:
```typescript
const { setSuppressInactivity, reset } = usePipeline();
```

**Change:**
```typescript
// Before (line 368)
onClick={onBack}

// After
onClick={reset}
```

**Verification:**
1. Run a photobooth session through to AI generation
2. Force an error (e.g. disconnect internet before generation completes)
3. Error state appears with "Try Again" and "Back to Home" buttons
4. Tap "Back to Home" → navigates to the welcome/splash screen (index 0), not the camera step

---

## Phase 1 — AI Gen Decoupling

### ~~TASK-1.1 — ResultModule: fall back to originalPhoto when finalPhoto is absent~~ ✅

**Status:** ✅ Done
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/frontend/src/modules/ResultModule.tsx`

**What:**
`ResultModule` currently reads `outputs["finalPhoto"]` (line 85) with no fallback. If the `ai-generation` module is not in the flow, `finalPhoto` is never written to `moduleOutputs` and the result screen renders no photo, the save effect skips (early return at line 229: `if (hasSaved.current || !finalPhoto)`), and download/print are broken.

Fix: fall back to `outputs["originalPhoto"]` if `finalPhoto` is absent. `originalPhoto` is the base64 string written by `CameraModule`.

**Change:**
```typescript
// Before (line 85)
const finalPhoto = outputs["finalPhoto"] as string | undefined;

// After
const finalPhoto = (outputs["finalPhoto"] ?? outputs["originalPhoto"]) as string | undefined;
```

No other changes needed — all downstream uses of `finalPhoto` in this file remain the same. The photo is saved, uploaded to Supabase, and printed exactly as before, just using the camera photo when no AI result exists.

**Verification:**
1. In the dashboard flow builder, create a test event with flow: `welcome → camera → result` (no ai-generation, no form)
2. Complete the flow on the kiosk
3. Result screen shows the raw camera photo ✅
4. "Saving your photo…" → "✓ Saved" completes without error ✅
5. Print and download buttons are functional ✅
6. Confirm the photo appears in Supabase Storage under `events/{eventId}/photos/`

---

## Phase 2 — Fix Broken Retry in AiGenerationModule

### ~~TASK-2.1 — Wire `retryCount` state to trigger re-generation on retry~~ ✅

**Status:** ✅ Done
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/frontend/src/modules/AiGenerationModule.tsx`

**What:**
`handleRetry` (line 294) sets `processedRef.current = false`, clears error state, and resets progress — but no `useEffect` dependency changes, so React never re-fires the generation effect. The UI resets (blank progress bar, no error shown) but zero new network requests are made.

**Fix:** Add a `retryCount` state. Include it in the `useEffect` dep array. Increment it in `handleRetry`.

**Step 1 — Add state** (after line 106, with the other state declarations):
```typescript
const [retryCount, setRetryCount] = useState(0);
```

**Step 2 — Add to useEffect deps** (line 292):
```typescript
// Before
}, [originalPhoto, selectedTheme]);

// After
}, [originalPhoto, selectedTheme, retryCount]);
```

**Step 3 — Increment in handleRetry** (line 294–299):
```typescript
const handleRetry = () => {
  setError(null);
  setProgress(0);
  setShowCancelButton(false);
  processedRef.current = false;
  setRetryCount((c) => c + 1); // add this line
};
```

**Verification:**
1. Run a photobooth session to the AI generation step
2. Force an error (disconnect network, wait for timeout, or observe a real API error)
3. Error state shows "Try Again" and "Back to Home"
4. Tap "Try Again" → progress bar resets to 0 and immediately starts advancing → network request to `/api/ai-generate` is made (verify in browser DevTools / network tab)
5. If network is reconnected, generation completes successfully

---

## Phase 3 — True Retry from Result Screen

### ~~TASK-3.1 — Add `jumpToIndex` to PipelineContext~~ ✅

**Status:** ✅ Done
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/frontend/src/contexts/PipelineContext.tsx`

**What:**
Add `jumpToIndex(index: number)` to `PipelineContext`. It:
1. Sets `currentIndex` to `index`
2. Removes `finalPhoto` from `moduleOutputs` (stale result gone; new generation will write a fresh one via `onComplete`)

All other outputs (`originalPhoto`, `selectedTheme`, `userInfo`, `sessionId`, etc.) are preserved.

**Step 1 — Add to interface:**
```typescript
interface PipelineContextType {
  // ... existing fields ...
  jumpToIndex: (index: number) => void;
}
```

**Step 2 — Implement** (add alongside `back` and `reset` callbacks):
```typescript
const jumpToIndex = useCallback((index: number) => {
  setModuleOutputs((prev) => {
    const next = { ...prev };
    delete next["finalPhoto"];
    return next;
  });
  setCurrentIndex(index);
}, []);
```

**Step 3 — Expose in provider value:**
```typescript
<PipelineContext.Provider
  value={{
    // ... existing values ...
    jumpToIndex,
  }}
>
```

**Verification:**
- TypeScript compiles without errors (`pnpm wb test` or tsc check)
- `jumpToIndex` is callable from any component that calls `usePipeline()`

---

### ~~TASK-3.2 — Wire retry button in ResultModule to `jumpToIndex`~~ ✅

**Status:** ✅ Done
**Risk:** Medium (touches the result save flow and modal state)
**Depends on:** TASK-3.1
**Files touched:** `apps/frontend/src/modules/ResultModule.tsx`

**What:**
Replace the retry button's current behavior (calls `setShowLeaveConfirm(true)` — identical to "Back to Home") with a dedicated lightweight confirmation modal and `jumpToIndex` call.

**Step 1 — Add state** (alongside other state declarations):
```typescript
const [showRetryConfirm, setShowRetryConfirm] = useState(false);
```

**Step 2 — Compute AI gen index** (after the existing `outputs` destructuring):
```typescript
const aiGenIndex = eventConfig.moduleFlow.findIndex(
  (m) => m.moduleId === "ai-generation",
);
```

Note: `eventConfig` is already available via `const { config: eventConfig, ... } = useEventConfig()` at line 36.

**Step 3 — Import `jumpToIndex` from pipeline:**
```typescript
const { reset, setSuppressInactivity, jumpToIndex } = usePipeline();
```

**Step 4 — Change retry button click handler** (line 415–419):
```typescript
// Before
{retryEnabled && (
  <button
    type="button"
    className="..."
    onClick={() => setShowLeaveConfirm(true)}
  >
    {retryButtonEl.copy}
  </button>
)}

// After
{retryEnabled && aiGenIndex >= 0 && (
  <button
    type="button"
    className="..."
    onClick={() => setShowRetryConfirm(true)}
  >
    {retryButtonEl.copy}
  </button>
)}
```

**Step 5 — Remove the TODO comment** (line 410–411) — the behavior is now implemented.

**Step 6 — Add the retry confirmation modal** (alongside the existing `showLeaveConfirm` modal, at the bottom of the return):
```tsx
{showRetryConfirm && (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
    <div className="bg-primary rounded-2xl p-16 mx-12 flex flex-col items-center gap-10 shadow-2xl">
      <p className="text-5xl font-bold text-white text-center leading-tight">
        Regenerate your photo?
      </p>
      <p className="text-4xl text-white/70 text-center">
        Your current result will be replaced.
      </p>
      <div className="grid grid-cols-2 gap-8 w-full mt-4">
        <button
          type="button"
          className="px-8 py-6 bg-white text-secondary text-4xl rounded-xl font-semibold cursor-pointer select-none"
          onClick={() => setShowRetryConfirm(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="px-8 py-6 bg-tertiary text-white text-4xl rounded-xl font-semibold cursor-pointer select-none"
          onClick={() => jumpToIndex(aiGenIndex)}
        >
          Regenerate
        </button>
      </div>
    </div>
  </div>
)}
```

**Behavior summary after this task:**
- "Retry Result" → lightweight "Regenerate?" modal → confirm → `jumpToIndex(aiGenIndex)` → `AiGenerationModule` remounts → `processedRef.current` is `false` (new instance) → generation starts automatically
- "Back to Home" → existing "Leave anyway?" modal → confirm → `reset()` — unchanged
- If `retryEnabled` is `true` but `aiGenIndex` is `-1` (no AI gen in flow): retry button does not render — this is the correct guard for mis-configured flows

**Verification:**
1. Event config: flow with `welcome → theme-selection → camera → ai-generation → result`, `retryEnabled: true`
2. Complete full flow through to result screen
3. Tap "Retry Result" → lightweight "Regenerate your photo?" modal appears ✅
4. Tap "Cancel" → modal closes, result screen remains unchanged ✅
5. Tap "Retry Result" again → "Regenerate" → transitions to AI generation screen ✅
6. Generation completes → result screen shows new photo ✅
7. Guest's camera photo and selected theme are preserved (generation uses same inputs) ✅
8. Event config: flow without `ai-generation` → retry button is not visible ✅

---

### ~~TASK-3.3 — Dashboard: hard-block adding a second ai-generation module~~ ✅

**Status:** ✅ Done
**Risk:** Low
**Depends on:** Nothing (independent dashboard change)
**Files touched:** `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**What:**
Read the flow builder code fully before touching it to understand how modules are added. Find the handler that appends a new module to the `moduleFlow` array. Before appending, check if a module with `moduleId === 'ai-generation'` already exists. If so, set an error state and show a banner: *"Only one AI Generation module is allowed per flow."* Do not append the module.

**Implementation note:** The exact location of the "add module" handler must be read first. Look for where `moduleFlow` is appended to in the component — it will be a `setModuleFlow(prev => [...prev, newModule])` or similar pattern. Add the guard there.

**Error display:** Use the same banner/toast pattern already established in this file for other validation errors (e.g. the printer name validation from TASK-2.2 in V7). Do not introduce a new error pattern.

**Verification:**
1. Open flow builder for any event
2. Add one `ai-generation` module to the flow → succeeds ✅
3. Attempt to add a second `ai-generation` module → banner appears: "Only one AI Generation module is allowed per flow" ✅
4. Second module is NOT added to the flow ✅
5. All other module types can still be added multiple times without restriction ✅

---

## Phase 4 — AI Provider Fallback Chain

### ~~TASK-4.1 — Add `providerFallback` to `AiGenerationModuleConfig` type~~ ✅

**Status:** ✅ Done
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `packages/types/src/module-config.ts`

**What:**
Add an optional `providerFallback` field to `AiGenerationModuleConfig`. It is optional — existing configs without it continue to work (no fallback behavior, which is the current state).

**Change** (line 58–68):
```typescript
export interface AiGenerationModuleConfig extends BaseModuleConfig {
  moduleId: 'ai-generation'
  position: 'post-photo'
  outputKey: 'finalPhoto'
  provider: 'replicate' | 'google'
  providerFallback?: 'replicate' | 'google'  // add this line
  themes: Array<AiThemeConfig>
  slideshowItems?: {
    imageUrl?: string
    caption?: string
  }[]
}
```

**Verification:**
- TypeScript compiles across both `apps/frontend` and `apps/web`
- No existing config reads break (field is optional, backwards compatible)

---

### ~~TASK-4.2 — Dashboard: add fallback provider dropdown in AI gen module config~~ ✅

**Status:** ✅ Done
**Risk:** Low
**Depends on:** TASK-4.1
**Files touched:** `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx`

**What:**
Read the AI gen module config panel in the flow builder fully before touching it. Find where the primary `provider` field is rendered (a dropdown or radio for `'replicate' | 'google'`). Add a second dropdown directly below it: **"Fallback Provider"**.

Options:
- "None" (value: `undefined` — removes the field from config)
- "Replicate" (value: `'replicate'`)
- "Google" (value: `'google'`)

The fallback dropdown should **not** be gated on the primary — an operator can technically set fallback to the same value as primary (that's harmless; the backend will just try the same provider twice, which is still better than no retry). Don't add validation for this in V8.

Persist the value into the module config object the same way `provider` is persisted. On save, the `providerFallback` field is included in the `moduleFlow` array written to `event_configs`.

**Verification:**
1. Open flow builder → AI gen module config panel
2. "Fallback Provider" dropdown visible with three options: None, Replicate, Google ✅
3. Select "Google" → save → inspect `event_configs.config_json` in Supabase → AI gen module has `providerFallback: "google"` ✅
4. Select "None" → save → `providerFallback` field absent from module config ✅

---

### ~~TASK-4.3 — Backend: fallback at CREATE step in `api.ai-generate.ts`~~ ✅

**Status:** ✅ Done
**Risk:** Medium (touches core AI generation path)
**Depends on:** TASK-4.1
**Files touched:** `apps/web/src/routes/api.ai-generate.ts`

**What:**
Read the full file before touching it (already done in planning, but re-read before implementing). The fallback wraps the provider-specific generation block so that if the primary throws, the backend retries with the fallback provider.

**Step 1 — Expose `providerFallback` from `resolveThemeConfig`:**

The function currently returns `provider`. Also return `providerFallback`:
```typescript
// In the return (line 66–71), change:
return {
  ok: true,
  provider: aiModule.provider,
  providerFallback: aiModule.providerFallback,  // add this
  templateUrl: themeConfig.templateImageUrl,
  prompt: themeConfig.prompt,
}
```

Update the `ResolvedThemeConfig` type accordingly:
```typescript
type ResolvedThemeConfig =
  | {
      ok: true
      provider: 'replicate' | 'google'
      providerFallback?: 'replicate' | 'google'  // add this
      templateUrl: string
      prompt: string
    }
  | { ok: false; status: number; error: string }
```

**Step 2 — Extract provider-specific generation into a helper function:**

The main handler has two large `if (provider === 'google') { ... } else { ... }` blocks (lines 148–268). Extract this into an async function `runGeneration(provider, ...)` that can be called for both primary and fallback attempts. This avoids duplicating the blocks.

```typescript
async function runGeneration(
  provider: 'replicate' | 'google',
  params: {
    userPhotoBase64: string
    theme: string
    templateUrl: string
    prompt: string
    requestStart: number
  },
): Promise<{ predictionId: string; tempPath: string }> {
  // Move the existing if/else provider blocks here
  // Return { predictionId, tempPath }
  // Throws on failure (callers catch)
}
```

**Step 3 — Call primary, then fallback on failure:**

In the main handler, replace the current provider block with:
```typescript
let predictionId: string
let tempPath = ''

try {
  const result = await runGeneration(provider, { userPhotoBase64, theme, templateUrl, prompt, requestStart })
  predictionId = result.predictionId
  tempPath = result.tempPath
} catch (primaryErr) {
  if (providerFallback && providerFallback !== provider) {
    console.warn(
      `[ai-generate] Primary provider '${provider}' failed — retrying with fallback '${providerFallback}':`,
      primaryErr instanceof Error ? primaryErr.message : primaryErr,
    )
    try {
      const fallbackResult = await runGeneration(providerFallback, { userPhotoBase64, theme, templateUrl, prompt, requestStart })
      predictionId = fallbackResult.predictionId
      tempPath = fallbackResult.tempPath
      // Surface which provider ended up serving the request
      console.log(`[ai-generate] Fallback provider '${providerFallback}' succeeded`)
    } catch (fallbackErr) {
      // Both failed — re-throw the fallback error (more recent, likely more relevant)
      throw fallbackErr
    }
  } else {
    throw primaryErr
  }
}
```

**Important:** The `tempPath` cleanup in the outer `catch` block (lines 280–289) must still fire on final failure. Since `tempPath` is declared in the outer scope before the try block, this already works correctly.

**Step 4 — Include `provider` used in response:**

The current response already returns `provider` (line 276: `return json({ predictionId, tempPath, provider })`). After the refactor, `provider` should reflect which provider actually succeeded (primary or fallback). Pass the winning provider through `runGeneration`'s return value.

**Verification:**
1. Set up an event with `provider: 'replicate'`, `providerFallback: 'google'`
2. Complete a normal session → Replicate generates → no fallback triggered (verify in server logs) ✅
3. Simulate Replicate failure (e.g. invalid API key, or mock a throw) → Google fallback is triggered → generation succeeds → kiosk receives result ✅
4. Simulate both providers failing → error returned to kiosk → error state shown on loading screen ✅
5. Event with no `providerFallback` → primary failure → error returned immediately (no fallback attempt) ✅
6. Replicate path still works end-to-end with no fallback configured (regression check) ✅
7. Google path still works end-to-end with no fallback configured (regression check) ✅

---

## Design Notes — Constraints to Keep in Mind

### Google AI is synchronous on the backend

The Google AI path (`api.ai-generate.ts:148–208`) runs the full generation synchronously inside the HTTP request before responding. This is intentional (Cloudflare Workers kill un-awaited promises). When extracting `runGeneration` in TASK-4.3, this sync behavior must be preserved — do not attempt to make Google async.

### `processedRef` resets on AiGenerationModule remount

When `jumpToIndex` navigates back to the AI gen step, the entire module component unmounts and remounts. `processedRef` is a `useRef` initialized to `false` — it resets on remount automatically. There is no need to explicitly reset it in `jumpToIndex` or `handleRetry`. Generation will fire on the next `useEffect` run.

### `retryEnabled` in ResultModuleConfig defaults to `false`

`retryEnabled?: boolean` with `undefined` treated as `false` (opt-in). No change needed — this was the V7 decision.

### `hasSaved` ref in ResultModule resets on remount

When the guest retries and comes back to result after a new generation, `ResultModule` remounts (new component instance), `hasSaved.current` is `false` again. The new result is saved to local + Supabase cleanly, replacing the previous one in storage (same `photoFileName` — same UUID and same name, since both are `useMemo` values that persist across the session via `moduleOutputs`). This is correct behavior — one result record per session.

Wait — `photoUuid` is `useMemo(() => crypto.randomUUID(), [])`. On remount, `useMemo` re-runs because it's a new component instance. So the retry will generate a **new UUID** and a new filename. The old file remains in Supabase storage (orphaned). This is acceptable for V8 — no cleanup needed. Note it here so future sessions analytics are not confused.
