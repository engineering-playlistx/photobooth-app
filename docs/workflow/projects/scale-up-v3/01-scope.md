# scale-up-v3 — Project Scope

**Milestone:** V3 — Remote Asset Management + Carryover
**Status:** 🔜 Planning
**Depends on:** `scale-up-v2` complete ✅

---

## What This Project Delivers

Operators can upload and manage per-event, per-module assets (frames, AI templates, backgrounds, logos) directly from the dashboard — no Electron build changes, no env var edits, no redeployment required. The kiosk reads all asset URLs from `EventConfig` at session start.

One sentence: **This project delivers remote asset management via the dashboard and resolves V2 carryover items, moving the V3 milestone forward by enabling fully code-free event setup.**

---

## Definition of Done

- Dashboard has an asset upload UI: per-event, per-module uploads for frames, AI templates, module backgrounds, and logos
- Kiosk reads frame and background URLs from `EventConfig` — no asset is baked into the Electron build or set via env var
- `AiGenerationModuleConfig` themes reference template URLs stored in Supabase (not in `.env`)
- Kiosk renders `branding.screenBackgrounds` per module (currently ignored)
- `submit-photo.usecase.ts` fallback `?? 'evt_shell_001'` is removed — multi-event is clean
- All V2 carryover items (DATA-01, DATA-02, SEC-01, CODE-03, GAP-04, CARRY-03) are resolved or explicitly re-deferred with rationale

---

## Architecture Decisions (Resolved)

### A — Asset storage layout

**Decision: Assets are organized under `photobooth-bucket/events/<eventId>/` with one subfolder per asset type.**

```
photobooth-bucket/
  events/<eventId>/
    frames/        ← frame overlay PNGs (one per theme)
    templates/     ← AI face-swap template images (one per theme)
    backgrounds/   ← module background images (one per module slot)
    logos/         ← event branding logo
  temp/            ← transient AI generation uploads (unchanged)
  public/          ← legacy path (unchanged, do not break existing URLs)
```

Files are uploaded with deterministic names (e.g. `frame-f1.png`, `bg-camera.png`) so re-uploading replaces in-place without breaking existing config references. Public URLs are stored directly in `EventConfig` JSON — no lookup indirection.

---

### B — How assets enter `EventConfig`

**Decision: Asset URLs are stored directly in `EventConfig` fields that already exist in the type system. The upload UI writes these URLs into `event_configs.config_json` via a PATCH to the config API.**

Fields in the type system that are currently stubs or hardcoded:

| Field | Current state | V3 state |
|-------|---------------|----------|
| `AiThemeConfig.templateImageUrl` | Set from env var at request time | Stored in DB, read from config |
| `AiThemeConfig.frameImageUrl` | Baked into Electron build (`/images/frame-*.png`) | Stored in DB, read from config |
| `ThemeSelectionModuleConfig.themes[].previewImageUrl` | Baked into Electron build | Stored in DB, read from config |
| `branding.screenBackgrounds` | Typed but kiosk ignores it | Kiosk applies per-module background |
| `branding.logoUrl` | Typed but kiosk may not apply | Kiosk applies where relevant |

No new top-level `EventConfig` fields are needed — the type system already has the right shape from V2.

---

### C — Kiosk per-module background rendering

**Decision: Each module reads `branding.screenBackgrounds[moduleId]` from `EventConfig` (via `useEventConfig()`) and applies it as a CSS background to its root container. A shared hook `useModuleBackground(moduleId)` is introduced to encapsulate this.**

```typescript
// Proposed hook (apps/frontend/src/hooks/useModuleBackground.ts)
function useModuleBackground(moduleId: string): string | undefined {
  const { config } = useEventConfig();
  return config.branding.screenBackgrounds?.[moduleId];
}
```

Each module component that has a full-screen background calls the hook and applies the result as a `style={{ backgroundImage: ... }}` or Tailwind `bg-[url(...)]`. Modules with no background entry fall back to the existing solid color.

---

### D — Asset upload UI placement in dashboard

**Decision: Asset uploads live in the event detail page, under an "Assets" tab alongside "Config" and "Guests". Upload is per-asset-slot (one uploader per frame/template/background slot), not a generic file browser.**

Each slot shows:
- Current asset thumbnail (or a placeholder if not set)
- "Upload new" button → file picker → uploads to `photobooth-bucket/events/<eventId>/<type>/` → writes public URL back to `EventConfig` via PATCH

This keeps asset management co-located with event config, not a separate admin section.

---

### E — Shared `packages/types` workspace (CARRY-03)

**Decision: Create `packages/types` as a pnpm workspace package in V3-Phase 1 (carryover). Both `apps/web` and `apps/frontend` import from `@photobooth/types`. The `// MIRRORED` comment pattern is removed.**

This is a prerequisite for V3 asset type additions — adding new fields to a mirrored file is the pattern that will break first.

---

## Rough Phase Plan

| Phase | Focus | Backlog items |
|-------|-------|---------------|
| V3-Phase 1 | Carryover fixes | CARRY-03, DATA-01, DATA-02, SEC-01, CODE-03, GAP-04 |
| V3-Phase 2 | Asset type system + storage wiring | Move template URLs from env → config; move frame paths from build → config; update `AiGenerationService` to read from config |
| V3-Phase 3 | Dashboard asset upload UI | Upload slots per event per module; PATCH to config API; thumbnail preview |
| V3-Phase 4 | Kiosk per-module background rendering | `useModuleBackground` hook; apply in each module component |

Carryover-first ordering is intentional: Phase 1 items are small, bounded, and unblock CARRY-03 (shared types) which is a prerequisite for Phase 2 type additions.

---

## What This Project Does NOT Cover

These are V4 scope (do not plan them in scale-up-v3):

- `organizations` table, multi-tenancy, or client hierarchy
- Client dashboard access (clients log in and see their own event)
- Automated reporting or scheduled email delivery
- Form field builder (custom fields beyond name/email/phone)
- Guest portal V2 (social share, multiple result items, brand CTA)
- AI provider fallback chain (CARRY-01) — deferred again; requires `ai_jobs` table and API contract change
- Config version history / rollback snapshots (CARRY-02) — deferred again; low urgency while one operator manages configs
- Electron auto-update (GAP-02)
- Operator-facing error dashboard (GAP-03)
- Session crash recovery (GAP-01, GAP-05)
