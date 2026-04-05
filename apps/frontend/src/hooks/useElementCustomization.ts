import React from "react";
import type { ModuleCustomization } from "@photobooth/types";

interface ElementCustomizationResult {
  copy: string;
  styleTag: React.ReactNode;
}

/**
 * Returns the customized copy and an injected <style> tag for a named module element.
 *
 * @param customization - the module's customization config (may be undefined)
 * @param moduleId      - the module identifier, e.g. "welcome"
 * @param elementKey    - the element key, e.g. "ctaButton"
 * @param defaultCopy   - fallback text when no copy override is set
 */
export function useElementCustomization(
  customization: ModuleCustomization | undefined,
  moduleId: string,
  elementKey: string,
  defaultCopy = "",
): ElementCustomizationResult {
  const entry = customization?.elements?.[elementKey];

  const copy = entry?.copy ?? defaultCopy;

  const className = `pb-${moduleId}-${elementKey}`;
  const styleTag = entry?.css
    ? React.createElement(
        "style",
        { key: className },
        `.${className} { ${entry.css} }`,
      )
    : null;

  return { copy, styleTag };
}
