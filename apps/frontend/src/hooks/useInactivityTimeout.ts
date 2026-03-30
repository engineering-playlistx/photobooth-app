import { useEffect, useRef } from "react";

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
}

export function useInactivityTimeout({
  onTimeout,
  disabled,
}: UseInactivityTimeoutOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  // Keep callback ref current without restarting the timer
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  });

  useEffect(() => {
    if (disabled) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => onTimeoutRef.current(),
        INACTIVITY_TIMEOUT_MS,
      );
    };

    resetTimer(); // start on mount

    INTERACTION_EVENTS.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true }),
    );

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      INTERACTION_EVENTS.forEach((event) =>
        window.removeEventListener(event, resetTimer),
      );
    };
  }, [disabled]);
}
