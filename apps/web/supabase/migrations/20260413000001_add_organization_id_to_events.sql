-- V5-1.2: Add organization_id FK to events, seed default Shell org, backfill
--
-- Run this in the Supabase SQL editor AFTER 20260413000000_create_organizations.sql has been run.
--
-- Verify after running:
--   SELECT COUNT(*) FROM events WHERE organization_id IS NULL;   -- must return 0
--   SELECT e.id, o.name FROM events e JOIN organizations o ON e.organization_id = o.id LIMIT 5;

-- Step 1: add nullable FK
ALTER TABLE events
  ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Step 2: seed default Shell org and backfill all existing events
WITH inserted AS (
  INSERT INTO organizations (name, slug)
  VALUES ('Shell', 'shell-racing')
  RETURNING id
)
UPDATE events
SET organization_id = inserted.id
FROM inserted
WHERE organization_id IS NULL;

-- Fallback if the SQL editor rejects the CTE UPDATE above:
-- INSERT INTO organizations (name, slug) VALUES ('Shell', 'shell-racing');
-- UPDATE events SET organization_id = (SELECT id FROM organizations WHERE slug = 'shell-racing') WHERE organization_id IS NULL;

-- Step 3: enforce NOT NULL
ALTER TABLE events
  ALTER COLUMN organization_id SET NOT NULL;
