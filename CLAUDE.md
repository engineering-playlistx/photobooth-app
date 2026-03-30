# CLAUDE.md — Shell Photobooth

This file gives Claude Code the context needed to work effectively in this repo.

---

## Project Overview

**Shell Photobooth** is a kiosk-style photobooth application built for racing events. Users take a photo, select a racing theme (Pit Crew, MotoGP, or F1), and receive an AI face-swapped result delivered via email and physical print.

The app is **offline-first**: all photos are saved locally via SQLite and the filesystem. Cloud delivery (Supabase storage + email via Resend) is layered on top.

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

## Security Notes

- `SUPABASE_SERVICE_KEY` — server-side only, never in frontend or git
- `API_CLIENT_KEY` — shared secret between frontend and backend; regenerate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- Input sanitization: name strips `<>`, email/phone validated via regex, phone normalized to `+62`
- Electron runs in kiosk/fullscreen mode with no dev tools in production
- Supabase RLS: anon key can only upload to `public/` in storage; all DB writes use service role

---

## Documentation

All docs live in `/docs/`:

| File | Contents |
|------|----------|
| `design-document.md` | Full architecture, tech stack, data models, AI pipeline |
| `project-structure.md` | Monorepo layout, data flow, IPC, route details |
| `setup-guide.md` | Step-by-step guide for Supabase, Replicate, Resend, Cloudflare deployment |
| `change-plan.md` | Migration plan: how the app was converted from archetype quiz → AI racing photobooth |
| `download-photos-guide.md` | Guide for bulk-downloading photos from Supabase bucket |

---

## Printing

- **Target:** DS-RX1 thermal photo printer
- **Format:** 4" x 6"
- **Mechanism:** Electron `webContents.print()` — creates a hidden `BrowserWindow`, injects photo HTML, prints
- **Dev fallback:** PDF export via `print-window-pdf` IPC channel
