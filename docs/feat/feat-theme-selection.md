# Feature: Theme Selection

## Overview

The theme selection screen is the entry point of the photobooth session after the splash screen. The user picks one of three racing themes — **Pit Crew**, **MotoGP Rider**, or **F1 Driver** — which determines the AI face-swap prompt, the frame overlay applied to the final photo, and the theme metadata stored in the session and database.

---

## Route

`/select` — `apps/frontend/src/routes/select.tsx`

Navigated to from `/` (Home). On selection, navigates to `/camera`.

---

## Technical Architecture

### UI

- Displays 3 touch-friendly cards, one per theme
- Each card contains a preview image and title/description
- Card tap calls `setSelectedTheme({ theme })` and navigates to `/camera`
- Back button returns to `/`

Preview images are local static assets:
```
apps/frontend/public/images/theme-pitcrew.png
apps/frontend/public/images/theme-motogp.png
apps/frontend/public/images/theme-f1.png
```

### State Written

Writes to `PhotoboothContext.selectedTheme`:

```typescript
type RacingTheme = "pitcrew" | "motogp" | "f1";

selectedTheme: { theme: RacingTheme } | null
```

This value persists in context for the rest of the session and is read by:
- `/loading` — to pass the theme to the AI generation API
- `/result` — as part of the save payload
- `electronAPI.db.savePhotoResult()` — stored in SQLite as JSON

### Theme Configuration

Themes are defined in `PhotoboothContext.tsx` as `RACING_THEMES`:

```typescript
export const RACING_THEMES: Record<RacingTheme, { title: string; description: string }> = {
  pitcrew: { title: "Pit Crew",      description: "Join the elite racing support team" },
  motogp:  { title: "MotoGP Racer",  description: "Feel the speed on two wheels" },
  f1:      { title: "F1 Racer",      description: "Experience Formula 1 glory" },
};
```

---

## Intersection with Other Features

| Feature | How Theme Flows In |
|---------|--------------------|
| [AI Photo Generation](feat-ai-photo-generation.md) | `selectedTheme.theme` is sent as the `theme` field in `POST /api/ai-generate`. The backend maps it to a face-swap prompt and template image URL via env vars. |
| [Result Display](feat-result-display.md) | Theme is included in the `savePhotoResult` payload stored in SQLite. |
| [Cloud Storage & User Record](feat-cloud-storage-user-record.md) | `selectedTheme` is passed as `selectedTheme` to `POST /api/photo`, stored in Supabase `users.selected_theme`. |
| [Admin Data Viewer](feat-admin-data-viewer.md) | The "Theme" column in the admin table reads from `selected_theme` stored in SQLite. |

---

## Reset

`PhotoboothContext.reset()` sets `selectedTheme` back to `null`. This is called when the user navigates back to `/` from the result screen.
