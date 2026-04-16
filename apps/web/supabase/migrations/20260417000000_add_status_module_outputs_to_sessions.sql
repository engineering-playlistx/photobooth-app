-- TASK-6.2: Add missing status + module_outputs columns to sessions table
--
-- These columns were used by session.repository.ts (startSession, completeSession)
-- but were never declared in the original migration, causing silent write failures.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS module_outputs JSONB;
