import type { ModuleConfig } from "../types/module-config";

export interface ModuleProps {
  config: ModuleConfig;
  outputs: Record<string, unknown>;
  onComplete: (output?: Record<string, unknown>) => void;
  onBack: () => void;
}
