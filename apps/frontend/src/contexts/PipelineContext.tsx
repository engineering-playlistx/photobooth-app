import React, { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface PipelineContextType {
  sessionId: string | null;
  currentIndex: number;
  moduleOutputs: Record<string, unknown>;
  suppressInactivity: boolean;
  advance: (output?: Record<string, unknown>) => void;
  back: () => void;
  reset: () => void;
  setSessionId: (id: string) => void;
  setSuppressInactivity: (suppress: boolean) => void;
}

const PipelineContext = createContext<PipelineContextType | undefined>(
  undefined,
);

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [moduleOutputs, setModuleOutputs] = useState<Record<string, unknown>>(
    {},
  );
  const [suppressInactivity, setSuppressInactivity] = useState(false);

  const advance = useCallback((output?: Record<string, unknown>) => {
    if (output) {
      setModuleOutputs((prev) => ({ ...prev, ...output }));
    }
    setCurrentIndex((prev) => prev + 1);
  }, []);

  const back = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const reset = useCallback(() => {
    setCurrentIndex(0);
    setModuleOutputs({});
    setSessionId(null);
    setSuppressInactivity(false);
  }, []);

  return (
    <PipelineContext.Provider
      value={{
        sessionId,
        currentIndex,
        moduleOutputs,
        suppressInactivity,
        advance,
        back,
        reset,
        setSessionId,
        setSuppressInactivity,
      }}
    >
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline(): PipelineContextType {
  const ctx = useContext(PipelineContext);
  if (!ctx) {
    throw new Error("usePipeline must be used within PipelineProvider");
  }
  return ctx;
}
