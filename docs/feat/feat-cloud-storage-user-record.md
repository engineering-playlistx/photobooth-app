# Feature: Cloud Storage & User Record

## Overview

After a session completes, the final photo is uploaded to Supabase Storage and the user's contact details are saved to a Supabase PostgreSQL database via the backend API. This enables permanent cloud backup of photos, QR code download links for users, and a centralized record of all event participants.

---

## Files

| File | Role |
|------|------|
| `apps/frontend/src/routes/result.tsx` | Triggers upload + API call on mount |
| `apps/frontend/src/utils/supabase.ts` | Frontend Supabase anon client |
| `apps/web/src/routes/api.photo.ts` | `POST /api/photo` handler |
| `apps/web/src/usecases/submit-photo.usecase.ts` | Business logic orchestrator |
| `apps/web/src/repositories/user.repository.ts` | Supabase DB insert |
| `apps/web/src/utils/supabase-admin.ts` | Backend Supabase service role client |

---

## Technical Architecture

### Step 1 — Photo Upload to Supabase Storage (Frontend)

The frontend Supabase client (anon key) uploads the final photo directly from the renderer:

```typescript
// Convert base64 to Blob
const blob = await fetch(finalPhoto).then(r => r.blob());

// Upload to photobooth-bucket/public/
const path = `public/${uuid}-${sanitizedName}.png`;
await supabase.storage.from("photobooth-bucket").upload(path, blob, {
  contentType: "image/png",
  upsert: false,
});
```

**Bucket:** `photobooth-bucket`
**Path pattern:** `public/<uuid>-<name>.png`

The anon key is allowed to upload to the `public/` folder via a Supabase Storage RLS policy.

After upload, the frontend constructs or retrieves the public URL for QR code generation.

### Step 2 — Submit User Record to Backend (`POST /api/photo`)

The frontend calls the backend with the stored photo path and user contact details:

```typescript
await fetch(`${API_BASE_URL}/api/photo`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_CLIENT_KEY}`,
  },
  body: JSON.stringify({
    photoPath: `public/${uuid}-${name}.png`,
    name: userInfo.name,
    email: userInfo.email,
    phone: userInfo.phone,
    selectedTheme: selectedTheme.theme,
  }),
});
```

### Backend — Route Handler (`api.photo.ts`)

1. Validates `Authorization: Bearer` token
2. Validates and sanitizes fields:
   - `name` — strips `<>` characters (XSS guard)
   - `email` — regex validation
   - `phone` — Indonesian format validation (`+62`, `62`, or `0` prefix)
3. Calls `SubmitPhotoUseCase.execute()`

### Backend — Use Case (`submit-photo.usecase.ts`)

Orchestrates:
1. `UserRepository.save()` — inserts user record into Supabase `users` table
2. `supabase.storage.getPublicUrl(photoPath)` — gets the public URL for the uploaded photo
3. Returns `{ photoUrl, userId }` to the route handler

> Email delivery is currently disabled in the use case but the `EmailService` is wired up and can be re-enabled.

### Backend — UserRepository (`user.repository.ts`)

Uses the admin Supabase client (service role key, bypasses RLS):

```typescript
const { data, error } = await supabaseAdmin.from("users").insert({
  name,
  email,
  phone: normalizePhone(phone),   // "0812..." → "+62812..."
  photo_path: photoPath,
  selected_theme: selectedTheme,
});
```

Phone normalization:
- `0...` → `62...` → `+62...`
- `62...` → `+62...`
- `+62...` → unchanged

---

## Supabase Configuration

### Storage Bucket — `photobooth-bucket`

| Folder | Access | Purpose |
|--------|--------|---------|
| `public/` | Public read, anon upload | Permanent photo storage |
| `temp/` | Service role only | Transient AI processing uploads (see [AI Photo Generation](feat-ai-photo-generation.md)) |

**Storage RLS policies:**
- `SELECT` on `public/` — allowed for `anon` role
- `INSERT` to `public/` — allowed for `anon` role
- All operations on `temp/` — service role (bypasses RLS)

### Database — `users` Table

```sql
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT NOT NULL,           -- stored in +62 format
  photo_path     TEXT,                    -- storage path (not full URL)
  selected_theme TEXT,                    -- "pitcrew" | "motogp" | "f1"
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at DESC);
```

RLS is enabled — only the service role key can read or write.

### Supabase Clients

| Client | Key | Used By |
|--------|-----|---------|
| `frontend/src/utils/supabase.ts` | Anon key | Frontend photo upload |
| `web/src/utils/supabase-admin.ts` | Service role key | Backend DB writes, temp/ Storage |
| `web/src/utils/supabase.ts` | Anon key | SSR session management (not directly used in this feature) |

---

## Intersection with Other Features

| Feature | Intersection |
|---------|-------------|
| [Result Display](feat-result-display.md) | Triggers photo upload and `POST /api/photo` on mount; receives public URL for QR code. |
| [AI Photo Generation](feat-ai-photo-generation.md) | The Replicate provider temporarily uses Supabase `temp/` storage during generation; cleanup happens in the backend after AI completes. |
| [Admin Data Viewer](feat-admin-data-viewer.md) | The local SQLite record (not the Supabase record) is what the admin page reads. The `photo_path` in SQLite is a local filesystem path, not a Supabase URL. |

---

## Notes

- The frontend uploads the photo directly to Supabase using the anon key — the backend never receives or re-handles the raw image bytes for the final photo (only for AI processing temp uploads).
- If the Supabase upload fails, `POST /api/photo` is skipped (no path to save).
- The public URL format: `https://<project>.supabase.co/storage/v1/object/public/photobooth-bucket/public/<filename>.png`
- Email delivery to the user is implemented in `EmailService` but currently disabled in `SubmitPhotoUseCase` — it can be re-enabled by uncommenting the `emailService.sendPhotoResult()` call.
