import type { ModuleConfig } from "@photobooth/types";

export interface ModuleProps {
  config: ModuleConfig;
  outputs: Record<string, unknown>;
  onComplete: (output?: Record<string, unknown>) => void;
  onBack: () => void;
}
