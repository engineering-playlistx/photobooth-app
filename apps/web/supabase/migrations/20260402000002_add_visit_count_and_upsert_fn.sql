-- V3-1.6: Add visit_count column and upsert_user_with_visit_count function
--
-- visit_count: increments on each repeat visit from the same guest (same email + event_id).
-- Existing rows get visit_count = 1 via the DEFAULT.
--
-- IMPORTANT — PL/pgSQL gotcha:
--   Functions with RETURNS SETOF require RETURN QUERY before any SELECT/INSERT ... RETURNING.
--   Omitting RETURN QUERY compiles successfully but throws at call time:
--     "ERROR: query has no destination for result data"
--   Always use: RETURN QUERY INSERT ... RETURNING *;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.upsert_user_with_visit_count(
  p_name          TEXT,
  p_email         TEXT,
  p_phone         TEXT,
  p_photo_path    TEXT,
  p_selected_theme TEXT,
  p_event_id      TEXT
)
RETURNS SETOF public.users
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.users (name, email, phone, photo_path, selected_theme, event_id, visit_count)
  VALUES (p_name, p_email, p_phone, p_photo_path, p_selected_theme, p_event_id, 1)
  ON CONFLICT (email, event_id)
  DO UPDATE SET
    name           = EXCLUDED.name,
    phone          = EXCLUDED.phone,
    photo_path     = EXCLUDED.photo_path,
    selected_theme = EXCLUDED.selected_theme,
    visit_count    = public.users.visit_count + 1,
    updated_at     = now()
  RETURNING *;
END;
$$;
