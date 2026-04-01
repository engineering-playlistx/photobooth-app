import type React from "react";
import type { ModuleProps } from "./types";
import { WelcomeModule } from "./WelcomeModule";
import { ThemeSelectionModule } from "./ThemeSelectionModule";

export const MODULE_REGISTRY: Record<
  string,
  React.ComponentType<ModuleProps>
> = {};

MODULE_REGISTRY["welcome"] = WelcomeModule;
MODULE_REGISTRY["theme-selection"] = ThemeSelectionModule;
