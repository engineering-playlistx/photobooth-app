# Feature: Result Display

## Overview

The result screen is the final step of the user journey. It displays the AI-generated and frame-composited photo, automatically saves it locally and to the cloud, triggers printing on the thermal printer, generates a QR code for the user to download their photo, and provides action buttons for printing/downloading and retrying.

---

## Route

`/result` — `apps/frontend/src/routes/result.tsx`

Navigated to from `/loading` after `finalPhoto` is set in context. "Back to Home" calls `reset()` and navigates to `/`.

---

## Technical Architecture

### On Mount — Automatic Actions

When the result screen loads, several side effects fire in parallel (or near-parallel):

1. **Save photo to local filesystem**
   ```typescript
   electronAPI.savePhotoFile(finalPhoto, fileName)
   // → IPC → main.ts → saves to userData/photos/<fileName>.png
   ```

2. **Save record to SQLite**
   ```typescript
   electronAPI.db.savePhotoResult({
     id, photo_path, selected_theme, user_info, created_at, updated_at
   })
   // → IPC → main.ts → INSERT into photo_results table
   ```

3. **Upload to Supabase Storage**
   ```typescript
   supabase.storage.from("photobooth-bucket").upload(`public/${uuid}-${name}.png`, blob)
   ```
   The base64 `finalPhoto` is converted to a `Blob` before upload.

4. **Submit to backend** (`POST /api/photo`)
   Sends `photoPath`, `name`, `email`, `phone`, `selectedTheme` to the web backend, which inserts a record into the Supabase `users` table.

5. **Auto-print** (production only, 1-second delay)
   ```typescript
   electronAPI.print(filePath)
   // → IPC → main.ts → creates hidden BrowserWindow, sends to DS-RX1
   ```
   Auto-print is disabled in development mode (`!window.electronAPI.isElectron` or dev env check).

### QR Code

After the photo is uploaded to Supabase, a public URL is available. A QR code is generated from this URL using `qrcode.react` and displayed on screen, letting the user scan it with their phone to download the photo.

```typescript
import QRCode from "qrcode.react";
<QRCode value={publicPhotoUrl} size={200} />
```

### User Actions

| Button | Action |
|--------|--------|
| "Print & Download" | Triggers `electronAPI.print()` explicitly; also allows the user to re-trigger print |
| "Retry Result" | Navigates back to `/loading` to re-run AI generation with the same photo/theme/userInfo |
| "Back to Home" | Calls `PhotoboothContext.reset()`, navigates to `/` |

### Display

- The `finalPhoto` (base64 PNG, 1080×1920) is rendered in an `<img>` tag
- Layout is centered in the 9:16 kiosk viewport

---

## State Read

Reads from `PhotoboothContext`:
- `finalPhoto` — the composited image to display
- `selectedTheme` — included in the SQLite save payload
- `userInfo` — included in both the SQLite and backend save payloads

Guard: if `finalPhoto` or `selectedTheme` is null when this route loads (e.g., user navigated here directly), the screen redirects back to `/`.

---

## Intersection with Other Features

| Feature | Intersection |
|---------|-------------|
| [AI Photo Generation](feat-ai-photo-generation.md) | Consumes `finalPhoto` set by the loading screen. |
| [Local Persistence](feat-local-persistence.md) | Saves photo file and SQLite record on mount. |
| [Cloud Storage & User Record](feat-cloud-storage-user-record.md) | Uploads photo to Supabase and calls `POST /api/photo` to create user record. |
| [Printing](feat-printing.md) | Triggers auto-print via `electronAPI.print()` on mount; manual print via button. |
| [Admin Data Viewer](feat-admin-data-viewer.md) | The SQLite record written here is what appears in the admin table. |

---

## Notes

- Auto-save to SQLite and filesystem is unconditional — it always fires on mount regardless of user action.
- The Supabase upload and `POST /api/photo` are triggered together; if Supabase upload fails, the backend call is skipped (no photo path to save).
- "Retry Result" re-runs the AI generation — useful if the face-swap output quality is poor. It does NOT re-capture a new photo.
- A toast notification is shown to confirm when the email/cloud submission succeeds or fails.
