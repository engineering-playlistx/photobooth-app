import type { EventConfig } from "@photobooth/types";

/**
 * Pre-fetches all image assets referenced in EventConfig so that modules
 * render immediately without a flicker. Failures are non-blocking — a warning
 * is logged and startup continues regardless.
 *
 * @param config   The resolved EventConfig
 * @param onProgress Called with a percentage (30–100) as each image settles.
 */
export function preloadAssets(
  config: EventConfig,
  onProgress: (percent: number) => void,
): Promise<void> {
  const urls: string[] = [];

  // Branding backgrounds
  if (config.branding.screenBackgrounds) {
    for (const url of Object.values(config.branding.screenBackgrounds)) {
      if (url) urls.push(url);
    }
  }
  if (config.branding.logoUrl) urls.push(config.branding.logoUrl);
  if (config.branding.backgroundUrl) urls.push(config.branding.backgroundUrl);

  // Module-level images
  for (const mod of config.moduleFlow) {
    if (mod.moduleId === "theme-selection") {
      for (const theme of mod.themes) {
        if (theme.previewImageUrl) urls.push(theme.previewImageUrl);
      }
    }
    if (mod.moduleId === "ai-generation") {
      for (const theme of mod.themes) {
        if (theme.previewImageUrl) urls.push(theme.previewImageUrl);
        if (theme.frameImageUrl) urls.push(theme.frameImageUrl);
      }
    }
  }

  if (urls.length === 0) {
    onProgress(100);
    return Promise.resolve();
  }

  let settled = 0;

  function onSettle() {
    settled++;
    // Map settled count to the 30–100 range
    onProgress(Math.round(30 + (settled / urls.length) * 70));
  }

  const tasks = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          onSettle();
          resolve();
        };
        img.onerror = () => {
          console.warn(`[preloadAssets] Failed to load: ${url}`);
          onSettle();
          resolve(); // non-blocking
        };
        img.src = url;
      }),
  );

  return Promise.allSettled(tasks).then(() => undefined);
}
