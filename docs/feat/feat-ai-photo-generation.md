# Feature: AI Photo Generation

## Overview

AI Photo Generation is the core technical feature of the app. It takes the user's captured photo, sends it to the backend, and receives an AI face-swapped image — the user's face composited onto a racing-themed template. The result is then composited with a frame overlay on the client before being stored as the final photo.

This feature spans both the frontend loading screen and the backend `/api/ai-generate` endpoint.

---

## Routes & Files

| Layer | Location |
|-------|----------|
| Frontend loading screen | `apps/frontend/src/routes/loading.tsx` |
| Backend API route | `apps/web/src/routes/api.ai-generate.ts` |
| AI service | `apps/web/src/services/ai-generation.service.ts` |

---

## End-to-End Flow

```
[/loading — on mount]
    │
    │  POST /api/ai-generate
    │  { userPhotoBase64, theme }
    ▼
[api.ai-generate.ts]
    │  Validate Bearer token
    │  Validate body (theme must be pitcrew|motogp|f1)
    │
    ├── [AI_PROVIDER=google]
    │     Pre-fetch template image from env URL (bytes)
    │     Call AIGenerationService.generateGoogleAISync()
    │     ← { predictionId: "google-sync", generatedImageBase64 }
    │
    └── [AI_PROVIDER=replicate]
          Upload userPhotoBase64 → Supabase temp/
          Call Replicate predictions.create()
          ← { predictionId, tempPath }
          Frontend polls GET /api/ai-generate?predictionId=<id>
          Backend polls Replicate; on "succeeded":
            Download image → base64 → delete temp file
          ← { status: "succeeded", generatedImageBase64 }

[/loading — on response]
    │
    │  Canvas compositing:
    │    draw generatedImageBase64 (1080×1920)
    │    draw frame overlay PNG on top
    │
    ▼
PhotoboothContext.finalPhoto (base64)
    │
    ▼
Navigate to /result
```

---

## Backend Architecture

### Route Handler (`api.ai-generate.ts`)

**POST `/api/ai-generate`**
- Validates `Authorization: Bearer <API_CLIENT_KEY>`
- Parses and validates request body (`userPhotoBase64`, `theme`)
- Selects provider path based on `AI_PROVIDER` env var
- Returns response in standardized shape

**GET `/api/ai-generate?predictionId=<id>`**
- Used only in Replicate (async) mode
- Calls `AIGenerationService.getPredictionStatus(predictionId)`
- Returns `{ status, generatedImageBase64? }`

### AIGenerationService (`services/ai-generation.service.ts`)

#### Google AI Provider (synchronous)

- Model: `gemini-2.5-flash-image` (via `@google/generative-ai`)
- Input: user photo (inline base64) + template image (inline base64, pre-fetched from URL)
- Prompt: theme-specific, set via env vars (`RACING_PROMPT_PITCREW`, etc.)
- Output: base64 image returned directly in the HTTP response — **no polling required**
- Advantage: works within Cloudflare Workers' execution model (no long-lived background tasks)

#### Replicate Provider (asynchronous)

- Model: `google/nano-banana` (via `replicate` SDK)
- Input: user photo URL (Supabase temp) + template URL (env var)
- Model params: `resolution: "2K"`, `format: "png"`, `safety_filter: "block_only_high"`
- Output: Replicate prediction URL → downloaded and converted to base64
- Requires polling from the frontend
- Temp file cleanup: deleted from Supabase after successful download

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `AI_PROVIDER` | `"google"` or `"replicate"` |
| `GOOGLE_AI_STUDIO_API_KEY` | Google Generative AI key |
| `REPLICATE_API_KEY` | Replicate API key |
| `REPLICATE_MODEL` | Replicate model identifier |
| `RACING_TEMPLATE_PITCREW_URL` | Public URL to Pit Crew template image |
| `RACING_TEMPLATE_MOTOGP_URL` | Public URL to MotoGP template image |
| `RACING_TEMPLATE_F1_URL` | Public URL to F1 template image |
| `RACING_PROMPT_PITCREW` | Face-swap AI prompt for Pit Crew |
| `RACING_PROMPT_MOTOGP` | Face-swap AI prompt for MotoGP |
| `RACING_PROMPT_F1` | Face-swap AI prompt for F1 |

---

## Frontend — Loading Screen (`/loading`)

### Progress Stages

The loading screen shows status text that advances through stages:

1. "Preparing your photo..."
2. "Suiting you up..."
3. "AI is generating your photo..."
4. "Applying your racing frame..."

A progress bar is animated to match the current stage.

### AI Result + Frame Compositing (Canvas)

After receiving the AI-generated image, the frontend applies the racing frame overlay using the Canvas API:

```typescript
const canvas = document.createElement("canvas");
canvas.width = 1080;
canvas.height = 1920;
const ctx = canvas.getContext("2d");

// Draw AI result (fills entire canvas)
ctx.drawImage(aiResultImage, 0, 0, 1080, 1920);

// Draw frame overlay on top (transparent PNG)
ctx.drawImage(frameImage, 0, 0, 1080, 1920);

const finalBase64 = canvas.toDataURL("image/png");
```

Frame overlay assets (local static files):
```
/images/frame-racing-pitcrew.png   (1080×1920)
/images/frame-racing-motogp.png    (1080×1920)
/images/frame-racing-f1.png        (1080×1920)
```

The frame is selected based on `PhotoboothContext.selectedTheme.theme`.

### Error Handling

If the API call fails or the AI generation errors:
- An error message is shown on the loading screen
- "Back to Home" button is presented (no retry — user restarts the session)

---

## Intersection with Other Features

| Feature | Intersection |
|---------|-------------|
| [Theme Selection](feat-theme-selection.md) | `selectedTheme.theme` determines the AI prompt, template URL, and frame overlay used. |
| [Camera Capture](feat-camera-capture.md) | `originalPhotos[0]` is the `userPhotoBase64` input to the AI endpoint. |
| [Result Display](feat-result-display.md) | The `finalPhoto` set by this feature is displayed on the result screen and used for printing and cloud upload. |
| [Cloud Storage & User Record](feat-cloud-storage-user-record.md) | Replicate provider temporarily uploads user photo to Supabase `temp/` during AI processing. |

---

## Notes

- The Google AI provider is preferred for Cloudflare Workers deployment because it returns results synchronously — no background task or polling infrastructure is needed.
- Replicate is available as an alternative provider for higher-quality output when hosting allows long-running async jobs.
- Template images for face-swap must be clear, front-facing portraits without helmet visors or obscuring gear for best AI output.
- The canvas compositing step is purely client-side — the backend never sees the final framed image.
