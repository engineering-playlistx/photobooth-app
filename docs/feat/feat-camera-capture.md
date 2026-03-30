# Feature: Camera Capture

## Overview

The camera screen lets the user take a single photo of themselves using the device's webcam. It displays a live mirrored preview, runs a 3-2-1 countdown before capture, overlays a frame for preview purposes, and allows up to 2 retakes. The captured photo is stored as a base64 PNG in global context and passed to subsequent screens.

---

## Route

`/camera` — `apps/frontend/src/routes/camera.tsx`

Navigated to from `/select`. On capture confirmed, navigates to `/form`.

---

## Technical Architecture

### Camera Initialization

Uses the browser's `getUserMedia` Web API from within the Electron renderer:

```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: "user",
  },
  audio: false,
});
```

The stream is attached to a `<video>` element. Multiple camera devices are supported — if more than one video input is detected, a device selector menu is shown.

### Canvas Rendering & Capture

The live preview is rendered on a `<canvas>` element at a fixed 9:16 aspect ratio (portrait, matching the kiosk display). The video frame is drawn mirrored (selfie orientation):

```typescript
ctx.save();
ctx.scale(-1, 1);                           // horizontal flip
ctx.drawImage(videoElement, ...);           // draw mirrored frame
ctx.restore();
```

To capture, the current canvas frame is exported:

```typescript
const base64 = canvas.toDataURL("image/png");
```

This base64 string is stored in `PhotoboothContext.originalPhotos`.

### Countdown Timer

Before capture, a 3-second countdown overlay is displayed. The countdown is implemented with a `setInterval` / `setTimeout` chain. The capture fires when the counter reaches 0.

### Frame Overlay

A transparent frame PNG (`/images/frame.png`) is composited on top of the canvas during live preview — this is a visual guide and does not affect the captured base64 output that is stored in context.

### Retake Logic

`MAX_RETAKE_COUNT = 2` — users can retake up to 2 times. A retake counter is tracked in local component state. When the limit is reached, the retake button is hidden or disabled.

### Navigation

- After capture is confirmed (user presses "Next"): navigates to `/form`
- Back button: navigates to `/select`

---

## State Written

Writes to `PhotoboothContext.originalPhotos`:

```typescript
originalPhotos: string[]    // array containing 1 base64 PNG string
```

This is the input to the AI generation step.

---

## Intersection with Other Features

| Feature | How Camera Output Flows In |
|---------|---------------------------|
| [AI Photo Generation](feat-ai-photo-generation.md) | `originalPhotos[0]` is the `userPhotoBase64` sent to `POST /api/ai-generate`. |
| [User Form](feat-user-form.md) | Camera navigates to `/form` after capture — no data dependency, just routing. |

---

## Notes

- Only **1 photo** is captured (the app was originally designed for 2; this was simplified as part of the AI racing photobooth migration).
- The camera stream is stopped (`stream.getTracks().forEach(t => t.stop())`) when leaving the route to release the device.
- Video constraints target 1080p but degrade gracefully on lower-resolution webcams.
- In development, the progress timer on `/loading` is shortened; camera itself behaves identically in both environments.
