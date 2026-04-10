# Electron Auto-Update — Plan

**Status:** ⏸️ Parked — blocked on Windows code signing (certificate not yet obtained)
**Parked from:** V4 Phase 7 (moved out 2026-04-10 — too heavy to carry alongside V4)
**Unblock condition:** Windows EV or OV code signing certificate obtained + `pnpm fe make` produces a signed installer

---

## Why This Is Parked

Auto-update requires a signed Windows installer. Squirrel.Windows refuses unsigned updates. Obtaining an EV certificate involves company verification (3–10 business days) and ~$300–500/year cost — a business decision, not a code task. Rather than hold up V4 for this dependency, the auto-update work is parked here in full fidelity and can be picked up as its own project when the certificate is ready.

---

## Architecture

Updates are served from Supabase S3-compatible static storage. Use `update-electron-app@^3.x` with `UpdateSourceType.StaticStorage` — this reads static manifest files (e.g., `RELEASES` on Windows) directly from a public S3 URL, no dedicated update server required. Do NOT use `electron-updater` (adds an unnecessary dependency from the `electron-builder` ecosystem); do NOT use `update-electron-app@^2.x` which required a dynamic Squirrel-protocol server. The v3 `StaticStorage` mode is the correct, minimal choice here.

**Key design rule:** The update URL is constructed by a shared `getUpdateBaseUrl()` function used in **both** `forge.config.ts` (build-time, embedded into the installer) and `auto-update.ts` (runtime check). These two paths must produce identical URLs or updates will silently fail. Never hardcode the URL in one place and derive it in another.

---

## Task Order

1. **AU-1 — Code signing setup** ← start here; unblocks everything else
2. **AU-2 — App implementation** (update-electron-app + IPC + banner)
3. **AU-3 — Release pipeline** (forge config + S3 publisher + `release.ts` script)

---

## AU-1 — Code signing setup (hard prerequisite for AU-2 and AU-3)

**What:** Configure code signing in `forge.config.ts` for Windows. macOS signing is deferred (see AU-3 scope note). Without a signed Windows installer, Squirrel.Windows will refuse to auto-update.

**What needs to happen outside of code (business prerequisites):**
- Obtain a Windows code signing certificate. Options:
  - **EV certificate** (Extended Validation) — required for zero-SmartScreen-warning installs. Vendors: DigiCert, Sectigo, GlobalSign. Cost: ~$300–500/year. Requires company verification (3–10 business days).
  - **Standard OV certificate** — cheaper but triggers SmartScreen on first installs until reputation builds. Not recommended for kiosk deployments.
- The certificate is issued as a `.pfx` file + password. Store these securely — never commit to git.

**Files:**
- `apps/frontend/forge.config.ts`
- `apps/frontend/.gitignore` (ensure `*.pfx` and `.env.secret` are listed)

**Output — `apps/frontend/forge.config.ts` additions:**

```typescript
// Windows code signing — runs during `electron-forge make`
// Certificate path and password come from .env.secret (never bundled into the app)
new MakerSquirrel((arch) => ({
  // ... existing options (remoteReleases etc. added in AU-3) ...
  certificateFile: process.env.WIN_CERT_PATH,          // path to .pfx file
  certificatePassword: process.env.WIN_CERT_PASSWORD,  // pfx password
})),
```

Add to `.env.secret`:
```
WIN_CERT_PATH=/path/to/certificate.pfx
WIN_CERT_PASSWORD=your-pfx-password
```

**Verification:**
- Layer 1: Lint — no errors
- Layer 2: n/a
- Layer 3: Run `pnpm fe make` on a Windows machine (or Windows CI). Open the produced installer — Windows should NOT show a SmartScreen "Unknown publisher" warning (EV cert) or show it only once (OV cert). Confirm the installer runs without UAC bypass errors. Do NOT proceed to AU-2 or AU-3 until this passes.

**Risk:** High. This task has non-code dependencies (certificate purchase, company verification). It cannot be unblocked by code changes alone. Plan for 1–2 weeks lead time for EV certificate issuance.

---

## AU-2 — Implement auto-update in the app (update-electron-app + IPC + banner)

**What:** Add `update-electron-app` v3 to the frontend app. On startup (production builds only), silently check for updates against the Supabase S3 bucket. If a new version is available and downloaded, send an IPC event to the renderer to show a non-intrusive operator-facing banner. Expose `checkForUpdatesManually()` via IPC for the admin page. Do NOT use `notifyUser: true` — native dialogs interrupt guest sessions.

**Packages to add:**
- `update-electron-app@^3.1.2` → `dependencies`
- `electron-log` → `dependencies` (logger for `update-electron-app`)
- `dotenv` → `dependencies` (loads bundled `.env` into `process.env` in the main process at runtime)

**Files:**
- Read first: `apps/frontend/src/main.ts`
- Read first: `apps/frontend/src/preload.ts`
- Read first: `apps/frontend/forge.config.ts`
- New: `apps/frontend/src/utils/auto-update.ts`
- `apps/frontend/package.json` (add packages above)
- `apps/frontend/src/main.ts` (dotenv loading + call `setupAutoUpdater()` on app ready, production only; add IPC handlers)
- `apps/frontend/src/preload.ts` (expose `onUpdateDownloaded`, `checkForUpdates`, `quitAndInstall`)
- `apps/frontend/src/App.tsx` or app root (render update banner when `onUpdateDownloaded` fires)

**Input:** AU-1 complete (code signing confirmed working). Supabase S3 bucket exists with paths defined in AU-3.

**Output — `apps/frontend/src/utils/auto-update.ts`:**
```typescript
import { updateElectronApp, UpdateSourceType } from "update-electron-app";
import { autoUpdater } from "electron";
import log from "electron-log";

/** Constructs the base public update URL from env vars.
 *  Used at runtime. Must produce the same path as forge.config.ts getUpdateBaseUrl(). */
function getUpdateBaseUrl(): string | null {
  const supabaseUrl = process.env.VITE_SUPABASE_URL; // e.g. https://xxx.supabase.co
  const bucket = process.env.SUPABASE_S3_BUCKET;
  if (!supabaseUrl || !bucket) return null;
  try {
    const url = new URL(supabaseUrl);
    return `${url.protocol}//${url.host}/storage/v1/object/public/${bucket}/app-updates`;
  } catch {
    return null;
  }
}

export function setupAutoUpdater(
  onUpdateDownloaded: (version: string) => void
): void {
  const base = getUpdateBaseUrl();

  if (!base) {
    log.info("[auto-update] VITE_SUPABASE_URL or SUPABASE_S3_BUCKET not set — skipping");
    return;
  }

  const updateUrl = `${base}/${process.platform}/${process.arch}`;

  if (!updateUrl.startsWith("https://")) {
    log.warn("[auto-update] Update URL is not HTTPS — skipping");
    return;
  }

  log.info(`[auto-update] Setting up with URL: ${updateUrl}`);

  updateElectronApp({
    updateSource: { type: UpdateSourceType.StaticStorage, baseUrl: updateUrl },
    updateInterval: "1 hour",
    notifyUser: false, // intentional — we show a custom kiosk banner instead
    logger: log,
  });

  // update-electron-app handles downloading; we listen here to trigger the IPC banner.
  autoUpdater.on("update-downloaded", (_event, _notes, releaseName) => {
    log.info(`[auto-update] Update downloaded: ${releaseName}`);
    onUpdateDownloaded(releaseName ?? "");
  });
}

export function checkForUpdatesManually(): void {
  // autoUpdater is already configured by setupAutoUpdater() — just trigger a check.
  autoUpdater.checkForUpdates();
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}
```

**Output — `apps/frontend/src/main.ts`:**

> **Critical:** `auto-update.ts` reads `process.env.VITE_SUPABASE_URL` and `process.env.SUPABASE_S3_BUCKET` from the main process. In a packaged Electron app, `extraResource` files land on disk at `process.resourcesPath` but are **not** automatically parsed into `process.env` — the Node.js main process has no knowledge of Vite's env injection. You must load them with `dotenv` before any `process.env` read. Add `dotenv` to `dependencies` in `apps/frontend/package.json`.

- At the very top of `main.ts`, immediately after the existing imports, add:
  ```typescript
  import dotenv from "dotenv";

  // In packaged builds, load the bundled .env from extraResource into process.env.
  // Must happen before any process.env read (KIOSK_ADMIN_PIN, auto-update env vars, etc.)
  // Dev: Vite handles env vars via import.meta.env — do not run dotenv in dev.
  if (process.env.NODE_ENV !== "development") {
    dotenv.config({ path: path.join(process.resourcesPath, ".env") });
  }
  ```
  Use `process.env.NODE_ENV !== "development"` directly here (not `isDev`) because `isDev` is defined later in the file using this same value.

- Import from `auto-update.ts` and call after `createWindow()`, in the `app.on("ready", ...)` handler:
  ```typescript
  if (!isDev) {
    setupAutoUpdater((version) => {
      const [win] = BrowserWindow.getAllWindows();
      if (win) win.webContents.send("update-downloaded", { version });
    });
  }
  ```
- Add IPC handlers (alongside the existing handlers at the bottom of `main.ts`):
  ```typescript
  ipcMain.handle("check-for-updates", () => {
    checkForUpdatesManually();
  });
  ipcMain.handle("quit-and-install", () => {
    quitAndInstall();
  });
  ```

> **Side-benefit:** The dotenv loading above also fixes the existing `KIOSK_ADMIN_PIN` read in `main.ts` — it was previously always defaulting to `"0000"` in packaged builds because the bundled `.env` was never loaded into `process.env`.

**Output — `apps/frontend/src/preload.ts`:**
- Add to the `contextBridge.exposeInMainWorld("electronAPI", { ... })` object:
  ```typescript
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on("update-downloaded", (_event, info: { version: string }) => callback(info));
    return () => ipcRenderer.removeAllListeners("update-downloaded");
  },
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
  ```

**Output — update banner (app root or layout component):**
- Add `updateInfo: { version: string } | null` state (default `null`).
- On mount: call `window.electronAPI?.onUpdateDownloaded((info) => setUpdateInfo(info))`.
- When `updateInfo !== null`, render a banner **fixed to the bottom of the screen**:
  - Text: `"Version {version} is ready. Restart the kiosk to apply."` (small font)
  - "Restart Now" button → calls `window.electronAPI?.quitAndInstall()`
  - "Later" button → `setUpdateInfo(null)` (dismisses)
  - Style: operator-facing — dark background, small text, distinct from guest UI
  - Must not block guest interaction — use `pointer-events: none` on the wrapper and `pointer-events: auto` only on the banner element itself; keep `z-index` high enough to appear above all guest screens.

**Env vars (bundled into packaged app via `.env` in `packagerConfig.extraResource`):**
```
VITE_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_S3_BUCKET=photobooth-bucket
```
These are public infrastructure constants — same across all kiosks. They belong in the bundled `.env`, not in `kiosk.config.json`.

**Verification:**
- Layer 1: Lint all changed files — no errors
- Layer 2: n/a
- Layer 3: Cannot fully verify without a signed build + published release (see AU-3). Verify wiring by code review: `setupAutoUpdater()` is only called when `!isDev`, IPC channels are registered, banner renders correctly by temporarily forcing `updateInfo` to a test value in a dev build. Check `electron-log` output in a production build to confirm `[auto-update] Setting up with URL: https://...` is logged (not the "env vars not set — skipping" path).

**Risk:** High. Cannot be tested end-to-end without code signing and a production build. The `notifyUser: false` path means any bug in the IPC wiring silently produces no banner — verify the `update-downloaded` event fires by checking `electron-log` output during a test update cycle.

---

## AU-3 — Release pipeline: forge config + S3 publisher + `release.ts` script

**What:** Configure `@electron-forge/publisher-s3` in forge config with the correct Supabase-specific options (including `s3ForcePathStyle: true` — required for Supabase), embed the update URL into the installer at build time, and write an interactive `scripts/release.ts` CLI that bumps the version, publishes, and rolls back on failure. After this task, `pnpm fe release` is the single command to cut a release.

**Packages to add (devDependencies):**
- `@electron-forge/publisher-s3@^7.10.2`

**Files:**
- Read first: `apps/frontend/forge.config.ts`
- Read first: `apps/frontend/package.json`
- `apps/frontend/forge.config.ts` (add `publishers`, update makers with build-time URL, add `getUpdateBaseUrl()`)
- `apps/frontend/package.json` (add `release` script)
- New: `apps/frontend/scripts/release.ts` (interactive release CLI)
- `apps/frontend/.gitignore` (add `.env.secret`)

**Supabase bucket prerequisite — public read access for `app-updates/`:**

Before publishing, the `photobooth-bucket` in Supabase Storage must have a public read policy on `app-updates/**`. Kiosks fetch the `RELEASES` manifest and installer without credentials — a 401/403 here silently blocks all updates.

Run this in the Supabase SQL editor:
```sql
-- Allow anyone to read files under app-updates/ in photobooth-bucket
CREATE POLICY "public read app-updates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photobooth-bucket' AND name LIKE 'app-updates/%');
```

Or in the Supabase dashboard: Storage → `photobooth-bucket` → Policies → Add policy → "Allow public read on app-updates path".

Verify: after the first publish, open the `RELEASES` URL in a browser (no auth). It must return the manifest content, not a 403.

**S3 bucket folder structure:**
```
photobooth-bucket/
└── app-updates/
    ├── darwin/
    │   └── arm64/
    │       ├── RELEASES                ← macOS manifest (update-electron-app reads this)
    │       └── photobooth-app-X.Y.Z-arm64-mac.zip
    └── win32/
        └── x64/
            ├── RELEASES                ← Squirrel.Windows manifest (update-electron-app reads this)
            ├── photobooth-app-X.Y.Z Setup.exe
            └── photobooth-app-X.Y.Z-full.nupkg
```

**Output — `apps/frontend/forge.config.ts` additions:**

Add a `getUpdateBaseUrl()` helper at the top of the file (mirrors the one in `auto-update.ts` — both must produce the same URL):
```typescript
import dotenv from "dotenv";
// .env contains the public build-time vars (VITE_SUPABASE_URL, SUPABASE_S3_BUCKET).
// .env.secret contains S3 credentials — gitignored, only needed at publish time.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.secret", override: false });

function getUpdateBaseUrl(): string | undefined {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const bucket = process.env.SUPABASE_S3_BUCKET;
  if (!supabaseUrl || !bucket) return undefined;
  try {
    const url = new URL(supabaseUrl);
    return `${url.protocol}//${url.host}/storage/v1/object/public/${bucket}/app-updates`;
  } catch {
    return undefined;
  }
}

const updateBaseUrl = getUpdateBaseUrl();
// Use an explicit PUBLISHING flag rather than NODE_ENV so that running
// `electron-forge publish` directly (without going through release.ts)
// does not silently embed a wrong/missing URL into the installer.
// release.ts sets PUBLISHING=true in the execSync env.
const isPublishing = process.env.PUBLISHING === "true";
```

Update makers to embed the URL into the installer at build time:

> **Merge note:** AU-1 adds `certificateFile` and `certificatePassword` to `MakerSquirrel`. When implementing this task, merge both sets of options into a single function-form constructor — do not overwrite the signing config:

```typescript
// Windows: merge signing config (from AU-1) + update URL (from AU-3)
new MakerSquirrel((arch) => ({
  certificateFile: process.env.WIN_CERT_PATH,
  certificatePassword: process.env.WIN_CERT_PASSWORD,
  remoteReleases:
    isPublishing && updateBaseUrl
      ? `${updateBaseUrl}/win32/${arch}`
      : undefined,
})),

// macOS: tells autoUpdater where the manifest lives (deferred — macOS signing not yet set up)
new MakerZIP((arch) => ({
  macUpdateManifestBaseUrl:
    isPublishing && updateBaseUrl
      ? `${updateBaseUrl}/darwin/${arch}`
      : undefined,
})),
```

Add `publishers` array:
```typescript
import { PublisherS3 } from "@electron-forge/publisher-s3";

publishers: [
  new PublisherS3({
    bucket: process.env.SUPABASE_S3_BUCKET!,
    endpoint: process.env.SUPABASE_S3_ENDPOINT!,   // S3-compatible API endpoint, e.g. https://<project>.supabase.co/storage/v1/s3
    region: process.env.SUPABASE_S3_REGION!,        // e.g. ap-southeast-1
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY!,
    s3ForcePathStyle: true,  // REQUIRED for Supabase — without this the SDK uses virtual-hosted URLs that Supabase doesn't support
    public: true,
    keyResolver: (filename, platform, arch) =>
      `app-updates/${platform}/${arch}/${filename}`,
  }),
],
```

**Output — `apps/frontend/scripts/release.ts`:**

Interactive CLI with version bump, git commit + tag, and full rollback on failure:
```typescript
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const pkgPath = new URL("../package.json", import.meta.url).pathname;

function git(cmd: string): void {
  execSync(`git ${cmd}`, { stdio: "inherit" });
}

async function main() {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
  const [major, minor, patch] = pkg.version.split(".").map(Number);

  const rl = readline.createInterface({ input, output });
  const bumpType = await rl.question(
    `Current version: ${pkg.version}\nBump type (patch/minor/major): `
  );

  let newVersion: string;
  if (bumpType === "major") newVersion = `${major + 1}.0.0`;
  else if (bumpType === "minor") newVersion = `${major}.${minor + 1}.0`;
  else newVersion = `${major}.${minor}.${patch + 1}`;

  const confirm = await rl.question(
    `Bump to ${newVersion} and publish? (y/N): `
  );
  rl.close();

  if (confirm.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  // Write new version
  const updated = { ...pkg, version: newVersion };
  writeFileSync(pkgPath, JSON.stringify(updated, null, 2) + "\n");
  console.log(`Bumped package.json to ${newVersion}`);

  // Commit and tag before publishing so the release is traceable in git history.
  // If either step fails, revert package.json before exiting.
  try {
    git(`add "${pkgPath}"`);
    git(`commit -m "chore: release v${newVersion}"`);
    git(`tag v${newVersion}`);
    console.log(`Tagged v${newVersion}`);
  } catch (err) {
    console.error("Git commit/tag failed — reverting package.json");
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    process.exit(1);
  }

  try {
    execSync("pnpm run publish --platform=win32", {
      stdio: "inherit",
      env: { ...process.env, PUBLISHING: "true" },
    });
    console.log(`Released ${newVersion} successfully.`);
  } catch (err) {
    console.error("Publish failed — reverting package.json, commit, and tag");
    // Revert the tag and the commit so the repo is back to pre-release state
    try { git(`tag -d v${newVersion}`); } catch { /* ignore */ }
    try { git("reset --hard HEAD~1"); } catch { /* ignore */ }
    process.exit(1);
  }
}

void main();
```

**Output — `apps/frontend/package.json`:**
- Add script: `"release": "tsx scripts/release.ts"`

**Env file separation:**

`.env` — already exists; already bundled via `packagerConfig.extraResource` in `forge.config.ts`. No rename needed. Add the two update-related vars:
```
VITE_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_S3_BUCKET=photobooth-bucket
```
These are public constants — same across all kiosks. The `forge.config.ts` dotenv call (`dotenv.config({ path: ".env" })`) and the runtime `main.ts` dotenv call (`dotenv.config({ path: path.join(process.resourcesPath, ".env") })`) both read from this same file — at build time and at runtime respectively.

`.env.secret` — new file, gitignored. Only needed by the person running `pnpm fe release`. **Never** add to `extraResource`. Contains S3 credentials for uploading:
```
SUPABASE_S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3
SUPABASE_S3_REGION=ap-southeast-1
SUPABASE_S3_ACCESS_KEY_ID=...
SUPABASE_S3_SECRET_ACCESS_KEY=...
WIN_CERT_PATH=/path/to/certificate.pfx     ← from AU-1
WIN_CERT_PASSWORD=your-pfx-password        ← from AU-1
```

Add `.env.secret` to `apps/frontend/.gitignore`. The S3 secret key must never appear in `extraResource` — the packaged app only needs the public Supabase URL to check for updates, not credentials to upload them.

**Current scope: Windows-only publish.** The `release.ts` script runs `--platform=win32`. macOS builds are not yet published to S3 (auto-update inactive for macOS in production). This is intentional — tackle macOS code signing and notarization as a separate task when required.

> **Cross-compile dependency (macOS → Windows):** Building a Windows Squirrel installer (`MakerSquirrel`) from macOS or Linux requires `wine` and `mono` to be installed on the build machine. On macOS, install with `brew install --cask wine-stable`. Without these, `electron-forge make --platform=win32` will fail with a `wine` not found error. For CI, use a Windows runner or a Docker image that includes `wine`. Verify with `wine --version` before attempting a cross-compile release.

**Verification:**
- Layer 1: Lint all changed files — no errors
- Layer 2: n/a
- Layer 3: Run `pnpm fe release` (on macOS or Linux — not Windows due to known path issue). Confirm `RELEASES`, installer, and `.nupkg` appear in Supabase bucket at `app-updates/win32/x64/`. Launch a signed production build with a lower version — confirm update banner appears after `update-electron-app` fetches the manifest.

**Risk:** High. `s3ForcePathStyle: true` is easy to forget and causes silent upload failures (requests go to the wrong host). The build-time URL embedded in the installer (via `remoteReleases`) must exactly match the runtime URL from `getUpdateBaseUrl()` — a mismatch means users get no updates silently. Verify both URLs by logging them during a test build before declaring the task done.

**Bad-release rollback procedure:**

If a broken build is published and kiosks have already downloaded it, `quitAndInstall()` will apply the broken build on next restart. To roll back:

1. **Do not restart the kiosks** — instruct operators to dismiss the update banner ("Later") until the rollback is in place.
2. Hotfix the code, bump to a new patch version (e.g. `v1.2.3` → `v1.2.4`), and run `pnpm fe release`.
3. The new `RELEASES` manifest in S3 will point to `v1.2.4`. Kiosks will download and apply the fix on the next check interval (up to 1 hour), or immediately when "Restart Now" is clicked.
4. If the broken build was already applied (kiosk restarted), install the hotfix manually via USB until remote update delivers it.

> There is no mechanism to "push" an update or force an immediate check — the 1-hour polling interval is the minimum delivery window. For critical breaks, USB install is the only immediate path.
