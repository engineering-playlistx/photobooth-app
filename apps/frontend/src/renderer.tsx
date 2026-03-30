import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { PhotoboothProvider } from "./contexts/PhotoboothContext";
import { EventConfigProvider } from "./contexts/EventConfigContext";
import RootLayout from "./layouts/RootLayout";
import IndexPage from "./routes/index";
import CameraPage from "./routes/camera";
import SelectPage from "./routes/select";
import FormPage from "./routes/form";
import LoadingPage from "./routes/loading";
import ResultPage from "./routes/result";
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
      <PhotoboothProvider>
        <HashRouter>
          <NavigationListener />
          <Routes>
            <Route path="/" element={<RootLayout />}>
              <Route index element={<IndexPage />} />
              <Route path="/select" element={<SelectPage />} />
              <Route path="/camera" element={<CameraPage />} />
              <Route path="/form" element={<FormPage />} />
              <Route path="/loading" element={<LoadingPage />} />
              <Route path="/result" element={<ResultPage />} />
              <Route path="/data" element={<DataPage />} />
              <Route path="/test" element={<TestPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </PhotoboothProvider>
    </EventConfigProvider>
  </React.StrictMode>,
);
