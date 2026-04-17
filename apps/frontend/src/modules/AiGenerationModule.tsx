import React, { useState, useEffect, useRef } from "react";
import type {
  AiGenerationModuleConfig,
  AiThemeConfig,
} from "@photobooth/types";
import { getAssetPath } from "../utils/assets";
import { useEventConfig } from "../contexts/EventConfigContext";
import { usePipeline } from "../contexts/PipelineContext";
import { useModuleBackground } from "../hooks/useModuleBackground";
import { useElementCustomization } from "../hooks/useElementCustomization";
import type { ModuleProps } from "./types";

function resolveImageUrl(url: string): string {
  return url.startsWith("http") ? url : getAssetPath(url);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      const label = src.startsWith("data:") ? "base64 image" : src;
      reject(new Error(`Failed to load image: ${label}`));
    };
    img.src = src;
  });
}

async function applyRacingFrame(
  aiGeneratedBase64: string,
  themeConfig: AiThemeConfig,
): Promise<string> {
  const {
    canvasWidth,
    canvasHeight,
    photoWidth,
    photoHeight,
    photoOffsetX,
    photoOffsetY,
    frameImageUrl,
  } = themeConfig;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  const aiImage = await loadImage(aiGeneratedBase64);
  const photoX = (canvasWidth - photoWidth) / 2 + photoOffsetX;
  const photoY = (canvasHeight - photoHeight) / 2 + photoOffsetY;
  ctx.drawImage(aiImage, photoX, photoY, photoWidth, photoHeight);

  // Frame overlay is optional — skip if the image file doesn't exist
  try {
    const frameImage = await loadImage(resolveImageUrl(frameImageUrl));
    ctx.drawImage(frameImage, 0, 0, canvasWidth, canvasHeight);
  } catch {
    console.warn(
      `[AI Generate] Frame image not found: ${frameImageUrl} — skipping overlay`,
    );
  }

  return canvas.toDataURL("image/png");
}

const SLIDESHOW_IMAGES = [
  "/images/bg_loading_default.png",
  // "/images/bg_loading_11.png",
  // "/images/bg_loading_12.png",
  // "/images/bg_loading_13.png",
  // "/images/bg_loading_14.png",
  // "/images/bg_loading_15.png",
];

const SLIDESHOW_INTERVAL_MS = 4500;

export function AiGenerationModule({
  config,
  outputs,
  onComplete,
}: ModuleProps) {
  const { apiBaseUrl, apiClientKey, config: eventConfig } = useEventConfig();
  const { setSuppressInactivity, reset } = usePipeline();
  const bg = useModuleBackground("ai-generation");
  const { customization, slideshowItems } = config as AiGenerationModuleConfig;
  const statusTextEl = useElementCustomization(
    customization,
    "ai-generation",
    "statusText",
  );
  const useConfigSlideshow = (slideshowItems?.length ?? 0) >= 1;
  const activeSlideshowCount = useConfigSlideshow
    ? (slideshowItems?.length ?? 0)
    : SLIDESHOW_IMAGES.length;

  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Preparing your photo...");
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [showCancelButton, setShowCancelButton] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  const originalPhoto = outputs["originalPhoto"] as string | undefined;
  const selectedTheme = outputs["selectedTheme"] as
    | { id: string; label: string }
    | undefined;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % activeSlideshowCount);
    }, SLIDESHOW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeSlideshowCount]);

  useEffect(() => {
    if (processedRef.current || !originalPhoto || !selectedTheme) {
      return;
    }

    processedRef.current = true;

    async function generateAIPhoto() {
      setSuppressInactivity(true);
      const cancelTimerId = setTimeout(() => setShowCancelButton(true), 30_000);
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const themeId = selectedTheme!.id;
        const moduleConfig = config as AiGenerationModuleConfig;
        const themeConfig = moduleConfig.themes.find((t) => t.id === themeId);
        if (!themeConfig) {
          throw new Error(`Theme '${themeId}' not found in module config`);
        }
        const photoSize = Math.round(originalPhoto!.length / 1024);
        console.log(
          `[AI Generate] Starting — theme: ${themeId}, photo size: ${photoSize}KB`,
        );
        console.log(`[AI Generate] API URL: ${apiBaseUrl}/api/ai-generate`);

        setStatusText("Suiting you up...");
        setProgress(10);

        const startTime = Date.now();

        const controller = new AbortController();
        controllerRef.current = controller;
        timeoutId = setTimeout(() => controller.abort(), 60_000);

        // Phase 1: Create prediction
        const createResponse = await fetch(`${apiBaseUrl}/api/ai-generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiClientKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            userPhotoBase64: originalPhoto,
            theme: themeId,
            eventId: eventConfig.eventId,
          }),
        });

        const createElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `[AI Generate] Create response — status: ${createResponse.status} (${createElapsed}s)`,
        );

        if (!createResponse.ok) {
          const errorData = await createResponse.json();
          throw new Error(
            (errorData as { error?: string }).error ||
              "Failed to start generation",
          );
        }

        const createData = (await createResponse.json()) as {
          predictionId?: string;
          tempPath?: string;
          provider?: string; // which AI backend created this prediction
        };
        clearTimeout(timeoutId);
        timeoutId = undefined;
        if (!createData.predictionId) {
          throw new Error("Server response missing prediction data");
        }

        const { predictionId, tempPath, provider } = createData;
        console.log(`[AI Generate] Prediction created — id: ${predictionId}`);
        setStatusText("AI is generating your photo...");
        setProgress(25);

        // Phase 2: Poll for completion (both Replicate and Google AI use this path)
        let generatedImageBase64: string | null = null;

        const POLL_INTERVAL = 2500;
        const MAX_ATTEMPTS = 60;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
          const pollProgress = 25 + Math.min(attempt * 2, 60);
          setProgress(pollProgress);

          const statusResponse = await fetch(
            `${apiBaseUrl}/api/ai-generate-status?predictionId=${predictionId}&tempPath=${encodeURIComponent(tempPath ?? "")}&provider=${encodeURIComponent(provider ?? "")}`,
            {
              headers: {
                Authorization: `Bearer ${apiClientKey}`,
              },
            },
          );

          const statusData = (await statusResponse.json()) as {
            status?: string;
            generatedImageBase64?: string;
            error?: string;
          };
          console.log(
            `[AI Generate] Poll #${attempt + 1} — status: ${statusData.status}`,
          );

          if (
            statusData.status === "succeeded" &&
            statusData.generatedImageBase64
          ) {
            generatedImageBase64 = statusData.generatedImageBase64;
            break;
          }

          if (
            statusData.status === "failed" ||
            statusData.status === "canceled"
          ) {
            throw new Error(
              statusData.error || `Generation ${statusData.status}`,
            );
          }
          // "starting" or "processing" — continue polling
        }

        if (!generatedImageBase64) {
          throw new Error("Generation timed out. Please try again.");
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `[AI Generate] Got generated image — ${Math.round(generatedImageBase64.length / 1024)}KB (${elapsed}s)`,
        );

        setStatusText("Applying racing frame...");
        setProgress(90);

        const framedPhoto = await applyRacingFrame(
          generatedImageBase64,
          themeConfig,
        );
        console.log(
          `[AI Generate] Frame applied — total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        );

        setProgress(100);

        setTimeout(() => {
          onComplete({ finalPhoto: framedPhoto });
        }, 500);
      } catch (err) {
        console.error("[AI Generate] Failed:", err);
        const message =
          err instanceof Error && err.name === "AbortError"
            ? "Generation timed out. Please try again."
            : err instanceof Error
              ? err.message
              : "Something went wrong";
        setError(message);
        processedRef.current = false;
      } finally {
        clearTimeout(cancelTimerId);
        setShowCancelButton(false);
        controllerRef.current = null;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        setSuppressInactivity(false);
      }
    }

    void generateAIPhoto();
  }, [originalPhoto, selectedTheme]);

  const handleRetry = () => {
    setError(null);
    setProgress(0);
    setShowCancelButton(false);
    processedRef.current = false;
  };

  const handleCancel = () => {
    controllerRef.current?.abort();
    reset();
  };

  return (
    <div
      className="relative h-svh aspect-9/16 mx-auto flex items-start justify-center p-4 bg-white text-secondary overflow-hidden"
      style={
        bg
          ? {
              backgroundImage: `url('${bg}')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {useConfigSlideshow
        ? slideshowItems!.map((item, index) => (
            <div
              key={index}
              className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
              style={{ opacity: currentSlide === index ? 1 : 0 }}
            >
              {item.imageUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: `url('${resolveImageUrl(item.imageUrl)}')`,
                  }}
                />
              )}
              {item.caption && (
                <div className="absolute bottom-48 left-0 right-0 flex items-center justify-center px-12">
                  <p className="text-white text-4xl font-medium text-center drop-shadow-lg">
                    {item.caption}
                  </p>
                </div>
              )}
            </div>
          ))
        : SLIDESHOW_IMAGES.map((src, index) => (
            <div
              key={src}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ease-in-out"
              style={{
                backgroundImage: `url('${getAssetPath(src)}')`,
                opacity: currentSlide === index ? 1 : 0,
              }}
            />
          ))}

      {error ? (
        <div className="relative z-10 flex flex-col items-center gap-8 px-12">
          <p className="text-white text-3xl font-sans text-center">{error}</p>
          <div className="flex gap-6">
            <button
              type="button"
              onClick={handleRetry}
              className="px-10 py-5 bg-white hover:bg-gray-200 text-secondary rounded-lg font-medium text-3xl transition-all duration-200 cursor-pointer font-sans"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={reset}
              className="px-10 py-5 bg-transparent hover:bg-white/20 text-white border border-white rounded-lg font-medium text-3xl transition-all duration-200 cursor-pointer font-sans"
            >
              Back to Home
            </button>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-80 left-1/2 transform -translate-x-1/2 w-5/6 px-8 z-10 flex flex-col items-center gap-6">
          {showCancelButton && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-10 py-5 bg-white/20 hover:bg-white/30 text-white border border-white rounded-lg font-medium text-3xl transition-all duration-200 cursor-pointer font-sans"
            >
              Cancel / Start Over
            </button>
          )}
          {statusTextEl.styleTag}
          <div className="relative w-full h-20 rounded-xl bg-[#6F0000] overflow-hidden shadow-lg border border-white border-2">
            <div
              className="absolute top-0 left-0 h-full bg-tertiary transition-all duration-300 ease-linear rounded-lg"
              style={{ width: `${progress}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="pb-ai-generation-statusText text-white text-3xl">
                {statusText}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
