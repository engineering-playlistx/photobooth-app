-- V2-6.3 / V3-1.2: Add event_id and updated_at columns to users table
--
-- event_id: scopes each guest record to a specific event (multi-event support)
-- updated_at: tracks when the row was last modified (used by upsert function)
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS event_id   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
