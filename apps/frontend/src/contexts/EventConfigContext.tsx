import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { EventConfig } from "@photobooth/types";

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type ErrorType = "none" | "network" | "not-found" | "server-error";

interface EventConfigContextType {
  config: EventConfig;
  apiBaseUrl: string;
  apiClientKey: string;
  status: LoadStatus;
  errorType: ErrorType;
  refreshConfig: () => void;
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
    const err = new Error(`Config fetch failed: ${response.status}`);
    (err as Error & { status: number }).status = response.status;
    throw err;
  }
  return response.json() as Promise<EventConfig>;
}

function injectCustomFont(
  fontFamily: string | null | undefined,
  fontUrl: string | null | undefined,
) {
  const existing = document.getElementById("custom-font");
  if (existing) existing.remove();
  if (!fontFamily || !fontUrl) return;
  const style = document.createElement("style");
  style.id = "custom-font";
  style.textContent = `
    @font-face {
      font-family: '${fontFamily}';
      src: url('${fontUrl}');
      font-display: swap;
    }
    :root {
      --font-custom: '${fontFamily}', sans-serif;
    }
  `;
  document.head.appendChild(style);
}

export function EventConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiClientKey, setApiClientKey] = useState("");
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [errorType, setErrorType] = useState<ErrorType>("none");

  // Refs avoid stale-closure issues inside the async callback
  const configRef = useRef<EventConfig | null>(null);
  const kioskConfigRef = useRef<KioskConfig | null>(null);

  const doFetch = useCallback(async () => {
    setStatus("loading");
    setErrorType("none");
    try {
      // Always re-read kiosk config so changes from KioskSettings are picked up
      kioskConfigRef.current = await window.electronAPI!.getKioskConfig();
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
      injectCustomFont(data.branding.fontFamily, data.branding.fontUrl);
    } catch (err) {
      console.error("[EventConfig] fetch failed:", err);
      const httpStatus = (err as { status?: number }).status;
      if (httpStatus === 404) {
        setErrorType("not-found");
      } else if (httpStatus !== undefined && httpStatus >= 500) {
        setErrorType("server-error");
      } else {
        setErrorType("network");
      }
      // If we have a cached config, silently continue — operator won't notice
      if (configRef.current !== null) {
        setStatus("ready");
      } else {
        setStatus("error");
      }
    }
  }, []);

  const refreshConfig = useCallback(() => {
    void doFetch();
  }, [doFetch]);

  return (
    <EventConfigContext.Provider
      value={{
        // config is non-null whenever status is "ready"; StartupLoader gates all consumers
        config: config as EventConfig,
        apiBaseUrl,
        apiClientKey,
        status,
        errorType,
        refreshConfig,
      }}
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
