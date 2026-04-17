import React from "react";
import { getAssetPath } from "../utils/assets";
import { useModuleBackground } from "../hooks/useModuleBackground";
import { useElementCustomization } from "../hooks/useElementCustomization";
import type { WelcomeModuleConfig } from "@photobooth/types";
import type { ModuleProps } from "./types";

export function WelcomeModule({ config, onComplete }: ModuleProps) {
  const bg = useModuleBackground("welcome");
  const { customization } = config as WelcomeModuleConfig;
  const ctaButton = useElementCustomization(
    customization,
    "welcome",
    "ctaButton",
    "Tap to Start",
  );

  function handleStart() {
    onComplete();
  }

  return (
    <div className="h-svh aspect-9/16 mx-auto relative flex items-center justify-center p-4 bg-black overflow-hidden bg-white">
      {ctaButton.styleTag}
      <div
        className="absolute inset-0 w-full h-full px-26 pb-20 pt-76"
        style={{
          background: `url('${bg ?? getAssetPath("/images/bg_index_default.png")}')`,
          backgroundSize: "cover",
        }}
      />
      <div className="w-full text-center absolute bottom-85 left-1/2 -translate-x-1/2 z-10">
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleStart}
            className="pb-welcome-ctaButton px-12 py-8 bg-tertiary hover:bg-tertiary text-white rounded-xl font-shell font-black text-3xl lg:text-5xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none active:bg-secondary active:text-white shadow-xl"
          >
            {ctaButton.copy}
          </button>
        </div>
      </div>
    </div>
  );
}
