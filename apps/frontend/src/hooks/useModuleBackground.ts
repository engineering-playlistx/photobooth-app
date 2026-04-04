import { useEventConfig } from "../contexts/EventConfigContext";

export function useModuleBackground(moduleId: string): string | null {
  const { config } = useEventConfig();
  return config.branding.screenBackgrounds?.[moduleId] ?? null;
}
