# Feature: Admin Data Viewer

## Overview

The admin data viewer is a hidden screen accessible only to event staff. It displays all photobooth session records stored in the local SQLite database, showing each user's contact info, selected theme, and a thumbnail of their result photo. It also provides a CSV export for data collection purposes.

---

## Route

`/data` — `apps/frontend/src/routes/data.tsx`

This route is **not linked from any user-facing screen**. It is accessed via:
- Keyboard shortcut: `Ctrl+D` (Windows/Linux) or `Cmd+D` (macOS)
- Electron application menu → navigates via `navigate-to-data` IPC event

---

## Technical Architecture

### Data Loading

On mount, the admin page reads all records from the local SQLite database via IPC:

```typescript
const results = await electronAPI.db.getAllPhotoResults();
```

This calls the `db-get-all-photo-results` IPC channel in `main.ts`, which runs:

```sql
SELECT * FROM photo_results ORDER BY created_at DESC;
```

Returns an array of `PhotoResult` objects:

```typescript
interface PhotoResult {
  id: string;
  photo_path: string;
  selected_theme: string;   // JSON string: { theme: "pitcrew"|"motogp"|"f1" }
  user_info: string;        // JSON string: { name, email, phone }
  created_at: string;
  updated_at: string;
}
```

`selected_theme` and `user_info` are parsed from JSON strings before display.

### Table Display

The page renders a sortable table with columns:

| Column | Source |
|--------|--------|
| # | Row index |
| Created At | `created_at` |
| Name | `JSON.parse(user_info).name` |
| Email | `JSON.parse(user_info).email` |
| Phone | `JSON.parse(user_info).phone` |
| Theme | `JSON.parse(selected_theme).theme` |
| Photo | Thumbnail via `local-file://` protocol |

### Photo Thumbnails

Saved photo files are stored on the local filesystem. To display them in the renderer without violating Electron's security sandbox, the custom `local-file://` protocol registered in `main.ts` is used:

```typescript
<img src={`local-file://${result.photo_path}`} />
```

Clicking a thumbnail opens a larger view of the saved photo.

### CSV Export

A "Export CSV" button serializes the in-memory results array to a CSV string and triggers a browser download:

```typescript
const csv = [
  ["ID", "Name", "Email", "Phone", "Theme", "Created At"],
  ...results.map(r => [
    r.id,
    JSON.parse(r.user_info).name,
    JSON.parse(r.user_info).email,
    JSON.parse(r.user_info).phone,
    JSON.parse(r.selected_theme).theme,
    r.created_at,
  ])
].map(row => row.join(",")).join("\n");

const blob = new Blob([csv], { type: "text/csv" });
const url = URL.createObjectURL(blob);
// trigger download link click
```

### Navigation Back

A "Back to Home" button navigates to `/` without resetting `PhotoboothContext` (the admin page does not interact with session state).

---

## Access Control

This screen has no authentication — it is secured purely by obscurity (hidden route + keyboard shortcut). The assumption is that only event staff have physical access to the kiosk machine.

If additional access control is needed in the future, the Electron menu shortcut could be restricted to a specific keyboard sequence, or a PIN prompt could be added before the route renders.

---

## Intersection with Other Features

| Feature | Intersection |
|---------|-------------|
| [Local Persistence](feat-local-persistence.md) | Reads all `photo_results` rows via `electronAPI.db.getAllPhotoResults()`. The `photo_path` field points to files written by `savePhotoFile()`. |
| [Theme Selection](feat-theme-selection.md) | The "Theme" column displays `selected_theme.theme` from each record. |
| [User Form](feat-user-form.md) | Name, email, and phone displayed in the table come from the `user_info` JSON stored in SQLite. |

---

## Notes

- All data shown is **local only** — the admin page reads from the on-device SQLite database, not from Supabase. Remote participant records in Supabase are accessible via the Supabase dashboard or a separate query tool.
- The `download-photos.mjs` script in `/scripts/` provides a separate tool for bulk-downloading photos from the Supabase bucket (see [docs/download-photos-guide.md](../download-photos-guide.md)).
- The admin page does not support editing or deleting records.
