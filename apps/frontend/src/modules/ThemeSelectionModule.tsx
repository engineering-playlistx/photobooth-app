import React from "react";
import { getAssetPath } from "../utils/assets";
import type { ThemeSelectionModuleConfig } from "@photobooth/types";
import type { ModuleProps } from "./types";

function resolveImageUrl(url: string): string {
  return url.startsWith("http") ? url : getAssetPath(url);
}

export function ThemeSelectionModule({
  config,
  onComplete,
  onBack,
}: ModuleProps) {
  const { themes } = config as ThemeSelectionModuleConfig;

  function handleSelectTheme(themeId: string) {
    const theme = themes.find((t) => t.id === themeId);
    onComplete({
      selectedTheme: { id: themeId, label: theme?.label ?? themeId },
    });
  }

  if (themes.length === 0) {
    return (
      <div className="h-svh aspect-9/16 mx-auto flex flex-col items-center justify-center gap-6 bg-black px-12 text-center">
        <p className="text-white text-3xl font-bold">No themes configured</p>
        <p className="text-white/70 text-xl">
          No themes are configured for this event. Contact your event manager.
        </p>
      </div>
    );
  }

  return (
    <div className="h-svh aspect-9/16 mx-auto relative flex flex-col items-center justify-center bg-primary text-secondary overflow-hidden">
      <div
        className="absolute inset-0 w-full h-full"
        style={{
          background: `url('${getAssetPath("/images/bg_select.png")}')`,
          backgroundSize: "cover",
        }}
      />
      <button
        onClick={onBack}
        className="absolute top-22 left-32 z-20 transition-all duration-200 active:scale-95 flex flex-row align-left items-center  gap-4 text-secondary text-4xl font-medium"
        aria-label="Back to home"
      >
        <div className="p-3 bg-secondary rounded-full shadow-lg transition-all duration-200 active:scale-95 flex flex-row">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </div>
        Back
      </button>
      <div className="relative z-10 w-full px-24 flex flex-col items-center gap-12 mb-40">
        <h1 className="text-7xl font-shell font-black font-bold font-sans text-center w-180">
          Who do you want to be today?
        </h1>
        <p className="text-5xl font-medium pt-8 py-20">
          Choose your racing role:
        </p>
        <div className="flex flex-col gap-18 w-full">
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleSelectTheme(theme.id)}
              className="relative w-full rounded-4xl overflow-hidden cursor-pointer transition-all duration-200 active:scale-[0.98] hover:shadow-2xl select-none font-shell font-medium"
            >
              <div className="relative flex flex-row items-center gap-14 w-full bg-tertiary">
                <div className="bg-white p-4">
                  <img
                    src={resolveImageUrl(theme.previewImageUrl)}
                    alt={theme.label}
                    className="w-28 h-28"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
                <h2 className="text-7xl text-white">{theme.label}</h2>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
