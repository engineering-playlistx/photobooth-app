# CLAUDE.md — Shell Photobooth

This file gives Claude Code the context needed to work effectively in this repo.

---

## Project Overview

**Photobooth App** is a managed, AI-powered photobooth platform sold as a service to brands and marketing agencies. Actively scaling into multi-client SaaS.

**Offline-first:** photos saved locally via SQLite + filesystem. Cloud delivery via Supabase Storage layered on top. **Supabase is source of truth** — SQLite is offline backup only.

**Current state:** No kiosk deployed, no backend running. Safe to modify.

**Latest version:** V8 complete (2026-04-18). Active project docs: `docs/workflow/projects/`. Workflow methodology: `docs/workflow/HOW-WE-WORK.md`.

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
3. **Run tests** (Layer 2) — required when new business logic is added. Hand off to user:
   > Run `pnpm wb test` and paste output only if something fails.
   Use `vi.resetModules()` + dynamic `import()` for modules with env-var-driven constants.
4. **Manual smoke test** (Layer 3) — hand off to user: follow the exact steps in the task's **Verification** section
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

Separate formatting-only changes into their own `chore: apply prettier formatting` commit — do not mix with logic changes.

---

## Core Constraints & Invariants

These decisions are settled. All future code must respect them.

**Data**
- Supabase is source of truth. SQLite is offline backup only.
- Partial session saves are allowed; partial state must be detectable and recoverable.
- No GDPR-style deletion requirement.

**Guest Experience**
- AI generation must complete within **60 seconds** or show an error with retry.
- If backend unreachable during AI gen, "sorry, try again" is acceptable.
- If printing is enabled for the event, it **must** print — printing failures must surface to the operator.
- Guest flow sequence is configurable per event (steps can be added, removed, or reordered).

**Architecture**
- All kiosks must run the **same app version** — no mixed-version deployments.
- Every entity scoped to `eventId` — simultaneous events must be supported.
- TypeScript: pragmatic `any` is acceptable where unavoidable. Do not introduce stricter rules mid-migration.
- Unit tests required for new business logic. No e2e requirement yet.
- Keep Supabase-specific calls inside `repositories/` and `utils/supabase*.ts` only.

**Operations**
- Risk tolerance: **2/5** — conservative. Validate before deploying. No "move fast" shortcuts.
- Rollback via git. No live deployment currently.
- Kiosk updates are manual USB install. Electron auto-update is the target but not yet implemented.

---

## Monorepo

`apps/frontend/` — Electron desktop kiosk (React 19, React Router 7, Tailwind 4, SQLite, Supabase JS)
`apps/web/` — TanStack Start backend API (Supabase PostgreSQL + Storage, Replicate, Resend, Cloudflare Workers)

**Package manager:** pnpm 10.18.2 | **Node.js:** >= 24.10

---

## Key Commands

```bash
pnpm install              # Install all workspace dependencies
pnpm dev                  # Run frontend (Electron) + backend concurrently
pnpm fe <cmd>             # Run command in apps/frontend
pnpm wb <cmd>             # Run command in apps/web
pnpm wb dev               # Start TanStack Start backend on http://localhost:3000
pnpm wb dev:email         # Preview React Email templates at http://localhost:3001
pnpm lint:fix             # Auto-fix lint issues
```

---

## Frontend (`apps/frontend`)

Guest flow: `/ → /select → /camera → /form → /loading → /result`
Admin: `/data` (Cmd/Ctrl+D)

**Context:** `apps/frontend/src/contexts/PhotoboothContext.tsx` — holds `originalPhotos`, `finalPhoto`, `selectedTheme`, `userInfo`, `reset()`.

**IPC:** `preload.ts → main.ts` exposes `window.electronAPI` — `print`, `savePhotoFile`, `db.*`, `onNavigateToHome` (Cmd+H), `onNavigateToData` (Cmd+D).

SQLite at `userData/photobooth.db`. Photos at `userData/photos/`.

---

## Backend (`apps/web`)

API endpoints (both require `Authorization: Bearer <API_CLIENT_KEY>`):
- `POST /api/ai-generate` — face-swap via Replicate, returns base64
- `POST /api/photo` — save user to Supabase + send email via Resend

Architecture: `routes/api.*.ts` → `usecases/` → `repositories/` + `services/`

Supabase clients:
- Frontend anon key → `frontend/src/utils/supabase.ts` (Storage uploads only)
- Web service role → `web/src/utils/supabase-admin.ts` (DB writes, bypasses RLS)

Storage bucket `photobooth-bucket`: `public/` (permanent), `temp/` (transient for Replicate, cleaned up after use).

---

## Environment Variables

### `apps/frontend/.env`
`VITE_API_BASE_URL`, `VITE_API_CLIENT_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DIGICAMCONTROL_URL` (optional), `DIGICAMCONTROL_EXE_PATH` (optional)

### `apps/web/.env`
`API_CLIENT_KEY`, `CORS_ORIGIN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` (server-side only — never expose), `REPLICATE_API_KEY`, `REPLICATE_MODEL`, `RACING_TEMPLATE_{PITCREW,MOTOGP,F1}_URL`, `RACING_PROMPT_{PITCREW,MOTOGP,F1}`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `VITE_SENTRY_DSN` (optional)

> Production secrets: `npx wrangler secret put <KEY>`

---

## Supabase / Postgres Notes

- **`RETURNS SETOF` requires `RETURN QUERY`** — omitting it compiles silently but throws at call time: `"query has no destination for result data"`. Verify new Postgres functions with `SELECT * FROM fn(...)` in the SQL editor before deploying.
- **Storage responses are discriminated unions** — `.list()`, `.download()`, `.upload()` return `{ data: T; error: null } | { data: null; error: Error }`. After `if (error) throw`, TypeScript narrows `data` to non-null — do not add `?? []` or `!data` guards after the check.
- **Migration files must stay in sync** — all schema changes run in the Supabase SQL editor must also be committed to `apps/web/supabase/migrations/` with a `YYYYMMDDHHMMSS` prefix.

---

## Security

- `SUPABASE_SERVICE_KEY` — server-side only, never in frontend or git
- `API_CLIENT_KEY` — regenerate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- Input sanitization: name strips `<>`, email/phone validated via regex, phone normalized to `+62`
- Supabase RLS: anon key can only upload to `public/` storage; all DB writes use service role

---

## Printing

Target: DS-RX1 thermal printer, 4×6". Mechanism: Electron `webContents.print()` via hidden BrowserWindow. Dev fallback: PDF via `print-window-pdf` IPC.

---

## Required Assets

`apps/frontend/public/images/`: `theme-{pitcrew,motogp,f1}.png` (selection cards), `frame-racing-{pitcrew,motogp,f1}.png` (1080×1920 overlays). Racing template images for the AI model are hosted externally (env vars).
