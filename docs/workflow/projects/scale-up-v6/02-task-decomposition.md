# scale-up-v6 — Task Decomposition

**Status:** Draft 🔜

---

## Verified Facts

Facts confirmed by reading the codebase — not inferred from filenames or prior docs.

| Fact | Source |
|------|--------|
| `event_configs` schema: `event_id TEXT PK, config_json JSONB, updated_at TIMESTAMPTZ` | `apps/web/supabase/migrations/20260331000000_create_event_configs.sql` |
| `createEvent` server fn: inserts into `events` only — no `event_configs` seed | `apps/web/src/routes/dashboard/_layout.index.tsx:43–59` |
| Config page loader: `.from('event_configs').select().eq('event_id', eventId).single()` — throws on no row | `apps/web/src/routes/dashboard/_layout.events.$eventId.config.tsx:13–25` |
| Flow page loader: same `.single()` pattern — throws on no row | `apps/web/src/routes/dashboard/_layout.events.$eventId.flow.tsx:26–36` |
| `ThemeSelectionModuleConfig.themes`: `Array<{ id, label, previewImageUrl }>` | `packages/types/src/module-config.ts:51–55` |
| `ThemeSelectionModule.handleSelectTheme` output: `{ selectedTheme: { id, label } }` | `apps/frontend/src/modules/ThemeSelectionModule.tsx:31–35` |
| PipelineRenderer: advances via `handleComplete(output?)` → `advance(output)` | `apps/frontend/src/components/PipelineRenderer.tsx:31–61` |
| PipelineRenderer reads current module as `config.moduleFlow[currentIndex]` | `apps/frontend/src/components/PipelineRenderer.tsx:26` |

---

## Phase 0 — Critical Bug Fixes

### TASK-0.1 — Seed default `event_configs` row on event creation

**Status:** Pending
**Risk:** Low
**Depends on:** Nothing
**Files touched:** `apps/web/src/routes/dashboard/_layout.index.tsx`

**What:**
In `createEvent` (the `createServerFn` at line 43), after the `events` insert succeeds (line 51–58), immediately insert a default `event_configs` row for the new event ID.

The default config to insert:
```typescript
const defaultConfig = {
  eventId: id,
  branding: {
    logoUrl: null,
    primaryColor: '#ffffff',
    secondaryColor: '#000000',
    fontFamily: null,
    backgroundUrl: null,
    portalHeading: null,
    screenBackgrounds: null,
  },
  moduleFlow: [],
  formFields: { name: true, email: true, phone: true, consent: true },
  techConfig: {
    printerName: '',
    inactivityTimeoutSeconds: 60,
    guestPortalEnabled: false,
  },
}
```

After the `events` insert, add:
```typescript
const { error: configError } = await admin
  .from('event_configs')
  .insert({ event_id: id, config_json: defaultConfig })
if (configError) throw new Error(configError.message)
```

If the config insert fails, the whole `createEvent` call throws — no orphaned event without a config.

**Verification:**
1. Deploy or run `pnpm wb dev`
2. Navigate to the dashboard → create a new event
3. Click into the new event → navigate to `/config` → page loads without 500
4. Navigate to `/flow` → page loads without 500
5. Navigate to `/assets` → no regression

---

### TASK-0.2 — Repair migration: seed default config for existing broken events

**Status:** Pending
**Risk:** Low
**Depends on:** Nothing (independent of TASK-0.1)
**Files touched:** `apps/web/supabase/migrations/20260413100000_repair_missing_event_configs.sql`

**What:**
Write a SQL migration that inserts a default `event_configs` row for every event that has no corresponding config row. Uses a `LEFT JOIN ... WHERE IS NULL` pattern — safe to run on a live or empty database, and idempotent.

Migration file to create:

```sql
-- TASK-0.2: Repair missing event_configs rows for events created via V5 New Event form.
--
-- Safe to run on live database. Idempotent (running twice produces no duplicates).

INSERT INTO event_configs (event_id, config_json)
SELECT
  e.id,
  jsonb_build_object(
    'eventId',      e.id,
    'branding',     jsonb_build_object(
                      'logoUrl',           null,
                      'primaryColor',      '#ffffff',
                      'secondaryColor',    '#000000',
                      'fontFamily',        null,
                      'backgroundUrl',     null,
                      'portalHeading',     null,
                      'screenBackgrounds', null
                    ),
    'moduleFlow',   '[]'::jsonb,
    'formFields',   jsonb_build_object('name', true, 'email', true, 'phone', true, 'consent', true),
    'techConfig',   jsonb_build_object(
                      'printerName',                '',
                      'inactivityTimeoutSeconds',   60,
                      'guestPortalEnabled',          false
                    )
  )
FROM events e
LEFT JOIN event_configs ec ON ec.event_id = e.id
WHERE ec.event_id IS NULL;
```

> **Manual step required before marking done:** Run this migration in the Supabase SQL editor. Confirm with:
> ```sql
> SELECT COUNT(*) FROM events e
> LEFT JOIN event_configs ec ON ec.event_id = e.id
> WHERE ec.event_id IS NULL;
> ```
> Should return 0.

**Verification:**
1. Run the migration SQL in the Supabase SQL editor
2. Run the confirmation query above → returns 0
3. Navigate to any previously broken event's config page → loads without 500
4. Commit the migration file to keep schema history in sync

---

## Phase 1 — Per-Module Conditional Behavior

### TASK-1.1 — Auto-skip theme-selection when exactly 1 theme is configured

**Status:** Pending
**Risk:** Medium (touches core kiosk pipeline)
**Depends on:** Nothing (frontend-only change)
**Files touched:** `apps/frontend/src/components/PipelineRenderer.tsx`

**What:**
In `PipelineRenderer.tsx`, add a `useLayoutEffect` that fires whenever `currentIndex` changes. If the current module is `theme-selection` and `themes.length === 1`, immediately call `handleComplete` with the single theme pre-selected — skipping the UI.

`useLayoutEffect` (not `useEffect`) is required here: `useEffect` fires after the browser paints, which would cause the theme-selection UI to flash for one frame before advancing. `useLayoutEffect` fires synchronously before paint, preventing any visible flash.

The output shape must match what `ThemeSelectionModule.handleSelectTheme` produces: `{ selectedTheme: { id, label } }`.

**Before writing:** Check whether `PipelineRenderer.tsx` already imports from `@photobooth/types`. If not, add the type import.

Implementation:

```typescript
import { useLayoutEffect } from 'react'
import type { ThemeSelectionModuleConfig } from '@photobooth/types'

// Inside PipelineRenderer, after the existing handleComplete useCallback:
// useLayoutEffect fires before paint — prevents theme-selection flash on single-theme events.
// [currentIndex] dep is intentional: must fire once per step, not on handleComplete ref changes.
// eslint-disable-next-line react-hooks/exhaustive-deps
useLayoutEffect(() => {
  if (
    currentModule?.moduleId === 'theme-selection' &&
    (currentModule as ThemeSelectionModuleConfig).themes.length === 1
  ) {
    const singleTheme = (currentModule as ThemeSelectionModuleConfig).themes[0]
    handleComplete({ selectedTheme: { id: singleTheme.id, label: singleTheme.label } })
  }
}, [currentIndex])
```

**Why `react-hooks/exhaustive-deps` suppression is acceptable here:** The effect must fire exactly once per module step, not every time `handleComplete` or `currentModule` reference changes. Including them in the deps array would cause infinite re-execution since `handleComplete` is recreated whenever `currentIndex` changes (it's in its `useCallback` deps). This is an intentional one-per-step trigger. The suppression comment is placed above the hook, not inline, so it is clear and isolated.

**Verification:**
1. In Supabase SQL editor, modify an event's `config_json.moduleFlow` so the `theme-selection` module has exactly 1 theme in its `themes` array
2. Open the kiosk with that event → tap "Start" on the welcome screen
3. The theme-selection screen does not appear → the kiosk advances directly to the next module (camera)
4. The theme is pre-selected in `moduleOutputs` (verifiable in the AI generation step, which uses the selected theme)
5. In a separate test: modify the same event back to 2 themes → theme-selection screen appears normally (regression check)

---

## Design Review — Issues Found

> This section tracks issues identified during planning review (HOW-WE-WORK.md Step 3). Updated after creator decisions in Step 4.

### Issue 1 — ESLint suppression in TASK-1.1 (`react-hooks/exhaustive-deps`)

**Type:** Risk
**Task:** TASK-1.1
**Resolution:** Using `useLayoutEffect` with `[currentIndex]` dep and `eslint-disable-next-line` above the hook. The reason for suppression (prevent infinite re-execution caused by `handleComplete` being in `useCallback`'s deps) is explained inline. `useLayoutEffect` was chosen over `useEffect` to prevent a one-frame flash of the theme-selection UI before advancing. Accepted — the suppression is intentional and documented.

### Issue 2 — Open question: other per-module conditional behaviors

**Type:** Design hole
**Task:** N/A (future planning)
**Issue:** Creator said "we also will customize per module. the most urgent one is to skip AI theme selection..." — implying there are other per-module customizations in mind that weren't specified. These are not in V6 scope but should be captured for V7 backlog once defined.
**Recommendation:** After V6 ships, have a dedicated session to enumerate the remaining per-module behaviors the creator has in mind. Do not speculate and pre-implement them.

### Issue 3 — TASK-0.1 error atomicity

**Type:** Risk
**Task:** TASK-0.1
**Issue:** If the `event_configs` insert fails after the `events` insert succeeds, we have an orphaned event with no config. The current implementation throws, which means the user gets an error but the event row exists in the database.
**Recommendation:** This is acceptable for V6 given risk tolerance 2/5. The operator can either delete the event manually or trigger the repair migration (TASK-0.2). A full DB transaction would require a stored procedure, which is over-engineered for this case. Accept and document in code.
