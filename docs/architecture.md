# Architecture Overview — Shell Photobooth

## Table of Contents

- [System Overview](#system-overview)
- [Monorepo Structure](#monorepo-structure)
- [Frontend App — Electron](#frontend-app--electron)
  - [Process Model](#electron-process-model)
  - [Renderer & Routing](#renderer--routing)
  - [State Management](#state-management)
  - [IPC Bridge](#ipc-bridge)
  - [Local Persistence](#local-persistence)
- [Backend App — TanStack Start / Cloudflare Workers](#backend-app--tanstack-start--cloudflare-workers)
  - [Layered Architecture](#layered-architecture)
  - [API Endpoints](#api-endpoints)
  - [Services](#services)
  - [Middleware](#middleware)
- [AI Generation Pipeline](#ai-generation-pipeline)
- [Data Flow — End to End](#data-flow--end-to-end)
- [Storage Architecture](#storage-architecture)
- [Security Model](#security-model)
- [Deployment](#deployment)

---

## System Overview

Shell Photobooth is a **kiosk desktop application** for racing events. A user selects a racing theme, takes a photo, submits their contact details, and receives an AI face-swapped result photo — displayed on screen, printed on a thermal printer, and optionally delivered via email.

The system is split into two apps in a pnpm monorepo:

| App | Role | Runtime |
|-----|------|---------|
| `apps/frontend` | Electron kiosk UI, camera, local storage, printing | Desktop (Windows/macOS/Linux) |
| `apps/web` | Backend API, AI orchestration, email, cloud storage | Cloudflare Workers |

```
┌──────────────────────────────────────────────────────────┐
│                  Electron Desktop App                    │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  React UI   │  │  SQLite DB  │  │ Local Filesystem │  │
│  │ (Renderer)  │  │  (Main)     │  │   (Photos)       │  │
│  └──────┬──────┘  └─────────────┘  └─────────────────┘  │
│         │ HTTP (Bearer Token)                            │
└─────────┼──────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│            TanStack Start / Cloudflare Workers           │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ API Routes  │  │  Use Cases  │  │    Services      │  │
│  │  /api/*     │  │  (Business) │  │  (External)      │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
│         └────────────────┴──────────────────┘            │
│                          │                               │
│         ┌────────────────┼──────────────────┐            │
│         ▼                ▼                  ▼            │
│    ┌─────────┐    ┌────────────┐    ┌──────────────┐     │
│    │Supabase │    │  Replicate │    │    Resend    │     │
│    │(DB + S3)│    │(AI / Sync) │    │   (Email)    │     │
│    └─────────┘    └────────────┘    └──────────────┘     │
└──────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
shell-photobooth/
├── apps/
│   ├── frontend/                  # Electron kiosk app
│   │   ├── src/
│   │   │   ├── main.ts            # Electron main process
│   │   │   ├── preload.ts         # IPC bridge (contextBridge)
│   │   │   ├── renderer.tsx       # React entry + routing
│   │   │   ├── routes/            # Page components
│   │   │   ├── contexts/          # PhotoboothContext (global state)
│   │   │   ├── database/          # SQLite access layer
│   │   │   ├── types/             # TypeScript types
│   │   │   └── utils/             # Supabase client, filesystem, assets
│   │   ├── public/images/         # Frames, theme previews, UI assets
│   │   └── forge.config.ts        # Electron Forge packaging config
│   │
│   └── web/                       # TanStack Start backend
│       ├── src/
│       │   ├── routes/            # API route handlers
│       │   ├── usecases/          # Business logic
│       │   ├── repositories/      # Data access (Supabase)
│       │   ├── services/          # External service clients
│       │   │   └── emails/        # React Email templates
│       │   ├── middleware/        # CORS, logging
│       │   └── utils/             # Supabase clients (anon + admin)
│       ├── supabase/
│       │   ├── migrations/        # SQL schema migrations
│       │   └── config.toml        # Local Supabase config
│       └── wrangler.jsonc         # Cloudflare Workers config
│
├── docs/                          # Project documentation
├── scripts/                       # Utility scripts
├── package.json                   # Root workspace config
└── pnpm-workspace.yaml
```

**Package manager:** pnpm 10.18.2
**Node.js:** >= 24.10

---

## Frontend App — Electron

### Electron Process Model

Electron runs two OS processes that communicate via IPC:

```
┌────────────────────────────────────┐
│           Main Process             │
│  - BrowserWindow management        │
│  - SQLite database (sync)          │
│  - Filesystem operations           │
│  - Print management (DS-RX1)       │
│  - Menu / keyboard shortcuts       │
│  - IPC handlers                    │
│  - Custom local-file:// protocol   │
│  - Content Security Policy         │
└──────────────┬─────────────────────┘
               │ contextBridge (IPC)
┌──────────────┴─────────────────────┐
│          Preload Script            │
│  - Exposes safe APIs to renderer   │
│  - window.electronAPI object       │
└──────────────┬─────────────────────┘
               │ window.electronAPI
┌──────────────┴─────────────────────┐
│         Renderer Process           │
│  - React 19 UI                     │
│  - React Router 7 (HashRouter)     │
│  - Tailwind CSS 4                  │
│  - Camera API (getUserMedia)       │
│  - Canvas compositing              │
│  - On-screen keyboard              │
│  - Supabase JS client              │
│  - QR code generation              │
└────────────────────────────────────┘
```

**Window config:** 1080×1920, 9:16 aspect ratio, kiosk/fullscreen mode, no dev tools in production.

**Custom protocol:** `local-file://` — allows the renderer to access local filesystem assets (saved photos) that would otherwise be blocked by Electron's security sandbox.

### Renderer & Routing

Entry point: `src/renderer.tsx`

Uses `HashRouter` (required for Electron's `file://` protocol). Route tree:

```
/          → Home (splash screen)
/select    → Theme selection
/camera    → Photo capture
/form      → User info form
/loading   → AI generation progress
/result    → Final photo, print, download
/data      → Admin — browse saved records (hidden, Ctrl+D)
```

A `NavigationListener` component inside the React tree listens to Electron menu events (`Ctrl+H` → home, `Ctrl+D` → data) and calls `react-router`'s `useNavigate`.

### State Management

Global session state is held in `PhotoboothContext` (`src/contexts/PhotoboothContext.tsx`):

```typescript
type RacingTheme = "pitcrew" | "motogp" | "f1";

interface PhotoboothContextType {
  originalPhotos: string[];                    // base64 captured photo(s)
  finalPhoto: string | null;                   // AI result + frame (base64)
  selectedTheme: { theme: RacingTheme } | null;
  userInfo: { name: string; email: string; phone: string } | null;
  reset(): void;                               // clears everything for next session
}
```

Data flows one-directionally through the user journey:

```
/select  → writes selectedTheme
/camera  → writes originalPhotos
/form    → writes userInfo
/loading → reads all three, writes finalPhoto
/result  → reads everything, triggers side effects
```

`reset()` is called on "Back to Home" to wipe state for the next user.

### IPC Bridge

`preload.ts` exposes `window.electronAPI` via `contextBridge`:

```typescript
window.electronAPI = {
  platform: string;                            // "win32" | "darwin" | "linux"
  isElectron: boolean;

  // Printing
  print(filePath: string): Promise<void>;      // sends to DS-RX1 printer
  printPdf(filePath: string): Promise<void>;   // saves PDF to Desktop (dev)

  // Filesystem
  savePhotoFile(base64: string, fileName: string): Promise<string>;

  // SQLite
  db: {
    savePhotoResult(document: PhotoResultDocument): Promise<void>;
    getAllPhotoResults(): Promise<PhotoResult[]>;
    getPhotoResultById(id: string): Promise<PhotoResult>;
  };

  // Navigation events from menu
  onNavigateToHome(callback: () => void): void;
  onNavigateToData(callback: () => void): void;
};
```

IPC channels in `main.ts`:

| Channel | Direction | Handler |
|---------|-----------|---------|
| `save-photo-file` | renderer → main | Saves base64 → `userData/photos/` |
| `db-save-photo-result` | renderer → main | INSERT into SQLite |
| `db-get-all-photo-results` | renderer → main | SELECT all from SQLite |
| `db-get-photo-result-by-id` | renderer → main | SELECT by ID |
| `print-window` | renderer → main | Creates hidden BrowserWindow, prints |
| `print-window-pdf` | renderer → main | Generates PDF, saves to Desktop |
| `navigate-to-home` | main → renderer | Triggered by Ctrl+H menu item |
| `navigate-to-data` | main → renderer | Triggered by Ctrl+D menu item |

### Local Persistence

**SQLite database:** `app.getPath('userData')/photobooth.db`
**Photos directory:** `app.getPath('userData')/photos/`

```sql
CREATE TABLE photo_results (
  id             TEXT PRIMARY KEY,
  photo_path     TEXT NOT NULL,         -- relative path in userData/photos/
  selected_theme TEXT NOT NULL,         -- JSON: { theme: "pitcrew"|"motogp"|"f1" }
  user_info      TEXT NOT NULL,         -- JSON: { name, email, phone }
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX idx_photo_results_created_at ON photo_results(created_at);
CREATE INDEX idx_photo_results_photo_path ON photo_results(photo_path);
```

Uses Node.js built-in `DatabaseSync` (synchronous SQLite, no separate native binding required in Node >= 22).

---

## Backend App — TanStack Start / Cloudflare Workers

### Layered Architecture

```
HTTP Request
    │
    ▼
Middleware (CORS → Logging)
    │
    ▼
Route Handler  (routes/api.*.ts)
  - Parse & validate request
  - Authenticate Bearer token
  - Call use case
    │
    ▼
Use Case  (usecases/*.usecase.ts)
  - Orchestrate business logic
  - No HTTP concern
    │
    ├──▶ Repository  (repositories/*.repository.ts)
    │      - Supabase DB operations
    │
    └──▶ Service  (services/*.service.ts)
           - External API clients
           - AI generation (Google / Replicate)
           - Email delivery (Resend)
```

### API Endpoints

#### `POST /api/ai-generate`

Generates an AI face-swapped photo.

**Auth:** `Authorization: Bearer <API_CLIENT_KEY>`

**Request body:**
```json
{
  "userPhotoBase64": "data:image/png;base64,...",
  "theme": "pitcrew" | "motogp" | "f1"
}
```

**Response (Google AI — sync):**
```json
{
  "predictionId": "google-sync",
  "generatedImageBase64": "data:image/png;base64,..."
}
```

**Response (Replicate — async):**
```json
{
  "predictionId": "<replicate-uuid>",
  "tempPath": "temp/<uuid>.png"
}
```

The frontend polls `GET /api/ai-generate?predictionId=<id>` when using Replicate until status is `succeeded`.

#### `POST /api/photo`

Saves user submission and uploads final photo to cloud.

**Auth:** `Authorization: Bearer <API_CLIENT_KEY>`

**Request body:**
```json
{
  "photoPath": "public/<uuid>-<name>.png",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "08123456789",
  "selectedTheme": "f1"
}
```

**Response:**
```json
{
  "message": "Photo submitted successfully",
  "photoUrl": "https://...supabase.co/.../public/uuid-name.png"
}
```

### Services

#### AIGenerationService (`services/ai-generation.service.ts`)

Supports two AI providers, selected via `AI_PROVIDER` env var:

| Provider | Mode | Env var |
|----------|------|---------|
| `google` | Synchronous | `GOOGLE_AI_STUDIO_API_KEY` |
| `replicate` | Asynchronous (polling) | `REPLICATE_API_KEY` |

**Google AI flow:**
1. Pre-fetch template image bytes from env URL
2. Pass user photo (inline base64) + template image to `gemini-2.5-flash-image`
3. Return generated image base64 directly in the HTTP response

**Replicate flow:**
1. Upload user photo to Supabase `temp/` → get public URL
2. Create async prediction with `google/nano-banana` model
3. Return `predictionId` immediately
4. Frontend polls `GET /api/ai-generate?predictionId=<id>`
5. Backend fetches prediction status from Replicate
6. On success: download result, return base64, delete temp file

Face-swap prompts are configured per theme via environment variables (`RACING_PROMPT_PITCREW`, `RACING_PROMPT_MOTOGP`, `RACING_PROMPT_F1`).

#### EmailService (`services/email.service.tsx`)

- Uses Resend API for transactional email
- Falls back to console logging when `RESEND_API_KEY` is absent (development)
- Idempotency key: `{email}-{filename}` (prevents duplicate sends)
- Template: `PhotoResultEmail` (React Email component with download button)

> Note: Email sending is currently disabled in `SubmitPhotoUseCase` — the service exists but is not called in the current production flow.

#### UserRepository (`repositories/user.repository.ts`)

- Inserts records into Supabase `users` table using the admin client (service role key)
- Normalizes phone: `08...` → `628...` → `+628...`

### Middleware

Middleware runs in order on every request:

1. **CORS** (`middleware/cors.ts`) — configurable origin via `CORS_ORIGIN`, allows all standard methods + Authorization header
2. **Logging** (`middleware/logging.ts`) — logs method, path, status, duration, IP, User-Agent; JSON in production, pretty in dev

---

## AI Generation Pipeline

```
Frontend: originalPhotos[0] (base64 PNG)
    │
    │  POST /api/ai-generate
    │  { userPhotoBase64, theme }
    ▼
Backend: Route Handler
    │
    ├── [Google AI]
    │     Pre-fetch template image → pass inline to Gemini
    │     ← Returns generatedImageBase64 immediately
    │
    └── [Replicate]
          Upload user photo → Supabase temp/
          Create async Replicate prediction
          ← Returns predictionId
          Frontend polls GET /api/ai-generate?predictionId=...
          Backend polls Replicate API
          On "succeeded": download image, delete temp/, return base64

Frontend: Loading Page
    │
    │  Apply frame overlay (Canvas API)
    │  Draw AI result → draw frame PNG on top
    │  Output: 1080×1920 PNG (base64)
    ▼
PhotoboothContext.finalPhoto
```

Frame overlay mapping (client-side canvas):
```
pitcrew → /images/frame-racing-pitcrew.png
motogp  → /images/frame-racing-motogp.png
f1      → /images/frame-racing-f1.png
```

---

## Data Flow — End to End

```
[/select]  User picks theme → PhotoboothContext.selectedTheme
    │
[/camera]  getUserMedia() → canvas capture → base64
           → PhotoboothContext.originalPhotos
    │
[/form]    Name + email + phone + consent
           → PhotoboothContext.userInfo
    │
[/loading] POST /api/ai-generate
           ← generatedImageBase64
           Apply frame overlay (canvas)
           → PhotoboothContext.finalPhoto
    │
[/result]  (on mount, in parallel):
           ├── electronAPI.savePhotoFile()     → userData/photos/
           ├── electronAPI.db.savePhotoResult() → SQLite
           ├── supabase.storage.upload()        → photobooth-bucket/public/
           ├── POST /api/photo                  → Supabase users table
           └── electronAPI.print()              → DS-RX1 printer [prod only]
```

---

## Storage Architecture

| Location | Technology | Path | Content |
|----------|-----------|------|---------|
| Local filesystem | Electron userData | `photos/*.png` | Final photo files |
| Local database | SQLite | `photobooth.db` | Session metadata + file paths |
| Cloud storage | Supabase Storage | `photobooth-bucket/public/` | Final photos (permanent) |
| Cloud temp | Supabase Storage | `photobooth-bucket/temp/` | Intermediate uploads for AI (transient) |
| Cloud database | Supabase PostgreSQL | `users` table | User contact + theme data |

### Supabase `users` Table

```sql
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT NOT NULL,
  photo_path     TEXT,                   -- storage path
  selected_theme TEXT,                   -- "pitcrew" | "motogp" | "f1"
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at DESC);
```

RLS is enabled — only service role key can read/write.

### Supabase Clients

| Client | Location | Key | Scope |
|--------|----------|-----|-------|
| Frontend anon | `frontend/src/utils/supabase.ts` | Anon | Upload to `public/` in Storage |
| Web admin | `web/src/utils/supabase-admin.ts` | Service role | DB writes, temp/ Storage |
| Web SSR | `web/src/utils/supabase.ts` | Anon | Cookie-based auth |

---

## Security Model

| Concern | Mechanism |
|---------|-----------|
| API authentication | Bearer token (`API_CLIENT_KEY`) on all `/api/*` routes |
| Service role key isolation | Server-side only, never in frontend or git |
| Input sanitization | Name strips `<>`, email/phone validated via regex |
| Phone normalization | Converted to `+62` international format |
| Supabase RLS | Anon key limited to `public/` uploads; DB writes require service role |
| Electron CSP | Custom Content-Security-Policy allows blob + local files, restricts scripts |
| IPC isolation | `contextBridge` with `nodeIntegration: false` — renderer cannot call Node APIs directly |
| Kiosk mode | Fullscreen, no dev tools exposed in production |

---

## Deployment

| Component | Target | Tool |
|-----------|--------|------|
| Frontend | Electron installer (Windows: Squirrel, macOS: ZIP, Linux: Deb) | Electron Forge |
| Backend | Cloudflare Workers | Wrangler CLI |
| Database | Supabase hosted PostgreSQL | Supabase CLI / dashboard |
| Storage | Supabase Storage (S3-compatible) | Supabase dashboard |

**Backend deploy:**
```bash
pnpm wb build
pnpm wb deploy
```

**Frontend package:**
```bash
pnpm fe make
```

Production secrets (backend) are set via `npx wrangler secret put <KEY>` and never stored in `wrangler.jsonc`.
