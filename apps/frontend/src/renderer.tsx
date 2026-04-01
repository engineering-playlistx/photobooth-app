import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { EventConfigProvider } from "./contexts/EventConfigContext";
import { PipelineProvider } from "./contexts/PipelineContext";
import RootLayout from "./layouts/RootLayout";
import { PipelineRenderer } from "./components/PipelineRenderer";
import DataPage from "./routes/data";
import TestPage from "./routes/test";
import { NavigationListener } from "./components/NavigationListener";

// TODO: Fix ts error
// @ts-expect-error: Importing CSS without type declarations
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <EventConfigProvider>
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
    </EventConfigProvider>
  </React.StrictMode>,
);
