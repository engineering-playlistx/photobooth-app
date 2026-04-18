# Architecture Guide — Shell Photobooth

This document is the reference for developers adding or modifying modules and services in this codebase. It covers how the system is structured, how data flows through it, and the exact steps needed to extend each layer.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Monorepo Layout](#monorepo-layout)
3. [Frontend — Electron Kiosk](#frontend--electron-kiosk)
   - [Process Architecture](#process-architecture)
   - [Module System](#module-system)
   - [Context / State](#context--state)
   - [Adding a New Module](#adding-a-new-module)
4. [Backend — TanStack Start API](#backend--tanstack-start-api)
   - [Layered Architecture](#layered-architecture)
   - [API Routes](#api-routes)
   - [Use Cases](#use-cases)
   - [Services](#services)
   - [Repositories](#repositories)
   - [Adding a New API Endpoint](#adding-a-new-api-endpoint)
5. [Shared Types Package](#shared-types-package)
6. [Full Session Data Flow](#full-session-data-flow)
7. [Customization System](#customization-system)
8. [Security Model](#security-model)
9. [Error Handling Conventions](#error-handling-conventions)
10. [Key Configuration Files](#key-configuration-files)

---

## System Overview

Shell Photobooth is a **two-app monorepo**:

| App | Role | Runtime |
|-----|------|---------|
| `apps/frontend` | Electron kiosk — photo capture, AI generation, result display | Desktop (macOS / Windows) |
| `apps/web` | TanStack Start REST API — config, AI orchestration, storage, email | Cloudflare Workers |

A shared `packages/types` package keeps the two apps in sync on domain types (EventConfig, ModuleConfig, etc.).

The frontend fetches an **EventConfig** from the backend on startup. That config describes the entire guest experience — which modules to show, in what order, with what branding. No code changes are required to reconfigure an event; everything is data-driven.

---

## Monorepo Layout

```
photobooth-app/
├── apps/
│   ├── frontend/          # Electron desktop kiosk
│   └── web/               # TanStack Start backend
├── packages/
│   └── types/             # @photobooth/types — shared domain types
├── pnpm-workspace.yaml
├── package.json           # Root scripts: pnpm fe, pnpm wb, pnpm dev
└── tsconfig.json
```

**Convenience scripts (run from root):**

```bash
pnpm fe <cmd>   # Run in apps/frontend
pnpm wb <cmd>   # Run in apps/web
pnpm dev        # Start both apps concurrently
```

---

## Frontend — Electron Kiosk

### Process Architecture

Electron splits work across three processes. Each has a distinct responsibility and strict boundaries.

```
┌── Main Process (main.ts) ──────────────────────┐
│  Node.js, full OS access                        │
│  • Creates BrowserWindow (1080×1920)            │
│  • Registers IPC handlers                       │
│  • SQLite DB operations                         │
│  • File system (photo save)                     │
│  • Printing                                     │
└────────────────────────────────────────────────┘
           ↕ contextBridge
┌── Preload Script (preload.ts) ─────────────────┐
│  Isolated bridge — exposes safe IPC API         │
│  window.electronAPI.{print, savePhotoFile,      │
│    db.*, getKioskConfig, saveKioskConfig}        │
└────────────────────────────────────────────────┘
           ↕ window.electronAPI
┌── Renderer (React + React Router) ─────────────┐
│  No Node access — calls only the exposed API    │
│  • EventConfigContext — loads event config      │
│  • PipelineContext — manages module flow        │
│  • PipelineRenderer — drives the current module │
└────────────────────────────────────────────────┘
```

**Adding a new IPC call:**
1. Add the `ipcMain.handle('my-channel', handler)` in `main.ts`
2. Expose it via `contextBridge.exposeInMainWorld` in `preload.ts`
3. Declare the type in `src/types/global.d.ts`
4. Call `window.electronAPI.myMethod()` in the renderer

---

### Module System

The guest flow is a **linear pipeline of modules**. Each module is a React component that receives a standard set of props, does its work, and then calls `onComplete(output)` to advance the pipeline.

#### Module Contract

```typescript
// packages/types / modules/types.ts
interface ModuleProps {
  config: ModuleConfig          // module's own config from EventConfig.moduleFlow
  outputs: Record<string, unknown>  // all outputs accumulated from prior modules
  onComplete(output?: Record<string, unknown>): void
  onBack(): void
}
```

Modules **do not import each other** and do not share mutable state. All inter-module data passes through `PipelineContext.moduleOutputs`.

#### Built-in Modules

| Module | File | Output Key | What it Does |
|--------|------|-----------|--------------|
| `welcome` | `WelcomeModule.tsx` | _(session created server-side)_ | Start screen; creates session via `POST /api/session/start` |
| `themeSelection` | `ThemeSelectionModule.tsx` | `selectedTheme` | Theme picker cards; auto-skipped if only one theme |
| `camera` | `CameraModule.tsx` | `originalPhoto` | Live camera preview, capture, retake |
| `aiGeneration` | `AiGenerationModule.tsx` | `finalPhoto` | Sends photo to backend, polls for result, composites frame |
| `form` | `FormModule.tsx` | `userInfo` | Name / email / phone collection with on-screen keyboard |
| `result` | `ResultModule.tsx` | _(none)_ | Displays final photo, saves to Supabase, sends email, prints, shows QR |
| `miniQuiz` | `MiniQuizModule.tsx` | `quizAnswer` | Multiple-choice quiz (flexible position in flow) |

#### Module Registry

`src/modules/registry.ts` maps module type IDs to React components:

```typescript
export const MODULE_REGISTRY: Record<string, React.ComponentType<ModuleProps>> = {
  welcome: WelcomeModule,
  themeSelection: ThemeSelectionModule,
  camera: CameraModule,
  aiGeneration: AiGenerationModule,
  form: FormModule,
  result: ResultModule,
  miniQuiz: MiniQuizModule,
}
```

`PipelineRenderer` reads `EventConfig.moduleFlow`, looks up each entry in this registry, and renders the current one.

---

### Context / State

#### EventConfigContext (`contexts/EventConfigContext.tsx`)

Fetches and caches the event config from the backend on startup. All modules read from this context to know branding, themes, form fields, and their own `ModuleConfig`.

Key state:

| Field | Type | Description |
|-------|------|-------------|
| `config` | `EventConfig \| null` | The loaded config |
| `status` | `idle \| loading \| ready \| error` | Load state |
| `errorType` | string | Categorises the failure |

The context caches the last successful config in a ref so the kiosk keeps running through transient network failures.

#### PipelineContext (`contexts/PipelineContext.tsx`)

Drives module progression. Read via `usePipeline()`.

Key state:

| Field | Type | Description |
|-------|------|-------------|
| `currentIndex` | `number` | Index into `EventConfig.moduleFlow` |
| `sessionId` | `string \| null` | Supabase session ID (set after welcome) |
| `moduleOutputs` | `Record<string, unknown>` | Accumulated outputs from all completed modules |
| `suppressInactivity` | `boolean` | Disables inactivity timeout (used during AI generation) |

Key actions:

| Action | Description |
|--------|-------------|
| `advance(output?)` | Move to next module, merge output into `moduleOutputs` |
| `back()` | Move to previous module |
| `reset()` | Return to index 0, clear all outputs |
| `jumpToIndex(i)` | Jump to arbitrary module (retry flows) |

---

### Adding a New Module

Follow these steps in order:

**Step 1 — Define the config type**

In `packages/types/src/module-config.ts`, add a new discriminated union member:

```typescript
interface MyModuleConfig extends BaseModuleConfig {
  moduleType: 'myModule'
  // module-specific config fields
  someOption: string
}

// Add to the ModuleConfig union
export type ModuleConfig = ... | MyModuleConfig
```

**Step 2 — Build the component**

Create `apps/frontend/src/modules/MyModule.tsx`:

```typescript
import type { ModuleProps } from './types'

export function MyModule({ config, outputs, onComplete, onBack }: ModuleProps) {
  const myConfig = config as MyModuleConfig

  function handleDone() {
    onComplete({ myOutputKey: 'value' })
  }

  return <div>...</div>
}
```

Rules:
- Call `onComplete(output)` exactly once when the module finishes
- Call `onBack()` when the user wants to go back
- Read prior module outputs from the `outputs` prop (not from context directly)
- If the module needs to suppress the inactivity timer (e.g. long async operation), call `suppressInactivity(true)` from `usePipeline()`

**Step 3 — Register the module**

In `apps/frontend/src/modules/registry.ts`:

```typescript
import { MyModule } from './MyModule'

export const MODULE_REGISTRY = {
  // ...existing entries...
  myModule: MyModule,
}
```

**Step 4 — Add to EventConfig (database)**

In the Supabase `event_configs` table, add an entry to the `moduleFlow` array in the event's `config_json`:

```json
{
  "moduleType": "myModule",
  "moduleId": "my-module-1",
  "position": 3,
  "someOption": "value"
}
```

No code deploy needed for existing events — just update the config row.

---

## Backend — TanStack Start API

### Layered Architecture

All inbound requests flow through four layers. Each layer has a single responsibility.

```
Request
  ↓
API Route (routes/api.*.ts)
  — Auth check, input parsing, HTTP response shaping
  ↓
Use Case (usecases/*.usecase.ts)
  — Orchestrates one business operation (may call multiple repos + services)
  ↓
Service / Repository (services/*.service.ts | repositories/*.repository.ts)
  — Services: external I/O (AI API, email)
  — Repositories: Supabase table access
  ↓
Supabase Client (utils/supabase-admin.ts)
```

**Rules:**
- API routes call use cases or services directly — never repositories
- Use cases may call multiple repositories and/or services
- Repositories access only Supabase (never call services or other repositories)
- Services access only their own external provider (never Supabase directly unless it is their storage)

---

### API Routes

All routes live in `apps/web/src/routes/api.*.ts` and follow this template:

```typescript
export const APIRoute = createAPIFileRoute('/api/my-route')({
  POST: async ({ request }) => {
    // 1. Auth
    const key = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (key !== process.env.API_CLIENT_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // 2. Parse input
    const body = await request.json()

    // 3. Call use case or service
    const result = await myUseCase.execute(body)

    // 4. Return response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})
```

#### Existing Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/config` | Fetch EventConfig for an event |
| `POST` | `/api/session/start` | Create a new guest session |
| `PATCH` | `/api/session/photo` | Record the captured photo path on the session |
| `POST` | `/api/ai-generate` | Start an AI face-swap prediction |
| `GET` | `/api/ai-generate-status` | Poll for AI prediction result |
| `POST` | `/api/photo` | Submit user info, complete session, send email |

---

### Use Cases

Use cases live in `apps/web/src/usecases/`. Each file contains one exported class with an `execute()` method.

**Existing use case:**

- **SubmitPhotoUseCase** (`submit-photo.usecase.ts`) — Creates the user record, marks the session complete, sends the result email. Called by `POST /api/photo`.

**Adding a new use case:**

```typescript
// usecases/my-feature.usecase.ts
export class MyFeatureUseCase {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly emailService: EmailService,
  ) {}

  async execute(input: MyFeatureInput): Promise<MyFeatureOutput> {
    const session = await this.sessionRepo.getSession(input.sessionId)
    await this.emailService.sendSomething(session)
    return { success: true }
  }
}
```

Instantiate it at the top of the route file (or inject it — there is no DI container; just `new`).

---

### Services

Services wrap external I/O providers. They live in `apps/web/src/services/`.

| Service | File | Provider | Responsibility |
|---------|------|----------|---------------|
| `AIGenerationService` | `ai-generation.service.ts` | Replicate / Google AI | Create predictions, poll status, return base64 image |
| `EmailService` | `email.service.tsx` | Resend | Render React email template and send |

**Adding a new service:**

1. Create `services/my-provider.service.ts`
2. Export a class (or object) with methods that wrap the provider's SDK calls
3. Keep all provider-specific error handling inside the service — callers should receive normalised results or thrown errors with meaningful messages

---

### Repositories

Repositories are the **only** code that touches Supabase tables. They live in `apps/web/src/repositories/`.

| Repository | Table(s) | Key Methods |
|------------|---------|-------------|
| `SessionRepository` | `sessions` | `startSession`, `updatePhotoPath`, `completeSession`, `getSession` |
| `UserRepository` | `users` | `createUser` |
| `OrganizationRepository` | org/event tables | org + event management |

**Adding a new repository:**

```typescript
// repositories/my-entity.repository.ts
import { getSupabaseAdminClient } from '../utils/supabase-admin'

export class MyEntityRepository {
  async create(data: MyEntityInsert): Promise<MyEntity> {
    const supabase = getSupabaseAdminClient()
    const { data: row, error } = await supabase
      .from('my_entities')
      .insert(data)
      .select()
      .single()

    if (error) throw new Error(`Failed to create entity: ${error.message}`)
    return row
  }
}
```

Rules:
- Always use `getSupabaseAdminClient()` (service role) — never the anon client
- After `if (error) throw`, TypeScript narrows `data` to non-null — do not add `?? []` or `!` guards
- All schema changes must also be committed to `apps/web/supabase/migrations/`

---

### Adding a New API Endpoint

1. **Create the route file** — `apps/web/src/routes/api.my-endpoint.ts`
   - Add auth check, input parsing, response shaping
2. **Create the use case** (if the operation touches multiple layers) — `usecases/my-feature.usecase.ts`
3. **Create repository methods** (if new table access is needed)
4. **Create service methods** (if a new external provider is needed)
5. **Add Supabase migration** if the DB schema changed — `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
6. **Update shared types** in `packages/types` if the endpoint input/output shape needs to be shared with the frontend
7. **Add input validation** in `utils/validation.ts` for user-supplied strings

---

## Shared Types Package

**Location:** `packages/types/src/`

This package is consumed by both `apps/frontend` and `apps/web` as `@photobooth/types`.

### EventConfig

The top-level config object fetched by the kiosk on startup. Stored as JSON in the `event_configs` Supabase table.

```typescript
interface EventConfig {
  eventId: string
  branding: BrandingConfig       // logos, colors, fonts, backgrounds
  moduleFlow: ModuleConfig[]     // ordered list of modules to display
  formFields: FormFieldsConfig   // which form fields to collect
  techConfig: TechConfig         // printer name, inactivity timeouts
}
```

### ModuleConfig

A discriminated union over all supported module types:

```typescript
type ModuleConfig =
  | WelcomeModuleConfig
  | ThemeSelectionModuleConfig
  | CameraModuleConfig
  | AiGenerationModuleConfig
  | FormModuleConfig
  | ResultModuleConfig
  | MiniQuizModuleConfig
  // Add new module config types here
```

Every member extends `BaseModuleConfig`:

```typescript
interface BaseModuleConfig {
  moduleType: string           // discriminant
  moduleId: string             // unique within the flow
  position: number             // display order
  outputKey?: string           // key used in moduleOutputs
  customization?: ElementCustomization
}
```

### ElementCustomization

Allows per-event overrides of text copy and CSS for individual UI elements within a module:

```typescript
interface ElementCustomization {
  elements: {
    [elementKey: string]: {
      copy?: string   // override display text
      css?: string    // inject CSS string
    }
  }
}
```

Applied at runtime via the `useElementCustomization()` hook which injects a `<style>` tag.

---

## Full Session Data Flow

```
┌── KIOSK (Electron) ─────────────────────────────────────────────────────┐
│                                                                          │
│  Startup                                                                 │
│  └─ GET /api/config?eventId=X  →  EventConfig cached in context         │
│                                                                          │
│  Module: welcome                                                         │
│  └─ POST /api/session/start  →  {sessionId}  stored in PipelineContext  │
│                                                                          │
│  Module: themeSelection                                                  │
│  └─ outputs: {selectedTheme: {id, label}}                               │
│                                                                          │
│  Module: camera                                                          │
│  └─ outputs: {originalPhoto: "data:image/png;base64,..."}               │
│                                                                          │
│  Module: aiGeneration                                                    │
│  ├─ POST /api/ai-generate  {userPhotoBase64, theme, eventId}            │
│  │   └─ uploads photo to Supabase temp/                                 │
│  │   └─ creates Replicate/Google prediction                             │
│  │   └─ returns {predictionId, tempPath, provider}                      │
│  └─ GET /api/ai-generate-status (polling)                               │
│      └─ on success: downloads result, deletes temp file                 │
│      └─ outputs: {finalPhoto: "data:image/png;base64,..."}              │
│                                                                          │
│  Module: form                                                            │
│  └─ outputs: {userInfo: {name, email, phone}}                           │
│                                                                          │
│  Module: result                                                          │
│  ├─ uploads finalPhoto to Supabase public/  (anon client)               │
│  ├─ POST /api/photo  {photoPath, userInfo, theme, sessionId, eventId}   │
│  │   ├─ UserRepository.createUser()      → users table                  │
│  │   ├─ SessionRepository.completeSession() → sessions table            │
│  │   └─ EmailService.sendPhotoEmail()   → Resend → guest inbox          │
│  ├─ displays QR code linking to public photo URL                        │
│  ├─ electronAPI.print()  → Electron main → DS-RX1 thermal printer      │
│  └─ SQLite local save (photo metadata, offline backup)                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Customization System

No redeploy is needed to customise an event. All UI text, styles, themes, and branding are driven by the `EventConfig` stored in the database.

### What Can Be Customised

| Layer | Mechanism | Where Stored |
|-------|-----------|-------------|
| Module flow (add/remove/reorder steps) | `EventConfig.moduleFlow` array | `event_configs` table |
| Branding (logo, background, colors, fonts) | `EventConfig.branding` | `event_configs` table |
| Form fields (which to collect) | `EventConfig.formFields` | `event_configs` table |
| Theme cards (AI prompt + frame image) | `ModuleConfig.themes[]` | `event_configs` table |
| Per-element text copy | `ElementCustomization.elements[key].copy` | `event_configs` table |
| Per-element CSS | `ElementCustomization.elements[key].css` | `event_configs` table |
| Inactivity timeout | `EventConfig.techConfig.inactivityTimeout` | `event_configs` table |

### Runtime Application

The `useElementCustomization(config)` hook:
1. Receives a module's `customization` config
2. Injects a `<style>` tag into the DOM for any CSS overrides
3. Returns a helper `t(key, fallback)` for text overrides

Each module passes its `config.customization` to this hook and uses the returned `t()` for all user-facing strings.

---

## Security Model

### API Authentication

Every backend route validates `Authorization: Bearer {API_CLIENT_KEY}`. Returns `401` on failure. The key is stored in `kiosk.config.json` on the kiosk device and in Cloudflare Workers secrets for the backend.

### Supabase Client Duality

| Client | Key Type | Used By | Allowed Operations |
|--------|----------|---------|-------------------|
| Anon client | `SUPABASE_ANON_KEY` | Frontend renderer | Upload to `public/` and `temp/` storage only |
| Admin client | `SUPABASE_SERVICE_KEY` | Backend API routes | Full DB read/write (bypasses RLS) |

`SUPABASE_SERVICE_KEY` **must never appear in frontend code or be committed to git**.

### IPC Bridge

The Electron preload script exposes only a narrowly scoped API via `contextBridge`. The renderer cannot access the Node.js runtime directly. Adding new IPC methods requires an explicit addition to both `main.ts` and `preload.ts`.

### Input Sanitization

All user-supplied strings are sanitized before DB writes (`utils/validation.ts`):
- Names: strip `<>` and control characters, max 100 chars
- Email: regex validation
- Phone: Indonesian format validation (`+62` / `62` / `0` prefix), normalised to `+62`

---

## Error Handling Conventions

### Frontend

- Async operations in modules use `try/catch` and surface errors via `<Toast>` notifications
- `EventConfigContext` caches the last successful config in a ref — transient network failures do not reset the kiosk
- Long AI polling suppresses the inactivity timer via `suppressInactivity(true)`
- IPC handlers return `{ success: boolean, data?, error? }` — callers check `success` before using `data`

### Backend

- Every route returns a typed error response: `{ error: string }` with an appropriate HTTP status code
- Input validation failures return `400`; auth failures return `401`
- Catch blocks include the original error message in dev and a generic message in production
- Replicate and Google AI failures try the fallback provider before giving up
- Temp Supabase storage files are cleaned up on both success and error paths

### AI Generation Errors

| Scenario | Behaviour |
|----------|-----------|
| Primary provider times out | Retry with `providerFallback` from ModuleConfig |
| Both providers fail | Return `{ status: "failed" }` — frontend shows error + retry |
| Temp file cleanup fails | Logged; does not affect the user-facing result |

---

## Key Configuration Files

### `pnpm-workspace.yaml`

Defines the workspace packages:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### `apps/frontend/electron.vite.config.ts`

Vite config for the three Electron entry points: main, preload, renderer.

### `apps/web/app.config.ts`

TanStack Start config. Controls server target (Cloudflare Workers), Vite plugins, and route generation.

### `apps/web/wrangler.toml`

Cloudflare Workers deployment config. Environment variables for production are set via `npx wrangler secret put <KEY>` — do not commit secrets here.

### `{userData}/kiosk.config.json` (runtime, not in git)

Written by the KioskSettings overlay (`Ctrl+Shift+S`). Contains:

```json
{
  "eventId": "shell-motogp-2025",
  "apiBaseUrl": "https://your-worker.workers.dev",
  "apiClientKey": "..."
}
```

If absent, falls back to Vite env vars (development only).
