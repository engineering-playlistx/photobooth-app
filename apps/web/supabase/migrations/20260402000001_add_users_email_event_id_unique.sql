-- V2-6.3: Add unique constraint on (email, event_id) to prevent duplicate guest rows
--
-- Required for ON CONFLICT (email, event_id) upsert in upsert_user_with_visit_count().
-- Run ONLY after confirming no existing duplicate (email, event_id) pairs:
--   SELECT email, event_id, COUNT(*) FROM public.users
--   GROUP BY email, event_id HAVING COUNT(*) > 1;
-- Resolve any duplicates before applying this migration.
--
-- NOT idempotent: will error if constraint already exists. Check first:
--   SELECT 1 FROM pg_constraint WHERE conname = 'users_email_event_id_unique';

ALTER TABLE public.users
  ADD CONSTRAINT users_email_event_id_unique UNIQUE (email, event_id);
