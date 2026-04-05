import React, { useCallback, useEffect, useRef, useState } from "react";

const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 30;

type Screen = "pin" | "settings" | "locked";

interface Props {
  onClose: () => void;
  onReconnect: () => void;
}

function PinDisplay({ digits }: { digits: string }) {
  return (
    <div className="flex gap-4 justify-center">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-14 h-14 rounded-full border-2 border-white/40 flex items-center justify-center"
        >
          {digits[i] ? <div className="w-5 h-5 rounded-full bg-white" /> : null}
        </div>
      ))}
    </div>
  );
}

function PinPad({
  onDigit,
  onDelete,
}: {
  onDigit: (d: string) => void;
  onDelete: () => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((key, idx) => {
        if (key === "") return <div key={idx} />;
        const isDelete = key === "⌫";
        return (
          <button
            key={key}
            type="button"
            onClick={() => (isDelete ? onDelete() : onDigit(key))}
            className="h-16 rounded-xl bg-white/10 text-white text-2xl font-shell font-bold cursor-pointer active:bg-white/25 select-none"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

export function KioskSettings({ onClose, onReconnect }: Props) {
  // PIN gate state
  const [screen, setScreen] = useState<Screen>("pin");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Settings state
  const [currentConfig, setCurrentConfig] = useState<KioskConfig | null>(null);
  const [newEventId, setNewEventId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load current kiosk config when settings screen opens
  useEffect(() => {
    if (screen !== "settings") return;
    void window.electronAPI!.getKioskConfig().then((cfg) => {
      setCurrentConfig(cfg);
      setNewEventId(cfg.eventId);
    });
  }, [screen]);

  // Escape key closes the overlay
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lockout countdown
  useEffect(() => {
    if (screen !== "locked") return;
    let remaining = LOCKOUT_SECONDS;
    setLockoutRemaining(remaining);
    lockoutRef.current = setInterval(() => {
      remaining--;
      setLockoutRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(lockoutRef.current!);
        setAttempts(0);
        setPin("");
        setPinError("");
        setScreen("pin");
      }
    }, 1000);
    return () => {
      if (lockoutRef.current) clearInterval(lockoutRef.current);
    };
  }, [screen]);

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length >= 4) return;
      const next = pin + digit;
      setPin(next);
      setPinError("");

      if (next.length === 4) {
        // Check PIN after a brief visual pause
        setTimeout(() => {
          void (async () => {
            const correctPin = await window.electronAPI!.getKioskAdminPin();
            if (next === correctPin) {
              setScreen("settings");
              setPin("");
              setAttempts(0);
            } else {
              const newAttempts = attempts + 1;
              setAttempts(newAttempts);
              setPin("");
              if (newAttempts >= MAX_PIN_ATTEMPTS) {
                setScreen("locked");
              } else {
                setPinError(
                  `Incorrect PIN. ${MAX_PIN_ATTEMPTS - newAttempts} attempt${MAX_PIN_ATTEMPTS - newAttempts === 1 ? "" : "s"} remaining.`,
                );
              }
            }
          })();
        }, 150);
      }
    },
    [pin, attempts],
  );

  const handleDelete = useCallback(() => {
    setPin((p) => p.slice(0, -1));
    setPinError("");
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = newEventId.trim();
    if (!trimmed) {
      setSaveError("Event ID cannot be empty.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      await window.electronAPI!.saveKioskConfig({ eventId: trimmed });
      setSaveSuccess(true);
      // Trigger full startup re-run so the new eventId is fetched
      setTimeout(() => onReconnect(), 1000);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save config.",
      );
    } finally {
      setSaving(false);
    }
  }, [newEventId, onReconnect]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90">
      <div className="w-full max-w-xs bg-neutral-900 rounded-2xl px-8 py-10 flex flex-col gap-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-white font-shell font-black text-2xl tracking-wide">
            {screen === "pin"
              ? "Admin PIN"
              : screen === "locked"
                ? "Locked"
                : "Kiosk Settings"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white text-xl font-bold cursor-pointer select-none"
          >
            ✕
          </button>
        </div>

        {/* PIN entry */}
        {screen === "pin" && (
          <>
            <p className="text-white/60 text-sm font-shell text-center">
              Enter the 4-digit admin PIN to continue.
            </p>
            <PinDisplay digits={pin} />
            {pinError && (
              <p className="text-red-400 text-sm font-shell text-center">
                {pinError}
              </p>
            )}
            <PinPad onDigit={handleDigit} onDelete={handleDelete} />
          </>
        )}

        {/* Locked screen */}
        {screen === "locked" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-red-400 font-shell text-lg">
              Too many failed attempts.
            </p>
            <p className="text-white/60 font-shell text-base">
              Try again in{" "}
              <span className="text-white font-bold">{lockoutRemaining}s</span>.
            </p>
          </div>
        )}

        {/* Settings form */}
        {screen === "settings" && (
          <>
            {currentConfig && (
              <div className="flex flex-col gap-1">
                <p className="text-white/40 text-xs font-shell uppercase tracking-widest">
                  Current Event ID
                </p>
                <p className="text-white/70 text-base font-shell font-mono break-all">
                  {currentConfig.eventId || "(none)"}
                </p>
                <p className="text-white/40 text-xs font-shell uppercase tracking-widest mt-3">
                  API URL
                </p>
                <p className="text-white/70 text-sm font-shell font-mono break-all">
                  {currentConfig.apiBaseUrl}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-white/60 text-xs font-shell uppercase tracking-widest">
                New Event ID
              </label>
              <input
                type="text"
                value={newEventId}
                onChange={(e) => {
                  setNewEventId(e.target.value);
                  setSaveError("");
                  setSaveSuccess(false);
                }}
                placeholder="Enter event ID"
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white font-shell text-base placeholder-white/30 outline-none focus:bg-white/15"
              />
            </div>

            {saveError && (
              <p className="text-red-400 text-sm font-shell">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-green-400 text-sm font-shell">
                Saved! Reconnecting…
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="w-full py-4 bg-tertiary text-white rounded-xl font-shell font-bold text-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save & Reconnect"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
