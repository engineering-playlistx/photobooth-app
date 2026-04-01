import type React from "react";
import type { ModuleProps } from "./types";
import { WelcomeModule } from "./WelcomeModule";

export const MODULE_REGISTRY: Record<
  string,
  React.ComponentType<ModuleProps>
> = {};

MODULE_REGISTRY["welcome"] = WelcomeModule;
