-- Repair existing event_configs rows where moduleFlow is an empty array.
-- These rows were seeded by TASK-0.2 (or V5 event creation) before mandatory
-- modules were included in the default flow.
--
-- Safe to run on live database. Idempotent — only touches rows where
-- config_json->'moduleFlow' is exactly '[]'.

UPDATE event_configs
SET config_json = jsonb_set(
  config_json,
  '{moduleFlow}',
  '[
    {"moduleId": "welcome",  "position": "fixed-first"},
    {"moduleId": "camera",   "position": "fixed-camera", "outputKey": "originalPhoto", "maxRetakes": 2},
    {"moduleId": "result",   "position": "fixed-last"}
  ]'::jsonb
)
WHERE config_json -> 'moduleFlow' = '[]'::jsonb;
