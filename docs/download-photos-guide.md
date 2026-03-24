# Bulk Download Photos from Supabase

A guide to bulk-downloading all photo results from the Supabase storage bucket using the included script.

---

## Prerequisites

- Node.js >= 24.10
- `SUPABASE_SERVICE_KEY` filled in `apps/web/.env`

### Getting the Service Key

1. Go to your [Supabase project dashboard](https://supabase.com/dashboard)
2. Navigate to **Project Settings → API**
3. Copy the **`service_role`** secret key (not the `anon` key)
4. Open `apps/web/.env` and set:
   ```
   SUPABASE_SERVICE_KEY=your_service_role_key_here
   ```

> **Why the service key?** The storage bucket's RLS policies restrict listing files to admin-level access. The anon key cannot list all files.

---

## Usage

### Download to the default folder

Run this from the project root:

```bash
pnpm download-photos
```

Photos will be saved to:
```
downloads/photos/
```

### Download to a custom folder

```bash
node scripts/download-photos.mjs /path/to/your/folder
```

Example:

```bash
node scripts/download-photos.mjs C:/Users/YourName/Desktop/photobooth-exports
```

---

## What the Script Does

1. Reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `apps/web/.env`
2. Lists **all** files in `photobooth-bucket/public/` (handles pagination automatically)
3. Downloads files **5 at a time** (concurrent) for speed
4. Saves each file to the output folder with its original filename
5. Prints a progress line per file and a final summary

### Example output

```
📸  Photobooth Bulk Downloader
   Bucket : photobooth-bucket/public
   Output : D:\web-dev\shell-photobooth\downloads\photos
   Project: https://xxxxxxxxxxxx.supabase.co

🔍  Listing files…
📦  Found 42 file(s). Starting download with concurrency=5…

  ✅ [1/42] abc123-john-doe.png
  ✅ [2/42] def456-jane-smith.png
  ...
  ❌ [40/42] xyz-broken.png — Object not found

🏁  Done! 41 downloaded, 1 failed.
   Saved to: D:\web-dev\shell-photobooth\downloads\photos
```

---

## Notes

- The `downloads/` folder is created automatically if it doesn't exist.
- Files that fail to download are logged with an error message but won't stop the rest.
- The script reads from the **`public/`** subfolder only — template images in `templates/` are not included.
- Re-running the script will overwrite files with the same filename.
