import type React from "react";
import type { ModuleProps } from "./types";

export const MODULE_REGISTRY: Record<
  string,
  React.ComponentType<ModuleProps>
> = {};
