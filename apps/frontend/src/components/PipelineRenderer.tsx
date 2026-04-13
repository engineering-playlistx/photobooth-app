import React, { useState, useCallback, useLayoutEffect } from "react";
import { useEventConfig } from "../contexts/EventConfigContext";
import { usePipeline } from "../contexts/PipelineContext";
import { useInactivityTimeout } from "../hooks/useInactivityTimeout";
import { MODULE_REGISTRY } from "../modules/registry";

export function PipelineRenderer() {
  const { config, apiBaseUrl, apiClientKey } = useEventConfig();
  const {
    currentIndex,
    moduleOutputs,
    advance,
    back,
    reset,
    setSessionId,
    suppressInactivity,
  } = usePipeline();
  const [sessionStarting, setSessionStarting] = useState(false);

  useInactivityTimeout({
    onTimeout: reset,
    disabled: currentIndex === 0 || suppressInactivity,
    timeoutMs: config.techConfig.inactivityTimeoutSeconds * 1000,
  });

  const currentModule = config.moduleFlow[currentIndex];
  const Component = currentModule
    ? MODULE_REGISTRY[currentModule.moduleId]
    : undefined;

  const handleComplete = useCallback(
    (output?: Record<string, unknown>) => {
      if (config.moduleFlow[currentIndex]?.moduleId === "welcome") {
        setSessionStarting(true);
        fetch(`${apiBaseUrl}/api/session/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiClientKey}`,
          },
          body: JSON.stringify({ eventId: config.eventId }),
        })
          .then((res) => res.json())
          .then((data: { sessionId?: string }) => {
            if (data.sessionId) {
              setSessionId(data.sessionId);
            }
            advance({ ...output, sessionId: data.sessionId });
          })
          .catch((err) => {
            console.warn("Session start failed, proceeding offline:", err);
            setSessionId(null);
            advance(output);
          })
          .finally(() => setSessionStarting(false));
      } else {
        advance(output);
      }
    },
    [config, currentIndex, apiBaseUrl, apiClientKey, advance, setSessionId],
  );

  // useLayoutEffect fires before paint — prevents theme-selection flash on single-theme events.
  // [currentIndex] dep is intentional: must fire once per step, not on handleComplete ref changes.
  useLayoutEffect(() => {
    if (
      currentModule?.moduleId === "theme-selection" &&
      currentModule.themes.length === 1
    ) {
      const singleTheme = currentModule.themes[0];
      handleComplete({
        selectedTheme: { id: singleTheme.id, label: singleTheme.label },
      });
    }
  }, [currentIndex]); // intentional: fires once per step, not on handleComplete ref changes

  if (sessionStarting) {
    return (
      <div className="h-svh aspect-9/16 mx-auto flex flex-col items-center justify-center gap-4 bg-black px-12">
        <p className="text-white text-2xl font-shell text-center">
          Starting session...
        </p>
      </div>
    );
  }

  if (!currentModule) {
    return (
      <div className="h-svh aspect-9/16 mx-auto flex flex-col items-center justify-center gap-4 bg-black px-12">
        <p className="text-white text-2xl font-shell text-center font-bold">
          Pipeline Error
        </p>
        <p className="text-white/70 text-xl font-shell text-center">
          Module index {currentIndex} is out of bounds (flow has{" "}
          {config.moduleFlow.length} modules).
        </p>
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="h-svh aspect-9/16 mx-auto flex flex-col items-center justify-center gap-4 bg-black px-12">
        <p className="text-white text-2xl font-shell text-center font-bold">
          Pipeline Error
        </p>
        <p className="text-white/70 text-xl font-shell text-center">
          Module &quot;{currentModule.moduleId}&quot; is not registered.
        </p>
      </div>
    );
  }

  return (
    <Component
      config={currentModule}
      outputs={moduleOutputs}
      onComplete={handleComplete}
      onBack={back}
    />
  );
}
