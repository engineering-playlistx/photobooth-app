# CLAUDE.md — Shell Photobooth

This file gives Claude Code the context needed to work effectively in this repo.

---

## Project Overview

**Shell Photobooth** is a **managed, AI-powered photobooth platform** sold as a service to brands and marketing agencies. The current deployment serves Shell racing events (Pit Crew / MotoGP / F1 face-swap), but the product is actively being scaled into a multi-client SaaS platform where each client gets a fully configurable, branded kiosk experience.

The app is **offline-first**: all photos are saved locally via SQLite and the filesystem. Cloud delivery (Supabase storage) is layered on top. **Supabase is the source of truth** — SQLite is an offline backup only. If they ever differ, Supabase wins.

**Current state:** No kiosk is deployed in the field and no backend is running. Safe to modify without breaking live events.

---

## Migration Status

**V1 complete ✅ (2026-04-01).** Config-driven, multi-client ready.
**V2 complete ✅ (2026-04-02).** Modular pipeline, flow builder, session model, Mini Quiz.
**V3 complete ✅ (2026-04-05).** Remote asset management + carryover fixes.
**V4 complete ✅ (2026-04-10).** Platform polish + deep customization.
**V5 complete ✅ (2026-04-13).** Multi-tenant foundation — organizations layer.
**V6 complete ✅ (2026-04-13).** Multi-event seamlessness — event creation bug fix + per-module conditional behavior.

### Workflow Documents

| Document | Contents |
|----------|----------|
| `docs/workflow/MASTER-PLAN.md` | North-star: product vision, milestones, project registry, scope rules |
| `docs/workflow/HOW-WE-WORK.md` | Execution methodology: sessions, verification, git, prompting |
| `docs/workflow/projects/scale-up-v1/` | V1 migration — COMPLETE ✅ |
| `docs/workflow/projects/scale-up-v2/` | V2 modular pipeline — COMPLETE ✅ |
| `docs/workflow/projects/scale-up-v3/` | V3 remote asset management — COMPLETE ✅ |
| `docs/workflow/projects/scale-up-v4/` | V4 platform polish + deep customization — COMPLETE ✅ |
| `docs/workflow/projects/scale-up-v5/` | V5 multi-tenant foundation — COMPLETE ✅ |
| `docs/workflow/projects/scale-up-v6/` | V6 multi-event seamlessness — COMPLETE ✅ |
| `docs/workflow/projects/[parked]-auto-update/` | Electron auto-update — ⏸️ PARKED (blocked on Windows code signing) |

### V6 Project Docs (`docs/workflow/projects/scale-up-v6/`)

| File | Contents |
|------|----------|
| `00-creator-feedback.md` | Input for V6 planning |
| `01-backlog.md` | Backlog items scoped into V6 |
| `01-scope.md` | V6 scope statement, definition of done, architecture decisions |
| `02-task-decomposition.md` | Completed tasks (phases 0–1) + additional fixes logged |

---

## Known Active Bugs

| Bug | File | Status |
|-----|------|--------|
| ~~`DROP TABLE IF EXISTS photo_results` runs on every app start~~ | `sqlite.ts` | ✅ Fixed (TASK-0.1) |
| ~~`Replicate` client initialized even when `AI_PROVIDER === 'google'`~~ | `ai-generation.service.ts` | ✅ Fixed (TASK-0.2) |
| ~~No inactivity timeout on kiosk~~ | `useInactivityTimeout.ts` | ✅ Fixed (TASK-0.3) |
| ~~New event flow builder empty / validation errors adding modules~~ | `_layout.index.tsx` | ✅ Fixed (V6 FIX-A) |
| ~~`kiosk.config.json` first-save clobbers `apiBaseUrl`/`apiClientKey`~~ | `main.ts` | ✅ Fixed (V6 FIX-B) |
| ~~Config refresh after event-ID change serves stale config~~ | `renderer.tsx` | ✅ Fixed (V6 FIX-C) |
| ~~AI generation status 500 when `AI_PROVIDER` env var mismatches event config~~ | `api.ai-generate-status.ts` | ✅ Fixed (V6 FIX-D) |
| ~~ResultModule stuck in "saving" when Form module absent~~ | `ResultModule.tsx` | ✅ Fixed (V6 FIX-E) |
| ~~Inactivity timer resets guest mid-save on result page~~ | `ResultModule.tsx` | ✅ Fixed (V6 FIX-F) |

---

## Development Workflow

Follow this for every task. Full rationale in `docs/workflow/HOW-WE-WORK.md`.

### Per-task checklist

1. **Read before touching** — read every file listed in the task before making changes
2. **Lint changed files** (Layer 1):
   ```bash
   git diff --name-only | grep -E '\.(ts|tsx)$' | xargs npx eslint
   ```
   Fix any new errors before moving on. Do not use `pnpm lint` — it fails on pre-existing issues.
3. **Run tests** (Layer 2) — required when new business logic is added:
   ```bash
   pnpm wb test   # for apps/web changes
   ```
   Use `vi.resetModules()` + dynamic `import()` for modules with env-var-driven constants.
4. **Manual smoke test** (Layer 3) — follow the exact steps in the task's **Verification** section
5. **Commit** — one commit per completed task:
   ```bash
   git add <only the files this task touched>
   git commit -m "fix(phase-N): TASK-X.Y — <what changed>"
   ```
   Never batch multiple tasks into one commit. Never commit a broken build.
6. **Mark done** — update the active project's task decomposition doc: strikethrough the task heading + ✅

### Commit conventions

| Type | When |
|------|------|
| `fix(phase-N):` | Bug fixes and hotfixes (Phase 0 tasks) |
| `feat(phase-N):` | New features (Phase 1+ tasks) |
| `chore:` | Formatting, tooling, doc-only changes |
| `test:` | Test-only changes |

Separate formatting-only changes (e.g. after `pnpm lint:fix`) into their own `chore: apply prettier formatting` commit — do not mix with logic changes.

---

## Core Constraints & Invariants

These decisions are settled. All future code must respect them.

**Data**
- Supabase is source of truth. SQLite is offline backup only.
- Partial session saves are allowed (internet can drop mid-event), but partial state must be detectable and recoverable.
- No GDPR-style deletion requirement — retain data as long as storage allows.
- Starting fresh with a new Supabase project — old `public/` photo paths do not need to be migrated.

**Guest Experience**
- AI generation must complete within **60 seconds** or show an error with retry.
- If the backend is unreachable during AI generation, "sorry, try again" is acceptable.
- Once a result is generated, if printing is enabled for the event, it **must** print — printing failures must surface to the operator.
- Guest flow sequence is configurable per event (steps can be added, removed, or reordered).

**Architecture**
- All kiosks at a given time must run the **same app version** — no mixed-version deployments.
- Simultaneous events (multiple clients at once) must be supported — every entity is scoped to an `eventId`.
- TypeScript: follow current practice — pragmatic `any` is acceptable where unavoidable (e.g. `import.meta` access, Google AI SDK types). Do not introduce stricter rules mid-migration.
- Unit tests are required for new business logic. No e2e requirement yet.
- Routing architecture can change in V2 if it's technically justified and not costly.
- Supabase is the current storage provider. Design repositories to be replaceable later (avoid Supabase-specific calls leaking outside `repositories/` and `utils/supabase*.ts`).
- Session state should eventually be persisted locally (SQLite) so a crash mid-session is recoverable. Not required for Phase 0–2.

**Operations**
- Risk tolerance: **2/5** — conservative. Validate before deploying. No "move fast" shortcuts.
- Rollback strategy: revert via git. No live deployment currently.
- Kiosk updates today are manual USB install. Electron auto-update is the target but not yet implemented.
- Daily report to clients = guest count only (no dashboard access for clients).

---

## Monorepo Structure

```
shell-photobooth/
├── apps/
│   ├── frontend/        # Electron desktop kiosk app
│   └── web/             # TanStack Start backend API + marketing site
├── docs/                # Project documentation (design, setup, structure)
├── scripts/             # Utility scripts (e.g., download-photos.mjs)
├── package.json         # Root workspace (pnpm)
└── pnpm-workspace.yaml
```

**Package manager:** pnpm 10.18.2
**Node.js:** >= 24.10

---

## Key Commands

```bash
pnpm install              # Install all workspace dependencies
pnpm dev                  # Run frontend (Electron) + backend concurrently
pnpm fe <cmd>             # Run command in apps/frontend
pnpm wb <cmd>             # Run command in apps/web
pnpm fe dev               # Start Electron app (Vite dev server)
pnpm wb dev               # Start TanStack Start backend on http://localhost:3000
pnpm wb dev:email         # Preview React Email templates at http://localhost:3001
pnpm wb deploy            # Deploy backend to Cloudflare Workers
pnpm lint                 # Lint both apps
pnpm lint:fix             # Auto-fix lint issues
pnpm download-photos      # Run bulk photo download script from Supabase
```

---

## Frontend App (`apps/frontend`)

**Tech stack:** Electron 39, React 19, React Router 7 (HashRouter), Tailwind CSS 4, TypeScript 5.4, SQLite (Node.js `DatabaseSync`), Supabase JS, simple-keyboard

### User Flow

```
/ → /select → /camera → /form → /loading → /result
```

Hidden admin route: `/data` (accessible via `Cmd/Ctrl+D`)

### Route Summary

| Route | File | Purpose |
|-------|------|---------|
| `/` | `routes/index.tsx` | Splash screen — "Tap to enter" |
| `/select` | `routes/select.tsx` | Racing theme selection (Pitcrew / MotoGP / F1) |
| `/camera` | `routes/camera.tsx` | Captures 1 photo with countdown + retake (max 2) |
| `/form` | `routes/form.tsx` | Collects name, email, phone + consent |
| `/loading` | `routes/loading.tsx` | Calls AI API, applies frame overlay, shows progress |
| `/result` | `routes/result.tsx` | Shows final photo, triggers save/print/email |
| `/data` | `routes/data.tsx` | Admin view — browse SQLite records |

### Global State — `PhotoboothContext`

Located at `apps/frontend/src/contexts/PhotoboothContext.tsx`.

```typescript
interface PhotoboothContextType {
  originalPhotos: string[];           // 1 base64 photo from camera
  finalPhoto: string | null;          // Final composite (base64) after AI + frame
  selectedTheme: { theme: RacingTheme } | null;  // "pitcrew" | "motogp" | "f1"
  userInfo: { name: string; email: string; phone: string } | null;
  reset(): void;
}
```

### Electron IPC (`preload.ts` → `main.ts`)

```typescript
window.electronAPI = {
  platform: string;
  isElectron: boolean;
  print(filePath: string): Promise<void>;
  savePhotoFile(base64: string, fileName: string): Promise<string>;
  db: {
    savePhotoResult(document: object): Promise<void>;
    getAllPhotoResults(): Promise<PhotoResult[]>;
    getPhotoResultById(id: string): Promise<PhotoResult>;
  };
  onNavigateToHome(callback: () => void): void;  // Cmd+H
  onNavigateToData(callback: () => void): void;   // Cmd+D
};
```

### Local SQLite

**Location:** `app.getPath('userData')/photobooth.db`
**Photos:** `app.getPath('userData')/photos/`

```sql
CREATE TABLE photo_results (
  id           TEXT PRIMARY KEY,
  photo_path   TEXT NOT NULL,
  selected_theme TEXT NOT NULL,   -- JSON: { theme: "pitcrew" | "motogp" | "f1" }
  user_info    TEXT NOT NULL,     -- JSON: { name, email, phone }
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
```

### Camera Details

- **Portrait / 9:16 aspect ratio** (kiosk display)
- **Mirrored preview** (selfie mode)
- **1 photo** captured (simplified from original 2-photo design)
- **3-2-1 countdown** before capture
- **Max 2 retakes**
- Photo stored as base64 in `PhotoboothContext.originalPhotos`

### Loading Page — AI Flow

1. POST `originalPhotos[0]` (base64) + `selectedTheme.theme` → `/api/ai-generate`
2. Backend performs face-swap via Replicate
3. Apply racing frame overlay on canvas (client-side)
4. Set `finalPhoto` in context → navigate to `/result`

Frame overlay mapping:
```
pitcrew → /images/frame-racing-pitcrew.png
motogp  → /images/frame-racing-motogp.png
f1      → /images/frame-racing-f1.png
```

### Result Page — Automatic Actions (on mount)

1. `electronAPI.savePhotoFile(base64, fileName)` → save to `userData/photos/`
2. `electronAPI.db.savePhotoResult(...)` → insert into SQLite
3. `electronAPI.print(filePath)` → send to DS-RX1 printer (production only, 1s delay)

---

## Backend App (`apps/web`)

**Tech stack:** TanStack Start 1.132, TanStack Router, TypeScript 5.7, Supabase (PostgreSQL + Storage), Replicate API, Resend + React Email, Sentry, Cloudflare Workers (via Wrangler)

### API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/ai-generate` | AI face-swap via Replicate — returns base64 result |
| POST | `/api/photo` | Save user to Supabase + send email via Resend |

Both endpoints require `Authorization: Bearer <API_CLIENT_KEY>`.

### Clean Architecture Pattern

```
routes/api.*.ts          ← HTTP layer (validation, auth, response)
  └── usecases/*.ts      ← Business logic orchestration
        ├── repositories/user.repository.ts  ← Supabase DB access
        └── services/
              ├── ai-generation.service.ts   ← Replicate API
              └── email.service.tsx          ← Resend API
                    └── emails/photo-result.tsx  ← React Email template
```

### AI Generation Flow (`/api/ai-generate`)

1. Frontend sends base64 photo + theme
2. Backend uploads photo to Supabase `temp/` folder → get public URL
3. Call Replicate `google/nano-banana-pro` (face-swap model)
4. Download result, convert to base64
5. Delete temp photo from Supabase
6. Return `{ generatedImageBase64 }`

### Email Flow (`/api/photo`)

1. Validate API key + inputs
2. Normalize phone to `+62` format
3. `UserRepository.save()` → INSERT into Supabase `users` table
4. Get public URL from Supabase Storage
5. `EmailService.sendPhotoResult()` via Resend
6. Return `{ photoUrl, message }`

### Supabase Clients

| Client | Location | Key | Purpose |
|--------|----------|-----|---------|
| Frontend | `frontend/src/utils/supabase.ts` | Anon key | Upload photos to Storage |
| Web admin | `web/src/utils/supabase-admin.ts` | Service role key | DB writes (bypasses RLS) |
| Web SSR | `web/src/utils/supabase.ts` | Anon key | SSR session management |

**Storage bucket:** `photobooth-bucket`
- `public/` — permanent photos (publicly readable, anon upload allowed)
- `temp/` — transient uploads for Replicate (service role access, cleaned up after use)

### Supabase `users` Table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Auto-generated |
| `name` | TEXT | NOT NULL |
| `email` | TEXT | NOT NULL, indexed |
| `phone` | TEXT | NOT NULL, +62 format |
| `photo_path` | TEXT | Storage path |
| `selected_theme` | TEXT | "pitcrew" / "motogp" / "f1" |
| `created_at` | TIMESTAMPTZ | Indexed DESC |

RLS enabled — only `service_role` (admin) can insert/select.

---

## Environment Variables

### `apps/frontend/.env`

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend URL (local: `http://localhost:3000`) |
| `VITE_API_CLIENT_KEY` | Must match backend `API_CLIENT_KEY` |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (NOT service_role) |
| `DIGICAMCONTROL_URL` | DigiCamControl HTTP server (optional) |
| `DIGICAMCONTROL_EXE_PATH` | Path to DigiCamControl exe (optional) |

### `apps/web/.env`

| Variable | Description |
|----------|-------------|
| `API_CLIENT_KEY` | Bearer token for frontend→backend auth |
| `CORS_ORIGIN` | Allowed CORS origin |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only, never expose) |
| `REPLICATE_API_KEY` | Replicate API key for AI face-swap |
| `REPLICATE_MODEL` | Replicate model ID |
| `RACING_TEMPLATE_PITCREW_URL` | Public URL to Pit Crew template image |
| `RACING_TEMPLATE_MOTOGP_URL` | Public URL to MotoGP template image |
| `RACING_TEMPLATE_F1_URL` | Public URL to F1 template image |
| `RACING_PROMPT_PITCREW` | AI prompt for Pit Crew theme |
| `RACING_PROMPT_MOTOGP` | AI prompt for MotoGP theme |
| `RACING_PROMPT_F1` | AI prompt for F1 theme |
| `RESEND_API_KEY` | Resend email API key |
| `RESEND_FROM_EMAIL` | Sender email address |
| `VITE_SENTRY_DSN` | Sentry DSN (optional) |

> Production secrets go in Cloudflare Workers via `npx wrangler secret put <KEY>`.

---

## Deployment

| Component | Target |
|-----------|--------|
| Frontend | Electron installer (Windows/macOS/Linux via Electron Forge) |
| Backend | Cloudflare Workers (via Wrangler) |
| Database | Supabase (hosted PostgreSQL) |
| Storage | Supabase Storage (S3-compatible) |

Deploy backend:
```bash
pnpm wb build
pnpm wb deploy
```

---

## Required Assets

These image assets live in `apps/frontend/public/images/`:

| File | Purpose |
|------|---------|
| `theme-pitcrew.png` | Theme selection card image |
| `theme-motogp.png` | Theme selection card image |
| `theme-f1.png` | Theme selection card image |
| `frame-racing-pitcrew.png` (1080x1920) | Frame overlay composited after AI result |
| `frame-racing-motogp.png` (1080x1920) | Frame overlay composited after AI result |
| `frame-racing-f1.png` (1080x1920) | Frame overlay composited after AI result |

Racing template images for the face-swap model are hosted externally (Supabase/CDN) — URLs set via env vars.

---

## Supabase / Postgres Notes

- **PL/pgSQL `RETURNS SETOF` requires `RETURN QUERY`** — functions declared `RETURNS SETOF <table>` must use `RETURN QUERY INSERT/SELECT ... RETURNING *`. Omitting `RETURN QUERY` compiles silently but throws at call time: `"query has no destination for result data"`. Always verify new Postgres functions with a direct `SELECT * FROM fn(...)` call in the Supabase SQL editor before deploying.
- **Supabase Storage responses are discriminated unions** — `.list()`, `.download()`, and `.upload()` return `{ data: T; error: null } | { data: null; error: Error }`. After an `if (error) throw` check, TypeScript narrows `data` to non-null — do not add `?? []` or `!data` guards after the check or `@typescript-eslint/no-unnecessary-condition` will fire.
- **Migration files must stay in sync** — all manual schema changes run in the Supabase SQL editor must also be committed as a migration file in `apps/web/supabase/migrations/`. Use the next timestamp (`YYYYMMDDHHMMSS`) as the filename prefix.

---

## Security Notes

- `SUPABASE_SERVICE_KEY` — server-side only, never in frontend or git
- `API_CLIENT_KEY` — shared secret between frontend and backend; regenerate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- Input sanitization: name strips `<>`, email/phone validated via regex, phone normalized to `+62`
- Electron runs in kiosk/fullscreen mode with no dev tools in production
- Supabase RLS: anon key can only upload to `public/` in storage; all DB writes use service role

---

## Documentation

All docs live in `/docs/`:

**Design docs** (`docs/design/`):
| File | Contents |
|------|----------|
| `design-document.md` | Full product architecture, V1/V2 roadmap, module system, data models |

**Workflow docs** (`docs/workflow/`) — project planning and execution:
| File | Contents |
|------|----------|
| `MASTER-PLAN.md` | North-star: milestones, project registry, scope rules |
| `HOW-WE-WORK.md` | Execution methodology: sessions, verification, git |
| `projects/scale-up-v1/` | V1 migration — complete ✅ |
| `projects/scale-up-v2/` | V2 modular pipeline — planning 🔜 |

**Other docs** (`docs/`):
| File | Contents |
|------|----------|
| `project-structure.md` | Monorepo layout, data flow, IPC, route details |
| `setup-guide.md` | Step-by-step guide for Supabase, Replicate, Resend, Cloudflare deployment |
| `change-plan.md` | How the app was converted from archetype quiz → AI racing photobooth |
| `download-photos-guide.md` | Guide for bulk-downloading photos from Supabase bucket |

---

## Printing

- **Target:** DS-RX1 thermal photo printer
- **Format:** 4" x 6"
- **Mechanism:** Electron `webContents.print()` — creates a hidden `BrowserWindow`, injects photo HTML, prints
- **Dev fallback:** PDF export via `print-window-pdf` IPC channel
