# Feature: Printing

## Overview

The app automatically prints the final photo to a **DS-RX1** thermal photo printer after the result screen loads. The user can also manually trigger printing via a button. Printing is handled entirely in the Electron main process using the native `webContents.print()` API by creating a hidden browser window with the photo embedded as HTML.

---

## Files

| File | Role |
|------|------|
| `apps/frontend/src/main.ts` | IPC handlers: `print-window`, `print-window-pdf` |
| `apps/frontend/src/preload.ts` | Exposes `electronAPI.print()` and `electronAPI.printPdf()` |
| `apps/frontend/src/routes/result.tsx` | Calls `electronAPI.print()` on mount (auto) and on button press (manual) |

---

## Technical Architecture

### Print Flow

```
Result Page (renderer)
    │
    │  electronAPI.print(filePath)   [IPC: "print-window"]
    ▼
Main Process
    │
    ├── Create hidden BrowserWindow (offscreen, not shown to user)
    │
    ├── Load HTML into the hidden window:
    │     <html>
    │       <body style="margin:0; padding:0;">
    │         <img src="file:///absolute/path/photo.png"
    │              style="width:100%; height:auto;" />
    │       </body>
    │     </html>
    │
    ├── Wait for window to finish loading
    │
    └── Call webContents.print({
          silent: true,
          deviceName: "DS-RX1",
          printBackground: true,
        })
        │
        └── Window is destroyed after print job is sent
```

### IPC Channels

| Channel | Trigger | Behavior |
|---------|---------|---------|
| `print-window` | `electronAPI.print(filePath)` | Creates hidden window, prints to DS-RX1, destroys window |
| `print-window-pdf` | `electronAPI.printPdf(filePath)` | Creates hidden window, exports PDF, saves to Desktop |

### Auto-Print

On the result screen, auto-print fires with a 1-second delay after mount:

```typescript
useEffect(() => {
  // ... other save operations ...

  const timer = setTimeout(() => {
    if (window.electronAPI?.isElectron) {
      electronAPI.print(localFilePath);
    }
  }, 1000);

  return () => clearTimeout(timer);
}, []);
```

The delay ensures the local file has been fully written before the print job tries to read it.

**Auto-print only fires in production** — it is gated by `window.electronAPI.isElectron` (or a `NODE_ENV` check), so it does not trigger during web dev mode.

### Manual Print

The "Print & Download" button on the result screen also calls `electronAPI.print(filePath)` directly, allowing the user or event staff to reprint.

### PDF Fallback

`electronAPI.printPdf(filePath)` generates a PDF and saves it to the user's Desktop. This is used during development and testing when a physical DS-RX1 printer is not connected.

---

## Printer Configuration

- **Target device:** `DS-RX1` (DNP DS-RX1 thermal dye-sublimation photo printer)
- **Print size:** 4" × 6" (standard photo size)
- **Device name** in Electron's print options: `"DS-RX1"` — this must match the printer name as registered in the OS.
- **Silent mode:** `silent: true` — no print dialog shown to the user.

---

## Intersection with Other Features

| Feature | Intersection |
|---------|-------------|
| [Local Persistence](feat-local-persistence.md) | The local file path returned by `savePhotoFile()` is the input to `electronAPI.print()`. Printing depends on the file being written first. |
| [Result Display](feat-result-display.md) | Auto-print is triggered from the result page's `useEffect`. The "Print & Download" button is also on the result page. |

---

## Notes

- If the DS-RX1 is not connected or the device name doesn't match, the print call fails silently (`silent: true`). No error is surfaced to the user in the current implementation.
- The hidden BrowserWindow has `show: false` and `webPreferences: { offscreen: true }` — it is purely a rendering surface for the print job, not visible to the kiosk user.
- Electron's `webContents.print()` sends the job to the OS print queue — the physical printer driver handles paper size and DPI settings.
- PDF export saves to `app.getPath('desktop')/<filename>.pdf`.
