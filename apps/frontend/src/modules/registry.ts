import type React from "react";
import type { ModuleProps } from "./types";
import { WelcomeModule } from "./WelcomeModule";
import { ThemeSelectionModule } from "./ThemeSelectionModule";
import { CameraModule } from "./CameraModule";
import { FormModule } from "./FormModule";
import { AiGenerationModule } from "./AiGenerationModule";

export const MODULE_REGISTRY: Record<
  string,
  React.ComponentType<ModuleProps>
> = {};

MODULE_REGISTRY["welcome"] = WelcomeModule;
MODULE_REGISTRY["theme-selection"] = ThemeSelectionModule;
MODULE_REGISTRY["camera"] = CameraModule;
MODULE_REGISTRY["form"] = FormModule;
MODULE_REGISTRY["ai-generation"] = AiGenerationModule;
