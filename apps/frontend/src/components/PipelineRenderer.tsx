import React from "react";
import { useEventConfig } from "../contexts/EventConfigContext";
import { usePipeline } from "../contexts/PipelineContext";
import { MODULE_REGISTRY } from "../modules/registry";

export function PipelineRenderer() {
  const { config } = useEventConfig();
  const { currentIndex, moduleOutputs, advance, back } = usePipeline();

  const currentModule = config.moduleFlow[currentIndex];
  const Component = currentModule
    ? MODULE_REGISTRY[currentModule.moduleId]
    : undefined;

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
      onComplete={advance}
      onBack={back}
    />
  );
}
