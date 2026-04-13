-- TASK-0.2: Repair missing event_configs rows for events created via V5 New Event form.
--
-- Safe to run on live database. Idempotent (running twice produces no duplicates).

INSERT INTO event_configs (event_id, config_json)
SELECT
  e.id,
  jsonb_build_object(
    'eventId',      e.id,
    'branding',     jsonb_build_object(
                      'logoUrl',           null,
                      'primaryColor',      '#ffffff',
                      'secondaryColor',    '#000000',
                      'fontFamily',        null,
                      'backgroundUrl',     null,
                      'portalHeading',     null,
                      'screenBackgrounds', null
                    ),
    'moduleFlow',   '[]'::jsonb,
    'formFields',   jsonb_build_object('name', true, 'email', true, 'phone', true, 'consent', true),
    'techConfig',   jsonb_build_object(
                      'printerName',                '',
                      'inactivityTimeoutSeconds',   60,
                      'guestPortalEnabled',          false
                    )
  )
FROM events e
LEFT JOIN event_configs ec ON ec.event_id = e.id
WHERE ec.event_id IS NULL;
