"use client";

import React, { useState, useRef, useCallback } from "react";
import { getAssetPath } from "../utils/assets";
import { useModuleBackground } from "../hooks/useModuleBackground";
import { useElementCustomization } from "../hooks/useElementCustomization";
import { useEventConfig } from "../contexts/EventConfigContext";
import SimpleKeyboard from "../components/SimpleKeyboard";
import type { FormModuleConfig } from "@photobooth/types";
import type { ModuleProps } from "./types";

export function FormModule({ config, onComplete, onBack }: ModuleProps) {
  const bg = useModuleBackground("form");
  const { customization } = config as FormModuleConfig;
  const { config: eventConfig } = useEventConfig();
  const formFields = eventConfig.formFields;

  const headerEl = useElementCustomization(
    customization,
    "form",
    "header",
    "Complete your details before printing your photo",
  );
  const submitButtonEl = useElementCustomization(
    customization,
    "form",
    "submitButton",
    "Confirm",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isConsentChecked, setIsConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [layoutName, setLayoutName] = useState("default");

  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  // Build an ordered list of the visible text inputs so {enter} can advance
  // through them regardless of which fields are enabled.
  const visibleInputRefs = [
    formFields.name ? nameInputRef : null,
    formFields.email ? emailInputRef : null,
    formFields.phone ? phoneInputRef : null,
  ].filter(Boolean) as React.RefObject<HTMLInputElement>[];

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formFields.consent && !isConsentChecked) {
      setConsentError(true);
      return;
    }
    setConsentError(false);
    setShowKeyboard(false);
    onComplete({ userInfo: { name, email, phone } });
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    activeInputRef.current = e.target;
    setShowKeyboard(true);
  };

  const handleInputBlur = () => {
    // Don't hide keyboard when clicking on it
    // The keyboard will be hidden when form is submitted or user explicitly closes it
  };

  const handleKeyPress = useCallback(
    (button: string) => {
      if (!activeInputRef.current) return;

      const input = activeInputRef.current;
      const currentValue = input.value;
      const selectionStart = input.selectionStart || 0;
      const selectionEnd = input.selectionEnd || 0;

      let newValue = currentValue;

      if (button === "{bksp}") {
        // Handle backspace
        if (selectionStart === selectionEnd && selectionStart > 0) {
          newValue =
            currentValue.slice(0, selectionStart - 1) +
            currentValue.slice(selectionStart);
        } else if (selectionStart !== selectionEnd) {
          newValue =
            currentValue.slice(0, selectionStart) +
            currentValue.slice(selectionEnd);
        }
      } else if (button === "{shift}") {
        // Toggle shift layout
        setLayoutName((prev) => (prev === "default" ? "shift" : "default"));
        return;
      } else if (button === "{space}") {
        newValue =
          currentValue.slice(0, selectionStart) +
          " " +
          currentValue.slice(selectionEnd);
      } else if (button === "{enter}") {
        // Advance to the next visible input, or close keyboard if at the last
        const currentIdx = visibleInputRefs.findIndex(
          (ref) => ref.current === input,
        );
        const nextRef = visibleInputRefs[currentIdx + 1];
        if (nextRef?.current) {
          nextRef.current.focus();
        } else {
          setShowKeyboard(false);
          input.blur();
        }
        return;
      } else if (button === "{tab}" || button === "{lock}") {
        return;
      } else {
        // Regular character
        newValue =
          currentValue.slice(0, selectionStart) +
          button +
          currentValue.slice(selectionEnd);
      }

      // Update the appropriate state
      if (input === nameInputRef.current) {
        setName(newValue);
      } else if (input === emailInputRef.current) {
        setEmail(newValue);
      } else if (input === phoneInputRef.current) {
        setPhone(newValue);
      }

      // Set cursor position after state update
      requestAnimationFrame(() => {
        if (!activeInputRef.current) return;

        if (button === "{bksp}") {
          const newPos =
            selectionStart === selectionEnd
              ? Math.max(0, selectionStart - 1)
              : selectionStart;
          activeInputRef.current.setSelectionRange(newPos, newPos);
        } else if (button !== "{shift}" && button !== "{enter}") {
          const newPos = selectionStart + button.length;
          activeInputRef.current.setSelectionRange(newPos, newPos);
        }

        // Keep focus on the input
        if (activeInputRef.current) {
          activeInputRef.current.focus();
        }
      });
    },
    [nameInputRef, emailInputRef, phoneInputRef, formFields],
  );

  return (
    <div
      className="h-svh aspect-9/16 mx-auto bg-cover bg-center bg-no-repeat flex items-start justify-center p-4 bg-primary text-secondary"
      style={{
        backgroundImage: `url('${bg ?? getAssetPath("/images/bg_form.png")}')`,
      }}
    >
      <button
        onClick={onBack}
        className="absolute top-22 left-32 z-20 transition-all duration-200 active:scale-95 flex flex-row align-left items-center  gap-4 text-secondary text-2xl"
        aria-label="Back to home"
      >
        <div className="p-3 bg-secondary rounded-full shadow-lg transition-all duration-200 active:scale-95 flex flex-row">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </div>
        Back
      </button>
      {headerEl.styleTag}
      {submitButtonEl.styleTag}
      <div className="w-full px-32 lg:px-40 mx-auto mt-52">
        <div className="mb-20 text-center">
          <h1 className="pb-form-header text-[56px] leading-tight mb-2 font-black">
            {headerEl.copy}
          </h1>
        </div>

        <form
          className="flex flex-col gap-2 mb-8 text-2xl text-black"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-5">
            {formFields.name && (
              <>
                <label className="font-medium mb-0 mt-2" htmlFor="name">
                  Name
                </label>
                <input
                  ref={nameInputRef}
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  placeholder="e.g. Alonso"
                  className="w-full px-6 py-6 text-3xl lg:text-4xl font-medium bg-white rounded-xl border border-secondary/40 focus:outline-none focus:border-tertiary transition-all"
                  autoComplete="off"
                  required
                  autoFocus
                />
              </>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {formFields.email && (
              <>
                <label className="font-medium mb-0 mt-2" htmlFor="email">
                  E-mail Address
                </label>
                <input
                  ref={emailInputRef}
                  id="email"
                  type="text"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  placeholder="e.g. yourname@shell.com"
                  className="w-full px-6 py-6 text-3xl lg:text-4xl font-medium bg-white rounded-xl border border-secondary/40 focus:outline-none focus:border-tertiary transition-all"
                  autoComplete="off"
                  pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
                  required
                />
              </>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {formFields.phone && (
              <>
                <label className="font-medium mb-0 mt-2" htmlFor="phone">
                  Phone Number
                </label>
                <input
                  ref={phoneInputRef}
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  placeholder="e.g. 0812-6738-1902"
                  className="w-full px-6 py-6 text-3xl lg:text-4xl font-medium bg-white rounded-xl border border-secondary/40 focus:outline-none focus:border-tertiary transition-all"
                  autoComplete="off"
                  pattern="(\+62|62|0)[0-9\-]{9,15}"
                  title="Please enter a valid phone number, example: 0812-3456-7890 or +6281234567890"
                  required
                />
              </>
            )}
          </div>

          {formFields.consent && (
            <div className="flex flex-col gap-2 mt-8">
              <div className="flex items-start gap-3">
                <input
                  id="consent"
                  type="checkbox"
                  checked={isConsentChecked}
                  onChange={(e) => {
                    setIsConsentChecked(e.target.checked);
                    if (e.target.checked) setConsentError(false);
                  }}
                  className="mt-1 w-6 h-6 accent-tertiary border-secondary/50 rounded"
                  style={{ minWidth: "1.5rem", minHeight: "1.5rem" }}
                />
                <label
                  htmlFor="consent"
                  className="text-lg lg:text-2xl font-sans select-none"
                >
                  I consent to the collection and use of my personal data so I
                  can receive and download my photo.
                </label>
              </div>
              {consentError && (
                <p className="text-red-500 text-xl font-medium ml-9">
                  Please tick the consent checkbox to continue.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-center mt-8">
            <button
              type="submit"
              className="pb-form-submitButton px-14 py-6 bg-tertiary hover:bg-tertiary text-white rounded-xl font-medium text-3xl lg:text-5xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
            >
              {submitButtonEl.copy}
            </button>
          </div>
        </form>
      </div>
      {showKeyboard && (
        <SimpleKeyboard onKeyPress={handleKeyPress} layoutName={layoutName} />
      )}
    </div>
  );
}
