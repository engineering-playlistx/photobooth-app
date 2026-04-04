import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { EventConfig } from "@photobooth/types";

interface EventConfigContextType {
  config: EventConfig;
  apiBaseUrl: string;
  apiClientKey: string;
  refresh: () => void;
}

const EventConfigContext = createContext<EventConfigContextType | undefined>(
  undefined,
);

async function fetchConfig(
  apiBaseUrl: string,
  apiClientKey: string,
  eventId: string,
): Promise<EventConfig> {
  const response = await fetch(
    `${apiBaseUrl}/api/config?eventId=${encodeURIComponent(eventId)}`,
    {
      headers: { Authorization: `Bearer ${apiClientKey}` },
    },
  );
  if (!response.ok) {
    throw new Error(`Config fetch failed: ${response.status}`);
  }
  return response.json() as Promise<EventConfig>;
}

type LoadStatus = "loading" | "ready" | "error";

export function EventConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiClientKey, setApiClientKey] = useState("");
  const [status, setStatus] = useState<LoadStatus>("loading");

  // Refs avoid stale-closure issues inside the async callback
  const configRef = useRef<EventConfig | null>(null);
  const kioskConfigRef = useRef<KioskConfig | null>(null);

  const doFetch = useCallback(async () => {
    try {
      if (!kioskConfigRef.current) {
        kioskConfigRef.current = await window.electronAPI!.getKioskConfig();
      }
      const {
        eventId,
        apiBaseUrl: baseUrl,
        apiClientKey: clientKey,
      } = kioskConfigRef.current;
      const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
      const data = await fetchConfig(normalizedBaseUrl, clientKey, eventId);
      configRef.current = data;
      setConfig(data);
      setApiBaseUrl(normalizedBaseUrl);
      setApiClientKey(clientKey);
      setStatus("ready");
    } catch (err) {
      console.error("[EventConfig] fetch failed:", err);
      // If we have a cached config, silently continue — operator won't notice
      setStatus(configRef.current !== null ? "ready" : "error");
    }
  }, []);

  useEffect(() => {
    void doFetch();
  }, [doFetch]);

  const refresh = useCallback(() => {
    void doFetch();
  }, [doFetch]);

  // Initial load in progress — blank screen is fine, it's fast
  if (status === "loading" && config === null) {
    return (
      <div className="h-svh aspect-9/16 mx-auto flex items-center justify-center bg-black">
        <p className="text-white text-2xl font-shell">Loading...</p>
      </div>
    );
  }

  // Fetch failed before we ever had a config — operator must fix this
  if (status === "error" || config === null) {
    return (
      <div className="h-svh aspect-9/16 mx-auto flex flex-col items-center justify-center gap-6 bg-black px-12">
        <p className="text-white text-3xl font-shell text-center font-bold">
          Configuration Error
        </p>
        <p className="text-white/70 text-xl font-shell text-center">
          Unable to load event configuration. Check your network connection and
          ensure the kiosk is set up correctly.
        </p>
        <button
          type="button"
          onClick={refresh}
          className="px-10 py-5 bg-tertiary text-white rounded-lg text-2xl font-shell cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <EventConfigContext.Provider
      value={{ config, apiBaseUrl, apiClientKey, refresh }}
    >
      {children}
    </EventConfigContext.Provider>
  );
}

export function useEventConfig(): EventConfigContextType {
  const ctx = useContext(EventConfigContext);
  if (!ctx) {
    throw new Error("useEventConfig must be used within EventConfigProvider");
  }
  return ctx;
}
