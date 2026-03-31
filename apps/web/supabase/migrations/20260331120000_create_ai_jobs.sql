-- TASK-B.02: Replace in-memory Google AI job store with a persistent table.
-- Required for Cloudflare Workers deployment (stateless/ephemeral isolates).

CREATE TABLE IF NOT EXISTS ai_jobs (
  id         TEXT PRIMARY KEY,
  status     TEXT NOT NULL DEFAULT 'processing', -- processing | succeeded | failed
  output     TEXT,        -- base64 data URI of the generated image
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for polling queries
CREATE INDEX IF NOT EXISTS ai_jobs_created_at_idx ON ai_jobs (created_at DESC);

-- Auto-cleanup: delete jobs older than 1 hour (keep table lean)
-- Run via pg_cron or a scheduled function in production.
-- Example: SELECT cron.schedule('cleanup-ai-jobs', '*/10 * * * *',
--   'DELETE FROM ai_jobs WHERE created_at < now() - interval ''1 hour''');
