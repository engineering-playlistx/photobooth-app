-- V5-1.1: Create organizations table
--
-- Run this in the Supabase SQL editor.
-- Verify after running:
--   SELECT * FROM organizations;
--   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'organizations';

CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,  -- URL-safe, e.g. "shell-racing"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
