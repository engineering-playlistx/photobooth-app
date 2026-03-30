-- TASK-2.2: Create event_configs table and seed Shell Racing 2026 config
--
-- Run this in the Supabase SQL editor.
-- Requires: events table with row 'evt_shell_001' (created in TASK-1.1).

CREATE TABLE IF NOT EXISTS event_configs (
  event_id   TEXT PRIMARY KEY REFERENCES events(id),
  config_json JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: Shell Racing 2026 (evt_shell_001)
INSERT INTO event_configs (event_id, config_json)
VALUES (
  'evt_shell_001',
  $json${
    "eventId": "evt_shell_001",
    "branding": {
      "logoUrl": null,
      "primaryColor": "#ffc600",
      "secondaryColor": "#dd1d21",
      "fontFamily": "Shell",
      "backgroundUrl": null
    },
    "moduleFlow": ["select", "camera", "form", "loading", "result"],
    "formFields": {
      "name": true,
      "email": true,
      "phone": true,
      "consent": true
    },
    "aiConfig": {
      "provider": "replicate",
      "themes": [
        {
          "id": "pitcrew",
          "label": "Pit Crew",
          "previewImageUrl": "/images/theme-pitcrew.png",
          "frameImageUrl": "/images/frame-racing-pitcrew.png",
          "templateImageUrl": "https://izkpppwqivpeahnhsxrl.supabase.co/storage/v1/object/public/photobooth-bucket/templates/template-pitcrew.jpg",
          "prompt": "make the person in the first image (image 1) as a race engineer, wearing a red Ferrari race engineer shirt (like in image 2) with ONLY Shell logo visible. Leave out all the logo and keep only the Shell logo. The person is standing in front of the race track garage, facing the front.\nDO NOT CHANGE ANY FACIAL FEATURES from the reference image for the person's face. KEEP FACIAL AND HEAD ACCESSORIES.\nThe background appears to be a race track garage. The lighting is bright and even.\n\nColor & light (IMPORTANT):\n• Real daylight, blue sky\n• Natural contrast (cinematic)\n• Accurate white balance\n• True-to-life colors - skin tones rich and dimensional\n• No faded, dusty, pastel, or washed-out colors\n\nOverall aesthetic: modern, clean, commercial, editorial feel. Feels like a real person.",
          "canvasWidth": 1205,
          "canvasHeight": 1920,
          "photoWidth": 1004,
          "photoHeight": 1507,
          "photoOffsetX": 0,
          "photoOffsetY": 0
        },
        {
          "id": "motogp",
          "label": "MotoGP",
          "previewImageUrl": "/images/theme-motogp.png",
          "frameImageUrl": "/images/frame-racing-motogp.png",
          "templateImageUrl": "https://izkpppwqivpeahnhsxrl.supabase.co/storage/v1/object/public/photobooth-bucket/templates/template-moto.jpg",
          "prompt": "make the person in the first image (image 1) as a motogp racer, wearing a racing outfit (like in image 2) with ONLY Shell logo visible. Leave out all the logo and keep only the Shell logo. The person is standing in front of the motogp motorbike, facing the front.\nDO NOT CHANGE ANY FACIAL FEATURES from the reference image for the person's face. KEEP FACIAL AND HEAD ACCESSORIES.\nThe background appears to be a race track or an open, paved area, with a slight blur, suggesting the focus is on the person and the bike. The lighting is bright and even.\n\nColor & light (IMPORTANT):\n• Real daylight, blue sky\n• Natural contrast (cinematic)\n• Accurate white balance\n• True-to-life colors - skin tones rich and dimensional\n• No faded, dusty, pastel, or washed-out colors\n\nOverall aesthetic: modern, clean, commercial, editorial feel. Feels like a real person.",
          "canvasWidth": 1205,
          "canvasHeight": 1920,
          "photoWidth": 1004,
          "photoHeight": 1507,
          "photoOffsetX": 0,
          "photoOffsetY": 0
        },
        {
          "id": "f1",
          "label": "F1",
          "previewImageUrl": "/images/theme-f1.png",
          "frameImageUrl": "/images/frame-racing-f1.png",
          "templateImageUrl": "https://izkpppwqivpeahnhsxrl.supabase.co/storage/v1/object/public/photobooth-bucket/templates/template-car.jpg",
          "prompt": "make the person in the first image (image 1) as an F1 racer, wearing a racing outfit (like in image 2) with ONLY Shell logo visible. Leave out all the logo and keep only the Shell logo. The person is standing in front of the F1 Racing Car, facing the front.\nDO NOT CHANGE ANY FACIAL FEATURES from the reference image for the person's face. KEEP FACIAL AND HEAD ACCESSORIES.\nThe background appears to be a race track or an open, paved area, with a slight blur, suggesting the focus is on the person and the car. The lighting is bright and even.\n\nColor & light (IMPORTANT):\n• Real daylight, blue sky\n• Natural contrast (cinematic)\n• Accurate white balance\n• True-to-life colors - skin tones rich and dimensional\n• No faded, dusty, pastel, or washed-out colors\n\nOverall aesthetic: modern, clean, commercial, editorial feel. Feels like a real person.",
          "canvasWidth": 1205,
          "canvasHeight": 1920,
          "photoWidth": 1004,
          "photoHeight": 1507,
          "photoOffsetX": 0,
          "photoOffsetY": 0
        }
      ]
    },
    "techConfig": {
      "printerName": "DS-RX1",
      "inactivityTimeoutSeconds": 60,
      "guestPortalEnabled": false
    }
  }$json$::jsonb
)
ON CONFLICT (event_id) DO UPDATE
  SET config_json = EXCLUDED.config_json,
      updated_at  = now();
