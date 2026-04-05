import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEventConfig } from "../contexts/EventConfigContext";
import type { ErrorType } from "../contexts/EventConfigContext";
import { preloadAssets } from "../utils/preloadAssets";

interface Props {
  children: ReactNode;
}

type Phase =
  | "init"
  | "setup-required"
  | "fetching"
  | "preloading"
  | "completing"
  | "fading"
  | "dismissed"
  | "error";

const ERROR_MESSAGES: Record<ErrorType, string> = {
  none: "",
  network: "No internet connection. Check the network and try again.",
  "not-found":
    "Event config not found. Check the event ID in Settings (Ctrl+Shift+S).",
  "server-error": "Unable to reach the backend. Contact your event operator.",
};

export function StartupLoader({ children }: Props) {
  const { status, errorType, refreshConfig } = useEventConfig();
  const [phase, setPhase] = useState<Phase>("init");
  const [progress, setProgress] = useState(0);
  const hasStarted = useRef(false);

  const runStartup = useCallback(async () => {
    // 1. Check kiosk config for eventId
    try {
      const kioskConfig = await window.electronAPI!.getKioskConfig();
      if (!kioskConfig.eventId) {
        setPhase("setup-required");
        return;
      }
    } catch {
      // getKioskConfig failure will surface in the EventConfig fetch error
    }

    // 2. Trigger EventConfig fetch
    setPhase("fetching");
    setProgress(5);
    refreshConfig();
  }, [refreshConfig]);

  // Kick off startup on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    void runStartup();
  }, [runStartup]);

  // Animate progress bar to ~25% while fetching
  useEffect(() => {
    if (phase !== "fetching") return;
    const t = setTimeout(() => setProgress(25), 150);
    return () => clearTimeout(t);
  }, [phase]);

  // React to context status changes while in fetching phase
  useEffect(() => {
    if (phase !== "fetching") return;

    if (status === "ready") {
      // Config loaded — enter asset preload phase (30% → 100%)
      setProgress(30);
      setPhase("preloading");
    } else if (status === "error") {
      setPhase("error");
    }
  }, [status, phase]);

  // Pre-load assets, advancing the progress bar from 30% → 100%
  useEffect(() => {
    if (phase !== "preloading") return;
    void preloadAssets(config, (percent) => setProgress(percent)).then(() => {
      setPhase("completing");
    });
  }, [phase]); // config is stable (non-null) when phase is "preloading"

  // When completing, brief pause then fade out
  useEffect(() => {
    if (phase !== "completing") return;
    setProgress(100);
    const t1 = setTimeout(() => setPhase("fading"), 400);
    const t2 = setTimeout(() => setPhase("dismissed"), 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);

  const handleRetry = useCallback(() => {
    setPhase("fetching");
    setProgress(5);
    refreshConfig();
  }, [refreshConfig]);

  // Once dismissed, render only children — overlay is gone
  if (phase === "dismissed") {
    return <>{children}</>;
  }

  const overlayVisible = phase !== "fading";

  return (
    <>
      {/* Render children beneath the fading overlay so they mount early */}
      {phase === "fading" && children}

      {/* Startup overlay */}
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
        style={{
          transition: "opacity 0.6s ease-out",
          opacity: overlayVisible ? 1 : 0,
          pointerEvents: overlayVisible ? "auto" : "none",
        }}
      >
        <div className="flex flex-col items-center gap-8 px-12 w-full max-w-sm">
          {/* Logo / app name */}
          <p className="text-white font-shell font-black text-4xl tracking-widest text-center">
            PHOTOBOOTH
          </p>

          {/* Status content */}
          {phase === "setup-required" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-white text-2xl font-shell font-bold">
                Setup Required
              </p>
              <p className="text-white/70 text-lg font-shell leading-relaxed">
                No event ID is configured. Press{" "}
                <span className="text-white font-bold">Ctrl+Shift+S</span> to
                open Settings and enter an event ID.
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center gap-6 text-center">
              <p className="text-white text-2xl font-shell font-bold">
                Startup Failed
              </p>
              <p className="text-white/70 text-lg font-shell leading-relaxed">
                {ERROR_MESSAGES[errorType] || ERROR_MESSAGES.network}
              </p>
              <div className="flex flex-col gap-3 w-full">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="w-full px-8 py-5 bg-tertiary text-white rounded-xl text-xl font-shell font-bold cursor-pointer"
                >
                  Retry
                </button>
                {errorType === "not-found" && (
                  <p className="text-white/50 text-base font-shell text-center">
                    Press{" "}
                    <span className="text-white/80 font-bold">
                      Ctrl+Shift+S
                    </span>{" "}
                    to change the event ID in Settings.
                  </p>
                )}
              </div>
            </div>
          )}

          {(phase === "init" ||
            phase === "fetching" ||
            phase === "preloading" ||
            phase === "completing") && (
            <>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full"
                  style={{
                    width: `${progress}%`,
                    transition: "width 0.8s ease-in-out",
                  }}
                />
              </div>
              <p className="text-white/50 text-base font-shell">
                {phase === "preloading"
                  ? "Loading assets…"
                  : phase === "completing"
                    ? "Almost ready…"
                    : "Loading…"}
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
