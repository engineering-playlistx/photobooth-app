-- Current schema for public.users (as of 2026-04-05)
-- Applied via migrations in order:
--   20251116083518_create_users_table.sql
--   20260209000000_add_selected_theme_to_users.sql
--   20260402000000_add_event_id_updated_at_to_users.sql
--   20260402000001_add_users_email_event_id_unique.sql
--   20260402000002_add_visit_count_and_upsert_fn.sql

CREATE TABLE IF NOT EXISTS public.users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT NOT NULL,
  photo_path     TEXT,
  selected_theme TEXT,
  event_id       TEXT,
  visit_count    INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email      ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users (created_at DESC);

ALTER TABLE public.users
  ADD CONSTRAINT users_email_event_id_unique UNIQUE (email, event_id);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for admins only"
  ON public.users AS PERMISSIVE FOR INSERT
  TO supabase_admin WITH CHECK (true);

CREATE POLICY "Enable read access for admins only"
  ON public.users AS PERMISSIVE FOR SELECT
  TO supabase_admin USING (true);
