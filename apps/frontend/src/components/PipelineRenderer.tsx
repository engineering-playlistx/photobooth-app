import React, { useState, useCallback } from "react";
import { useEventConfig } from "../contexts/EventConfigContext";
import { usePipeline } from "../contexts/PipelineContext";
import { MODULE_REGISTRY } from "../modules/registry";

export function PipelineRenderer() {
  const { config, apiBaseUrl, apiClientKey } = useEventConfig();
  const { currentIndex, moduleOutputs, advance, back, setSessionId } =
    usePipeline();
  const [sessionStarting, setSessionStarting] = useState(false);
  const [sessionStartError, setSessionStartError] = useState(false);

  const currentModule = config.moduleFlow[currentIndex];
  const Component = currentModule
    ? MODULE_REGISTRY[currentModule.moduleId]
    : undefined;

  const handleComplete = useCallback(
    (output?: Record<string, unknown>) => {
      if (config.moduleFlow[currentIndex]?.moduleId === "welcome") {
        setSessionStarting(true);
        setSessionStartError(false);
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
          .catch(() => {
            setSessionStartError(true);
          })
          .finally(() => setSessionStarting(false));
      } else {
        advance(output);
      }
    },
    [config, currentIndex, apiBaseUrl, apiClientKey, advance, setSessionId],
  );

  if (sessionStarting) {
    return (
      <div className="h-svh aspect-9/16 mx-auto flex flex-col items-center justify-center gap-4 bg-black px-12">
        <p className="text-white text-2xl font-shell text-center">
          Starting session...
        </p>
      </div>
    );
  }

  if (sessionStartError) {
    return (
      <div className="h-svh aspect-9/16 mx-auto flex flex-col items-center justify-center gap-6 bg-black px-12">
        <p className="text-white text-2xl font-shell text-center font-bold">
          Unable to start session
        </p>
        <p className="text-white/70 text-xl font-shell text-center">
          Check your network connection and try again.
        </p>
        <button
          type="button"
          onClick={() => setSessionStartError(false)}
          className="px-10 py-5 bg-tertiary text-white rounded-lg text-2xl font-shell cursor-pointer"
        >
          Try Again
        </button>
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
