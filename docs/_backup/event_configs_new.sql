UPDATE event_configs
SET config_json = (
  jsonb_set(
    config_json,
    '{moduleFlow}',
    $$[
      {"moduleId": "welcome", "position": "fixed-first"},
      {
        "moduleId": "theme-selection",
        "position": "pre-photo",
        "outputKey": "selectedTheme",
        "themes": [
          {"id": "pitcrew", "label": "Pit Crew", "previewImageUrl": "/images/theme-pitcrew.png"},
          {"id": "motogp",  "label": "MotoGP",   "previewImageUrl": "/images/theme-motogp.png"},
          {"id": "f1",      "label": "F1",        "previewImageUrl": "/images/theme-f1.png"}
        ]
      },
      {"moduleId": "camera", "position": "fixed-camera", "outputKey": "originalPhoto", "maxRetakes": 2},
      {"moduleId": "form",   "position": "post-photo",     "outputKey": "userInfo"},
      {
        "moduleId": "ai-generation",
        "position": "post-photo",
        "outputKey": "finalPhoto",
        "provider": "google",
        "themes": [
            {
              "id": "pitcrew",
              "label": "Pit Crew TEST",
              "prompt": "make the person in the first image (image 1) as a race engineer, wearing a red Ferrari race engineer shirt (like in image 2) with ONLY Shell logo visible. Leave out all the logo and keep only the Shell logo. The person is standing in front of the race track garage, facing the front.\nDO NOT CHANGE ANY FACIAL FEATURES from the reference image for the person's face. KEEP FACIAL AND HEAD ACCESSORIES.\nThe background appears to be a race track garage. The lighting is bright and even.\n\nColor & light (IMPORTANT):\n• Real daylight, blue sky\n• Natural contrast (cinematic)\n• Accurate white balance\n• True-to-life colors - skin tones rich and dimensional\n• No faded, dusty, pastel, or washed-out colors\n\nOverall aesthetic: modern, clean, commercial, editorial feel. Feels like a real person.",
              "photoWidth": 1004,
              "canvasWidth": 1205,
              "photoHeight": 1507,
              "canvasHeight": 1920,
              "photoOffsetX": 0,
              "photoOffsetY": 0,
              "frameImageUrl": "/images/frame-racing-pitcrew.png",
              "previewImageUrl": "/images/theme-pitcrew.png",
              "templateImageUrl": "https://izkpppwqivpeahnhsxrl.supabase.co/storage/v1/object/public/photobooth-bucket/templates/template-pitcrew.jpg"
            },
            {
              "id": "motogp",
              "label": "MotoGP",
              "prompt": "make the person in the first image (image 1) as a motogp racer, wearing a racing outfit (like in image 2) with ONLY Shell logo visible. Leave out all the logo and keep only the Shell logo. The person is standing in front of the motogp motorbike, facing the front.\nDO NOT CHANGE ANY FACIAL FEATURES from the reference image for the person's face. KEEP FACIAL AND HEAD ACCESSORIES.\nThe background appears to be a race track or an open, paved area, with a slight blur, suggesting the focus is on the person and the bike. The lighting is bright and even.\n\nColor & light (IMPORTANT):\n• Real daylight, blue sky\n• Natural contrast (cinematic)\n• Accurate white balance\n• True-to-life colors - skin tones rich and dimensional\n• No faded, dusty, pastel, or washed-out colors\n\nOverall aesthetic: modern, clean, commercial, editorial feel. Feels like a real person.",
              "photoWidth": 1004,
              "canvasWidth": 1205,
              "photoHeight": 1507,
              "canvasHeight": 1920,
              "photoOffsetX": 0,
              "photoOffsetY": 0,
              "frameImageUrl": "/images/frame-racing-motogp.png",
              "previewImageUrl": "/images/theme-motogp.png",
              "templateImageUrl": "https://izkpppwqivpeahnhsxrl.supabase.co/storage/v1/object/public/photobooth-bucket/templates/template-moto.jpg"
            },
            {
              "id": "f1",
              "label": "F1",
              "prompt": "make the person in the first image (image 1) as an F1 racer, wearing a racing outfit (like in image 2) with ONLY Shell logo visible. Leave out all the logo and keep only the Shell logo. The person is standing in front of the F1 Racing Car, facing the front.\nDO NOT CHANGE ANY FACIAL FEATURES from the reference image for the person's face. KEEP FACIAL AND HEAD ACCESSORIES.\nThe background appears to be a race track or an open, paved area, with a slight blur, suggesting the focus is on the person and the car. The lighting is bright and even.\n\nColor & light (IMPORTANT):\n• Real daylight, blue sky\n• Natural contrast (cinematic)\n• Accurate white balance\n• True-to-life colors - skin tones rich and dimensional\n• No faded, dusty, pastel, or washed-out colors\n\nOverall aesthetic: modern, clean, commercial, editorial feel. Feels like a real person.",
              "photoWidth": 1004,
              "canvasWidth": 1205,
              "photoHeight": 1507,
              "canvasHeight": 1920,
              "photoOffsetX": 0,
              "photoOffsetY": 0,
              "frameImageUrl": "/images/frame-racing-f1.png",
              "previewImageUrl": "/images/theme-f1.png",
              "templateImageUrl": "https://izkpppwqivpeahnhsxrl.supabase.co/storage/v1/object/public/photobooth-bucket/templates/template-car.jpg"
            }
          ]
      },
      {"moduleId": "result", "position": "fixed-last"}
    ]$$::jsonb
  )
) - 'aiConfig'
WHERE event_id = 'evt_shell_001';