# Shell Photobooth — Product Design Document

**Version:** 2.0
**Status:** Draft
**Last updated:** 2026-03-30

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Business Model](#2-business-model)
3. [Stakeholders & Roles](#3-stakeholders--roles)
4. [Event Lifecycle](#4-event-lifecycle)
5. [User Experience Design](#5-user-experience-design)
   - [Operator — Dashboard](#51-operator--dashboard)
   - [Guest — Kiosk](#52-guest--kiosk)
   - [Guest — Web Result Portal](#53-guest--web-result-portal)
6. [Module System](#6-module-system)
7. [Technical Architecture](#7-technical-architecture)
8. [V1 Roadmap — Immediate Priorities](#8-v1-roadmap--immediate-priorities)
9. [V2 Roadmap — New Architecture](#9-v2-roadmap--new-architecture)
10. [Resolved Decisions](#10-resolved-decisions)

---

## 1. Product Vision

Shell Photobooth is a **managed, AI-powered, modular photobooth platform** sold as a service to brands, marketing agencies, and venue operators.

The product has two layers:

- **The kiosk app** — an Electron desktop application deployed at live events. Guests interact with a configurable, branded experience: they take photos, engage with pre/post-photo modules (quizzes, AI generation, games), and receive a personalized result.
- **The platform** — a dashboard and backend that lets the operator (Shell's team) configure each event remotely: branding, modules, AI settings, form fields, and more — without touching code or redeploying the app.

**The core differentiators:**
1. AI-powered photo experiences (face-swap, costume change, generative templates — with more to come)
2. A fully modular flow — the experience is assembled from interchangeable modules per event
3. Deep configurability — every visual and functional aspect is controlled from the dashboard, not from code

---

## 2. Business Model

| Dimension | Description |
|-----------|-------------|
| **Model** | B2B, managed deployment service |
| **Customers** | Marketing agencies, brand activation teams, brands, venue owners |
| **Delivery** | Shell's team physically deploys and operates the kiosk at each event |
| **Client role** | Provides assets and approves the visual design; may view the dashboard but rarely configures it directly |
| **Data handover** | Post-event: Shell exports data (CSV, photo archive) and hands it to the client; dashboard access is a self-serve supplement |
| **Multi-tenancy** | Vision for the future. V1 operates as one backend per client. V2 introduces proper multi-tenancy. |

---

## 3. Stakeholders & Roles

Three distinct actors interact with the product:

### Operator (Shell's Team)
The primary user of the dashboard. Configures events, manages branding and modules, monitors live events, and exports post-event data. Has full access to all settings.

### Client (Brand / Agency / Venue)
The paying customer. Provides assets and approves design. May be given read access to the dashboard to view live event progress and download their data independently — but is unlikely to touch configuration.

### Guest (Event Attendee)
The end user of the kiosk. Does not interact with the dashboard. Uses the kiosk during the event and optionally visits the web result portal to download or share their photo afterward.

---

## 4. Event Lifecycle

```
PRE-EVENT
─────────────────────────────────────────────────────────────────────────────
  Client brief        Asset handover       Dashboard config      Kiosk setup
  ─────────────▶      ──────────────▶      ─────────────────▶    ──────────▶
  Requirements,       Logos, images,       Operator creates      Hardware +
  theme, modules      frame overlays,      event, uploads        software
  requested           AI templates         assets, configures    deployed at
                                           modules & branding    venue

DURING EVENT
─────────────────────────────────────────────────────────────────────────────
  Kiosk live          Guests flow          Photos saved          Monitoring
  ─────────────▶      ──────────────▶      ─────────────────▶    ──────────▶
  App fetches         Module pipeline:     Local SQLite +        Dashboard:
  EventConfig         quiz → camera →      Supabase upload,      guest count,
  from backend        AI generation →      print to DS-RX1       photo preview
  on startup          result page

POST-EVENT
─────────────────────────────────────────────────────────────────────────────
  Data export         Client handover      Guest access
  ─────────────▶      ──────────────▶      ──────────────▶
  CSV of guests,      Report delivered     QR code from
  photo archive       via dashboard,       result screen →
  downloaded          email, or chat       web result portal
                                           (download + share)
```

---

## 5. User Experience Design

### 5.1 Operator — Dashboard

The dashboard is a web application (part of `apps/web`) used primarily by the operator to configure events and access post-event data. Clients may also be given access to view data.

#### Information Architecture

```
Dashboard
├── Events
│   ├── Event List  (active · upcoming · past)
│   └── Event Detail
│       ├── Overview        — status, guest count, photo count
│       ├── Flow Builder    — configure module pipeline
│       ├── Branding        — logo, colors, backgrounds, fonts
│       ├── Form Fields     — what data to collect from guests
│       ├── AI Config       — provider, themes, templates, prompts
│       ├── Tech Config     — printer, inactivity timeout, etc.
│       ├── Guests          — live list, search, CSV export
│       └── Photos          — gallery, individual + bulk download
└── Settings              — global defaults
```

#### Key Screens

**Event List**
- Table of events with name, client, date range, and status
- "New Event" and "Duplicate Event" actions (duplicate reuses a prior config as a starting point)

**Event Detail — Overview**
- Live stats: guest count, photos taken, prints sent
- Event metadata: client name, venue, dates
- Status controls: Draft → Active → Ended

**Event Detail — Flow Builder**

The most critical screen. The operator assembles the guest experience by selecting and ordering modules into a pipeline:

```
┌──────────────────────────────────────────────────────┐
│  Guest Flow                                          │
│                                                      │
│  ┌─────────────────────────────┐                     │
│  │  Welcome Screen             │  ← fixed, always 1st│
│  └──────────────┬──────────────┘                     │
│                 │                                    │
│  ┌──────────────▼──────────────┐                     │
│  │  Mini Quiz      [× remove]  │  ← pre-photo slot   │
│  │  (3 questions)  [⚙ config]  │    draggable        │
│  └──────────────┬──────────────┘                     │
│                 │                                    │
│  ┌──────────────▼──────────────┐                     │
│  │  Theme Selection [× remove] │  ← pre-photo, tied  │
│  │  (3 themes)      [⚙ config] │    to AI module     │
│  └──────────────┬──────────────┘                     │
│                 │                                    │
│  ┌──────────────▼──────────────┐                     │
│  │  Camera Capture             │  ← fixed            │
│  └──────────────┬──────────────┘                     │
│                 │                                    │
│  ┌──────────────▼──────────────┐                     │
│  │  AI Generation  [× remove]  │  ← post-photo slot  │
│  │  (face-swap)    [⚙ config]  │                     │
│  └──────────────┬──────────────┘                     │
│                 │                                    │
│  ┌──────────────▼──────────────┐                     │
│  │  Result & Share             │  ← fixed, always last│
│  └─────────────────────────────┘                     │
│                                                      │
│  [+ Add Module]                                      │
└──────────────────────────────────────────────────────┘
```

Each module card expands inline to configure its content (questions, prompts, theme assets, etc.).

**Event Detail — Branding**
- Upload: logo, background images/video per screen (or global fallback)
- Color pickers: primary, secondary, accent, text
- Font selection
- Live preview: renders a mockup of the kiosk UI with current settings applied

**Event Detail — Form Fields**
- Toggle standard fields on/off: name, email, phone (all on by default)
- Add custom fields: short text, dropdown, checkbox
- Mark fields as required or optional
- Drag to reorder

**Event Detail — AI Config**
- Select AI provider: `Google AI Studio` or `Replicate`
- Per-theme configuration:
  - Theme label and preview image
  - Template image (upload or URL)
  - Face-swap prompt
- Test panel: upload a sample photo and run a test generation to preview output

**Event Detail — Tech Config**
- API key overrides (if different from global defaults)
- Kiosk: resolution, fullscreen mode, inactivity timeout (seconds)
- Printer: device name, paper size
- Guest portal: enable/disable, custom post-event message

**Event Detail — Guests**
- Real-time table: name, email, phone, theme, timestamp
- Search and filter
- Export CSV

**Event Detail — Photos**
- Gallery of all generated photos for this event
- Download individual photo or bulk ZIP

---

### 5.2 Guest — Kiosk

The kiosk experience is a sequential pipeline of modules. The sequence is defined per event in the dashboard and delivered to the kiosk as an `EventConfig` payload fetched from the backend on startup.

#### Startup Sequence

```
App launches
    │
    ├── Read local kiosk.config.json: { eventId, apiBaseUrl, apiClientKey }
    │
    ├── GET /api/config?eventId=<id>
    │   ← EventConfig { branding, moduleFlow, formFields, aiConfig, techConfig }
    │
    ├── Apply branding (CSS custom properties, dynamic asset URLs)
    │
    └── Begin guest flow from first module in moduleFlow
```

Config is re-fetched at the start of each new guest session, so dashboard changes take effect within one session cycle — no kiosk restart needed.

#### Example Flows

**Simple AI photobooth:**
```
Welcome → Camera → AI Generation → Result
```

**Branded experience with pre-photo engagement:**
```
Welcome → Mini Quiz → Theme Selection → Camera → AI Generation → Result
```

**Post-photo engagement:**
```
Welcome → Camera → AI Generation → Personality Reveal → Result
```

#### General Kiosk UX Principles

- **Touch/tap** is the primary input (no physical keyboard)
- **On-screen keyboard** appears for text fields
- **Back button** is visible on all non-first steps (returns to previous module)
- **Inactivity timeout** — if no input for N seconds, return to Welcome screen and reset session
- All content (copy, images, colors, fonts) comes from `EventConfig` — zero hardcoded branding

---

### 5.3 Guest — Web Result Portal

A lightweight web page guests visit by scanning the QR code shown on the kiosk result screen.

URL pattern: `https://<domain>/result/<sessionId>`

#### V1 (Minimal — immediate)
- Display the guest's final photo
- "Download" button (PNG)
- Event branding applied (logo, primary color)
- No login required — the session ID in the URL is the access key

#### V2+ (Extended)
- Multiple result items per session: photo, GIF, boomerang, 360 video
- Social share buttons (Instagram, WhatsApp, etc.)
- Optional brand call-to-action (custom message/button from the client)
- Optional: display quiz result or personality type if those modules were used

The portal is a server-rendered page in `apps/web` that queries Supabase by session ID.

---

## 6. Module System

### Concept

The kiosk flow is a **sequential pipeline of modules**. Each module is a self-contained unit of UX with:
- A defined **position type** (which slots it is valid for)
- A typed **configuration schema** (what the operator sets per event)
- A defined **output** written to the shared session context (readable by downstream modules)

### Module Positions

| Position | Description | Constraints |
|----------|-------------|-------------|
| `fixed-first` | Always the first step | Welcome screen only |
| `pre-photo` | Before camera capture | e.g. quiz, theme selection |
| `fixed-camera` | The capture step | Always exactly one, always fixed |
| `post-photo` | After capture, before result | e.g. AI generation, filter picker |
| `fixed-last` | Always the last step | Result screen only |
| `flexible` | Can be placed pre or post | e.g. mini quiz, personality reveal |

The operator can add, remove, and reorder modules freely within their allowed positions. Fixed modules (`fixed-first`, `fixed-camera`, `fixed-last`) are always present and cannot be moved or removed.

### Module Catalog

| Module | Position | Status | Description |
|--------|----------|--------|-------------|
| Welcome Screen | fixed-first | ✅ Current | Splash screen, tap to start |
| Camera Capture | fixed-camera | ✅ Current | Countdown + photo capture, retake support |
| Theme Selection | pre-photo | ✅ Current | Pick an AI theme (costume/scene) |
| AI Generation | post-photo | ✅ Current | Face-swap / costume change via Google AI or Replicate |
| Result & Share | fixed-last | ✅ Current | Display photo, QR code, print |
| Personality Quiz | flexible | 🔄 Legacy | Full personality test → archetype (was removed; can be restored as a module) |
| Mini Quiz | flexible | 🔜 V2 | 2–3 question short quiz |
| Frame / Filter Picker | post-photo | 🔜 V2 | Decorative frame or color filter |
| Game | flexible | 🔜 Future | Tap/swipe mini-game |
| Sticker Picker | post-photo | 🔜 Future | Place stickers on photo |
| Generative AI Template | pre+post | 🔜 Future | Fully generative background (beyond face-swap) |

### Module Configuration Schema (Concept)

Each module has a typed config object stored in `EventConfig.moduleFlow`:

```typescript
// AI Generation module
{
  moduleId: "ai-generation",
  position: "post-photo",
  provider: "google" | "replicate",
  themes: [
    {
      id: string,
      label: string,
      previewImageUrl: string,
      templateImageUrl: string,
      prompt: string,
    }
  ]
}

// Mini Quiz module
{
  moduleId: "mini-quiz",
  position: "pre-photo",  // or "post-photo" — operator chooses
  questions: [
    {
      text: string,
      options: string[],
    }
  ],
  outputKey: "quizAnswer",  // written to session context for downstream use
}
```

### Session Context — Module Data Flow

As modules execute, they write outputs to a shared session object. Downstream modules can read earlier outputs:

```
Welcome Screen     → (no output)
    ↓
Mini Quiz          → writes quizAnswer
    ↓
Theme Selection    → writes selectedTheme
    ↓
Camera Capture     → writes originalPhoto
    ↓
AI Generation      → reads selectedTheme + originalPhoto
                   → writes finalPhoto
    ↓
Result & Share     → reads finalPhoto + quizAnswer + userInfo
                   → triggers save, upload, print
```

---

## 7. Technical Architecture

### High-Level Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kiosk (Electron)  ×N per event                                      │
│                                                                      │
│  Reads EventConfig on startup → renders module pipeline dynamically  │
│  Submits sessions + photos to backend                                │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS / Bearer Token
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Backend (TanStack Start / Cloudflare Workers)                       │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────┐  │
│  │  Config API      │  │  AI API          │  │  Submission API      │  │
│  │  GET /api/config │  │  POST /api/ai-gen│  │  POST /api/photo     │  │
│  └─────────────────┘  └─────────────────┘  └──────────────────────┘  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Dashboard  (/dashboard/*)                                      │  │
│  │  Event mgmt · Branding · Module config · Guest data · Photos    │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Guest Portal  (/result/:sessionId)                             │  │
│  │  Download photo · Share · Branding                              │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Supabase                                                            │
│  PostgreSQL:  events · event_configs · sessions · guests · photos   │
│  Storage:     photobooth-bucket  (photos · assets · templates)      │
└──────────────────────────────────────────────────────────────────────┘
```

### New Core Concepts

#### EventConfig
A JSON document stored in Supabase, served by `GET /api/config?eventId=<id>`. It is the single source of truth for everything the kiosk renders. Structure:

```typescript
interface EventConfig {
  eventId: string;
  branding: {
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    backgroundUrl: string;           // global fallback
    screenBackgrounds?: Record<string, string>;  // per-module overrides
  };
  moduleFlow: ModuleConfig[];        // ordered array — kiosk executes in sequence
  formFields: FormFieldConfig[];
  aiConfig: {
    provider: "google" | "replicate";
    apiKeyOverride?: string;         // if null, use global backend key
  };
  techConfig: {
    printerName: string;
    inactivityTimeoutSeconds: number;
    guestPortalEnabled: boolean;
    guestPortalMessage?: string;
  };
}
```

#### Kiosk Local Config
Each physical kiosk has a small local config file (`kiosk.config.json`) written once during setup. It contains only:
```json
{
  "eventId": "evt_abc123",
  "apiBaseUrl": "https://photobooth.domain.com",
  "apiClientKey": "..."
}
```
Everything else is fetched remotely. This is what makes the kiosk re-configurable without redeployment or code changes.

#### Session
One complete guest run through the kiosk. Created when the guest starts, closed on result screen. Enables the guest portal URL and links all data (guest info, photos, module outputs) together.

```typescript
interface Session {
  id: string;            // used as the QR code key
  eventId: string;
  guestInfo: GuestInfo;  // from form fields
  moduleOutputs: Record<string, unknown>;  // keyed by outputKey per module
  photoPath: string;     // Supabase storage path
  createdAt: string;
}
```

### V1 vs V2 Technical Scope

#### V1 — Configuration-Driven (No Architecture Rewrite)

Keep the current stack and file structure. Add these capabilities on top:

| Change | Description |
|--------|-------------|
| `GET /api/config` endpoint | Reads event config from Supabase, returns `EventConfig` JSON |
| Kiosk config file | Replace `.env` with `kiosk.config.json` — `eventId` + API credentials only |
| Branding injection | CSS custom properties + dynamic asset `src` from `EventConfig.branding` |
| AI config from DB | Move `AI_PROVIDER`, API keys, prompts, and template URLs from Cloudflare env into the event config in Supabase |
| Basic dashboard | Event overview, branding editor, AI config editor, guest list, photo gallery |
| Guest portal page | `/result/:sessionId` — replaces raw Supabase storage URL |

#### V2 — Full Modular Architecture

| Area | Change |
|------|--------|
| Module registry | Each module is a registered React component with a declared config schema and position type |
| Dynamic pipeline renderer | Kiosk reads `moduleFlow` array and renders each module component in sequence |
| Session model | Full `sessions` table in Supabase; each guest run creates a row |
| Flow builder UI | Dashboard drag-and-drop (or ordered list) builder for the module pipeline |
| Asset management | Upload assets (frames, templates, backgrounds) via dashboard → Supabase Storage |
| Form field builder | Add/remove/configure form fields in dashboard |
| Multi-tenancy foundation | `organizations` table; all data scoped behind org ID |
| Guest portal V2 | Multiple result items, social share, brand CTA |

### Data Model (V2 Target)

```
organizations
  └─ events
       ├─ event_config       (1:1 JSON blob)
       ├─ kiosk_instances    (many — each physical device)
       └─ sessions           (one per guest run)
            ├─ guest_info
            ├─ module_outputs (JSON — keyed by outputKey)
            └─ photos         (one or more per session)
```

### Config Fetch Flow (V1+)

```
Kiosk app starts
    │
    ├── Read kiosk.config.json → { eventId, apiBaseUrl, apiClientKey }
    │
    ├── GET /api/config?eventId=<id>
    │   Authorization: Bearer <apiClientKey>
    │   ← EventConfig JSON
    │
    ├── Apply CSS custom properties from branding config
    │
    ├── Load dynamic assets (logo, backgrounds) from config URLs
    │
    └── Render module pipeline from config.moduleFlow

New guest session starts (tap "Welcome")
    │
    └── Re-fetch EventConfig (picks up any changes made in dashboard)
```

---

## 8. V1 Roadmap — Immediate Priorities

> Goal: enable remote configuration without code changes, basic dashboard, proper guest portal.

### P0 — Remote Configuration (Unlocks Everything Else)

| Task | Notes |
|------|-------|
| `GET /api/config` endpoint | Reads `EventConfig` from Supabase by `eventId` |
| `event_configs` table in Supabase | Stores the JSON config blob per event |
| Replace `.env` vars with DB-driven config | AI provider, API keys, prompts, template URLs move from Cloudflare env → event config |
| `kiosk.config.json` local file | Replace `VITE_API_BASE_URL`, `VITE_API_CLIENT_KEY`, `VITE_SUPABASE_*` env vars |
| Branding injection on kiosk | CSS vars + dynamic `src` applied from fetched config |

### P1 — Dashboard (Operator Tool)

| Task | Notes |
|------|-------|
| Event list + detail pages | Basic CRUD for events in the dashboard |
| Branding editor | Logo upload, color pickers, background upload; live preview |
| AI config editor | Provider toggle, per-theme prompt + template editor, test generation |
| Guest list | Real-time table + CSV export |
| Photo gallery | View + download photos per event |

### P2 — Guest Portal

| Task | Notes |
|------|-------|
| `/result/:sessionId` page | Proper web page: photo display + download button + event branding |
| Session record creation | Backend creates a session row on `POST /api/photo` with a session ID |
| QR code update on kiosk | Points to `/result/<sessionId>` instead of raw Supabase URL |

---

## 9. V2 Roadmap — New Architecture

> Goal: full modular system, proper event/session data model, groundwork for multi-tenancy.

| Area | Tasks |
|------|-------|
| **Module system** | Module registry, position types, dynamic pipeline renderer in kiosk |
| **Flow builder** | Dashboard UI to add/remove/reorder modules; per-module config panels |
| **Session model** | `sessions` table; create on session start, close on result; links guest + photos |
| **Data model migration** | Move from flat `users` table to `events / sessions / photos` schema |
| **Asset management** | Dashboard upload for frames, templates, backgrounds → Supabase Storage |
| **Form field builder** | Add/remove/configure fields in dashboard; kiosk renders dynamically |
| **Multi-tenancy foundation** | `organizations` table; scope all entities behind org ID |
| **Guest portal V2** | Multiple result items (photo, GIF, video), social share, brand CTA |
| **Mini Quiz module** | First new module built on the V2 module system |

---

## 10. Resolved Decisions

| Decision | Resolution |
|----------|------------|
| **Kiosk pairing UX** | Manual `kiosk.config.json` file edit for now. A QR-code pairing flow is a future improvement. |
| **Module position rules — enforcement** | Frontend validation only for now. Schema-level enforcement can be added later. |
| **Multi-kiosk coordination** | No additional cross-kiosk sync needed. Supabase's existing real-time capabilities are sufficient. |
| **Client dashboard access** | No dashboard access for clients. Clients prefer a simple daily report handed to them — they are too busy to check dashboards themselves. Automated daily report delivery (email/chat) is a V2 consideration. |
| **Email delivery re-enablement** | V2 feature. `EmailService` remains disabled in `SubmitPhotoUseCase` for V1. |
| **Asset storage organization** | Assets are organized per event in Supabase Storage paths (e.g. `events/<eventId>/frames/`, `events/<eventId>/templates/`). |
| **Inactivity timeout behavior** | Partial session data (captured photo, form input) is held temporarily when timeout fires. The session can be manually reset by the operator if needed (e.g. for a new guest who is not the same person). |
