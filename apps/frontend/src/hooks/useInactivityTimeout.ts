import { useCallback, useEffect, useRef, useState } from "react";

export const INACTIVITY_TIMEOUT_MS = 60_000;

const INTERACTION_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "touchmove",
] as const;

interface UseInactivityTimeoutOptions {
  onTimeout: () => void;
  disabled?: boolean;
  timeoutMs?: number;
  warningMs?: number;
}

export function useInactivityTimeout({
  onTimeout,
  disabled,
  timeoutMs = INACTIVITY_TIMEOUT_MS,
  warningMs = 15_000,
}: UseInactivityTimeoutOptions): {
  showWarning: boolean;
  resetAll: () => void;
} {
  const [showWarning, setShowWarning] = useState(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  const showWarningRef = useRef(false);
  const restartTimerRef = useRef<() => void>(() => {});

  // Keep callback ref current without restarting the timer
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  });

  // Keep showWarningRef in sync so the interaction handler can read it without
  // being a dependency of the effect (which would re-register listeners).
  useEffect(() => {
    showWarningRef.current = showWarning;
  }, [showWarning]);

  useEffect(() => {
    if (disabled) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      setShowWarning(false);
      showWarningRef.current = false;
      return;
    }

    const startInactivityTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        setShowWarning(true);
        showWarningRef.current = true;
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningTimerRef.current = setTimeout(() => {
          onTimeoutRef.current();
        }, warningMs);
      }, timeoutMs);
    };

    // Expose so resetAll (defined outside this effect) can restart the timer.
    restartTimerRef.current = startInactivityTimer;

    const handleInteraction = () => {
      // While the warning modal is visible, ignore random interactions —
      // the guest must tap "I'm still here" to dismiss.
      if (!showWarningRef.current) {
        startInactivityTimer();
      }
    };

    startInactivityTimer(); // start on mount

    INTERACTION_EVENTS.forEach((event) =>
      window.addEventListener(event, handleInteraction, { passive: true }),
    );

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      INTERACTION_EVENTS.forEach((event) =>
        window.removeEventListener(event, handleInteraction),
      );
    };
  }, [disabled, timeoutMs, warningMs]);

  const resetAll = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    showWarningRef.current = false;
    setShowWarning(false);
    restartTimerRef.current();
  }, []);

  return { showWarning, resetAll };
}
