import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { EventConfigProvider } from "./contexts/EventConfigContext";
import { PipelineProvider } from "./contexts/PipelineContext";
import RootLayout from "./layouts/RootLayout";
import { PipelineRenderer } from "./components/PipelineRenderer";
import { StartupLoader } from "./components/StartupLoader";
import { KioskSettings } from "./components/KioskSettings";
import DataPage from "./routes/data";
import TestPage from "./routes/test";
import { NavigationListener } from "./components/NavigationListener";

// TODO: Fix ts error
// @ts-expect-error: Importing CSS without type declarations
import "./index.css";

function AppShell() {
  const [showSettings, setShowSettings] = useState(false);
  // Incrementing this key forces StartupLoader to remount and re-run startup
  const [startupKey, setStartupKey] = useState(0);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unlisten = window.electronAPI.onOpenKioskSettings(() => {
      setShowSettings(true);
    });
    return unlisten;
  }, []);

  function handleReconnect() {
    setShowSettings(false);
    setStartupKey((k) => k + 1);
  }

  return (
    <EventConfigProvider>
      <StartupLoader key={startupKey}>
        <PipelineProvider>
          <HashRouter>
            <NavigationListener />
            <Routes>
              <Route path="/" element={<RootLayout />}>
                <Route index element={<PipelineRenderer />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/test" element={<TestPage />} />
              </Route>
            </Routes>
          </HashRouter>
        </PipelineProvider>
      </StartupLoader>
      {showSettings && (
        <KioskSettings
          onClose={() => setShowSettings(false)}
          onReconnect={handleReconnect}
        />
      )}
    </EventConfigProvider>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>,
);
