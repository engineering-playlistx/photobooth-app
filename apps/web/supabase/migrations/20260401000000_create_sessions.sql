-- TASK-5.1: Create sessions table for guest portal
--
-- Run this in the Supabase SQL editor.
-- Requires: events table (created in TASK-1.1).

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id),
  photo_path TEXT,
  user_info  JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
