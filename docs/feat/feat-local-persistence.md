# Feature: Local Persistence

## Overview

All photobooth session data is persisted locally before any cloud operation is attempted. This makes the app **offline-first** — even without internet connectivity, photos are saved to disk and the session is recorded in a local SQLite database. Local persistence is triggered automatically from the result screen on mount.

---

## Files

| File | Role |
|------|------|
| `apps/frontend/src/main.ts` | IPC handlers for file save + SQLite operations |
| `apps/frontend/src/database/sqlite.ts` | SQLite schema, query functions |
| `apps/frontend/src/utils/database.ts` | High-level API used by the renderer |
| `apps/frontend/src/utils/filesystem.ts` | base64 → file conversion |
| `apps/frontend/src/preload.ts` | Exposes `electronAPI.db` and `electronAPI.savePhotoFile` |

---

## Technical Architecture

### Why IPC for Storage

The renderer (React) runs in a sandboxed browser context with no direct filesystem or SQLite access. To read/write files or the database, the renderer calls IPC methods exposed via the preload script, which the main process handles.

```
Renderer (React)
    └── window.electronAPI.savePhotoFile(...)    [preload IPC call]
    └── window.electronAPI.db.savePhotoResult(...)
            │
            ▼
    Main Process
            ├── Writes file to userData/photos/
            └── INSERTs into SQLite
```

### Photo File Storage

**IPC Channel:** `save-photo-file`

The renderer passes the `finalPhoto` base64 string and a file name. The main process:
1. Decodes the base64 string to a `Buffer`
2. Writes the buffer to `app.getPath('userData')/photos/<fileName>.png`
3. Returns the absolute file path to the renderer

```typescript
// In renderer (result page):
const filePath = await electronAPI.savePhotoFile(finalPhoto, `photo-${id}.png`);
```

**Storage location:** `<Electron userData>/photos/`

On Windows this is typically: `C:\Users\<user>\AppData\Roaming\<AppName>\photos\`

### SQLite Database

**IPC Channel:** `db-save-photo-result`

**Database location:** `app.getPath('userData')/photobooth.db`

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS photo_results (
  id             TEXT PRIMARY KEY,
  photo_path     TEXT NOT NULL,
  selected_theme TEXT NOT NULL,    -- JSON: { theme: "pitcrew"|"motogp"|"f1" }
  user_info      TEXT NOT NULL,    -- JSON: { name, email, phone }
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photo_results_created_at ON photo_results(created_at);
CREATE INDEX IF NOT EXISTS idx_photo_results_photo_path ON photo_results(photo_path);
```

**SQLite engine:** Node.js built-in `DatabaseSync` (available since Node 22, synchronous API). No native module binding or compilation required.

**Insert operation** (`sqlite.ts`):

```typescript
db.prepare(`
  INSERT OR REPLACE INTO photo_results
    (id, photo_path, selected_theme, user_info, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(id, photoPath, JSON.stringify(selectedTheme), JSON.stringify(userInfo), createdAt, updatedAt);
```

`INSERT OR REPLACE` is used for idempotency — if the same result screen is revisited (e.g., via "Retry Result"), the record is updated in place.

### High-Level API (`utils/database.ts`)

The renderer uses `database.ts` as the interface to local storage, abstracting the IPC calls:

```typescript
// Save a result
await savePhotoResult({
  id: uuid,
  photoPath: filePath,
  selectedTheme: { theme: "f1" },
  userInfo: { name, email, phone },
});

// Read all results (used by /data admin page)
const results = await getAllPhotoResults();
```

---

## Data Saved

On the result screen, the following is persisted locally:

| Stored Item | Where | Format |
|------------|-------|--------|
| Final photo image | `userData/photos/<id>.png` | PNG file |
| Session record | `photobooth.db / photo_results` | Row with JSON fields |

The SQLite record contains:
- **`id`** — UUID generated at save time
- **`photo_path`** — relative or absolute path to the PNG file in `userData/photos/`
- **`selected_theme`** — `{ theme: "pitcrew" | "motogp" | "f1" }` (JSON)
- **`user_info`** — `{ name, email, phone }` (JSON)
- **`created_at`** / **`updated_at`** — ISO timestamps

---

## Intersection with Other Features

| Feature | Intersection |
|---------|-------------|
| [Result Display](feat-result-display.md) | Triggers local persistence on mount via `electronAPI` IPC calls. |
| [Admin Data Viewer](feat-admin-data-viewer.md) | Reads all `photo_results` rows via `electronAPI.db.getAllPhotoResults()`. Also uses the `local-file://` custom protocol to display saved PNG files. |
| [Printing](feat-printing.md) | The local file path returned by `savePhotoFile()` is passed to `electronAPI.print(filePath)`. |

---

## Custom File Protocol

To display locally saved photos in the admin viewer (or anywhere in the renderer), a custom Electron protocol is registered in `main.ts`:

```typescript
protocol.registerFileProtocol("local-file", (request, callback) => {
  const filePath = decodeURIComponent(request.url.replace("local-file://", ""));
  callback({ path: filePath });
});
```

This allows the renderer to load images via `local-file:///absolute/path/photo.png` without violating Electron's Content Security Policy.

---

## Notes

- Local persistence fires **before** the cloud upload — if cloud operations fail, the data is still safe locally.
- The `userData` directory is managed by Electron and survives app updates.
- No migration strategy is needed for SQLite schema changes in an event-based deployment — the database is ephemeral per event.
