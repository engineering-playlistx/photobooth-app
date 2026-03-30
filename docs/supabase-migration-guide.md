# Supabase Project Migration Guide

Use this guide whenever you need to point the app at a new Supabase project — whether starting fresh, switching environments, or onboarding a new client.

---

## Overview

Supabase is used for two things:

| Purpose | Who touches it | Key |
|---------|---------------|-----|
| **Storage** (`photobooth-bucket`) | Frontend (anon) + Backend (service role) | Anon key for `public/` uploads, service role for `temp/` uploads |
| **Database** (`users`, `events`, `event_configs` tables) | Backend only | Service role key (bypasses RLS) |

---

## Step 1 — Create a New Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Fill in:
   - **Project name**: e.g. `shell-photobooth-prod`
   - **Database password**: generate a strong one and save it
   - **Region**: closest to your users (`Southeast Asia (Singapore)` for Indonesia)
4. Wait ~2 minutes for provisioning

---

## Step 2 — Collect Your Credentials

Go to **Settings → API** and copy:

| Credential | Location | Used in |
|---|---|---|
| **Project URL** | Settings → API → Project URL | Both `.env` files |
| **anon public key** | Settings → API → Project API Keys → `anon public` | Both `.env` files |
| **service_role key** | Settings → API → Project API Keys → `service_role secret` | Backend `.env` only — **never expose to frontend or git** |

The project ref is the subdomain of your Project URL:
```
https://<PROJECT_REF>.supabase.co
```

---

## Step 3 — Create the Database Schema

Go to **SQL Editor** in your Supabase dashboard and run the following blocks **in order**.

### 3a — Create `users` table

```sql
CREATE TABLE IF NOT EXISTS "public"."users" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "name"           TEXT NOT NULL,
  "email"          TEXT NOT NULL,
  "phone"          TEXT NOT NULL,
  "photo_path"     TEXT,
  "selected_theme" TEXT,
  "created_at"     TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_pkey ON public.users USING btree (id);
ALTER TABLE "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY USING INDEX "users_pkey";

CREATE INDEX IF NOT EXISTS idx_users_email      ON public.users USING btree (email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users USING btree (created_at DESC);
```

### 3b — Enable RLS and add policies

```sql
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for admins only"
  ON "public"."users"
  AS PERMISSIVE FOR INSERT
  TO supabase_admin
  WITH CHECK (true);

CREATE POLICY "Enable read access for admins only"
  ON "public"."users"
  AS PERMISSIVE FOR SELECT
  TO supabase_admin
  USING (true);
```

### 3c — Grant permissions

```sql
GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;
```

### 3d — Add `events` table (Phase 1 — TASK-1.1)

```sql
CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft',  -- draft | active | ended
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS event_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_event_id ON public.users(event_id);

-- Insert first event
INSERT INTO events (id, name, status)
VALUES ('evt_shell_001', 'Shell Racing 2026', 'active')
ON CONFLICT (id) DO NOTHING;
```

### 3e — Add `event_configs` table (Phase 2 — TASK-2.2)

```sql
CREATE TABLE IF NOT EXISTS event_configs (
  event_id    TEXT PRIMARY KEY REFERENCES events(id),
  config_json JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> Seed the `event_configs` row after completing TASK-2.1 (EventConfig types). See `docs/scale-up/04-task-decomposition.md` TASK-2.2 for the seed JSON structure.

---

## Step 4 — Create the Storage Bucket

1. Go to **Storage** in your Supabase dashboard
2. Click **New bucket**
3. Configure:
   - **Bucket name**: `photobooth-bucket` (must match exactly — hardcoded in `api.ai-generate.ts` and `submit-photo.usecase.ts`)
   - **Public bucket**: **ON** — Replicate needs to fetch temp photos via public URL
   - **File size limit**: `50 MB`
   - **Allowed MIME types**: `image/png, image/jpeg, image/webp`
4. Click **Create bucket**

---

## Step 5 — Add Storage Bucket Policies

Go to **Storage → Policies** and run this SQL in the SQL Editor (or add via the UI):

```sql
-- Allow anonymous read from public/ folder
CREATE POLICY "Give anon users access to public folder"
  ON "storage"."objects"
  AS PERMISSIVE FOR SELECT
  TO public
  USING (
    bucket_id = 'photobooth-bucket'
    AND lower((storage.foldername(name))[1]) = 'public'
    AND auth.role() = 'anon'
  );

-- Allow anonymous upload to public/ folder
CREATE POLICY "Give anon users access to upload to public folder"
  ON "storage"."objects"
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (
    bucket_id = 'photobooth-bucket'
    AND lower((storage.foldername(name))[1]) = 'public'
    AND auth.role() = 'anon'
  );
```

> The `temp/` folder is accessed via the backend's `service_role` key, which bypasses RLS — no additional policy needed for it.

---

## Step 6 — Upload Racing Template Images

Create a `templates/` folder inside `photobooth-bucket` and upload:

| File | Used by |
|------|---------|
| `template-pitcrew.jpg` | `RACING_TEMPLATE_PITCREW_URL` |
| `template-moto.jpg` | `RACING_TEMPLATE_MOTOGP_URL` |
| `template-car.jpg` | `RACING_TEMPLATE_F1_URL` |

After uploading, get each file's public URL from the Supabase UI:
```
https://<PROJECT_REF>.supabase.co/storage/v1/object/public/photobooth-bucket/templates/<filename>
```

These URLs go into both `apps/web/.env` and Cloudflare Workers secrets.

---

## Step 7 — Update Environment Variables

### `apps/frontend/.env`

```env
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

### `apps/web/.env`

```env
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_KEY=<service-role-key>

RACING_TEMPLATE_PITCREW_URL=https://<PROJECT_REF>.supabase.co/storage/v1/object/public/photobooth-bucket/templates/template-pitcrew.jpg
RACING_TEMPLATE_MOTOGP_URL=https://<PROJECT_REF>.supabase.co/storage/v1/object/public/photobooth-bucket/templates/template-moto.jpg
RACING_TEMPLATE_F1_URL=https://<PROJECT_REF>.supabase.co/storage/v1/object/public/photobooth-bucket/templates/template-car.jpg
```

---

## Step 8 — Update Cloudflare Workers Secrets

For production, update the secrets on your deployed Worker:

```bash
cd apps/web

npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put RACING_TEMPLATE_PITCREW_URL
npx wrangler secret put RACING_TEMPLATE_MOTOGP_URL
npx wrangler secret put RACING_TEMPLATE_F1_URL
```

Each command will prompt you to paste the value.

---

## Step 9 — (Optional) Use Supabase CLI Instead of Manual SQL

If you prefer running migrations via CLI rather than copy-pasting SQL:

```bash
cd apps/web
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

This applies all files in `apps/web/supabase/migrations/` in order. The bucket itself still must be created manually via the dashboard (Step 4), as the CLI only creates policies, not the bucket.

---

## Verification Checklist

After completing all steps, confirm:

- [ ] `users` table exists with columns: `id`, `name`, `email`, `phone`, `photo_path`, `selected_theme`, `event_id`, `created_at`
- [ ] `events` table exists and has one row: `evt_shell_001`
- [ ] RLS is enabled on `users` table
- [ ] `photobooth-bucket` exists and is public
- [ ] `photobooth-bucket` has `public/` and `templates/` folders with template images inside
- [ ] Storage policies allow anon read + upload to `public/` folder
- [ ] All three Supabase env vars updated in `apps/frontend/.env`
- [ ] All three Supabase env vars updated in `apps/web/.env`
- [ ] Template URLs updated in `apps/web/.env`
- [ ] Cloudflare Workers secrets updated (for production)
- [ ] Run `pnpm dev` and complete a full kiosk flow — photo should appear in Supabase Storage under `public/` and a row should appear in the `users` table

---

## Hardcoded Bucket Name

The bucket name `photobooth-bucket` is referenced directly in code — it is **not** an env var:

- [apps/web/src/routes/api.ai-generate.ts](../apps/web/src/routes/api.ai-generate.ts) — `const SUPABASE_BUCKET = 'photobooth-bucket'`
- [apps/web/src/usecases/submit-photo.usecase.ts](../apps/web/src/usecases/submit-photo.usecase.ts) — `const SUPABASE_BUCKET = 'photobooth-bucket'`

If you ever name the bucket differently, update both files.

---

## Summary of All Supabase-Dependent Variables

| Variable | File | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `apps/frontend/.env` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | `apps/frontend/.env` | Anon public key |
| `SUPABASE_URL` | `apps/web/.env` | Project URL (same as frontend) |
| `SUPABASE_ANON_KEY` | `apps/web/.env` | Anon public key (same as frontend) |
| `SUPABASE_SERVICE_KEY` | `apps/web/.env` + Cloudflare secret | Service role key — never expose to frontend |
| `RACING_TEMPLATE_PITCREW_URL` | `apps/web/.env` + Cloudflare secret | Supabase Storage public URL |
| `RACING_TEMPLATE_MOTOGP_URL` | `apps/web/.env` + Cloudflare secret | Supabase Storage public URL |
| `RACING_TEMPLATE_F1_URL` | `apps/web/.env` + Cloudflare secret | Supabase Storage public URL |
