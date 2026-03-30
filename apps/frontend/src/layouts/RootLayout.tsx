import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePhotobooth } from "../contexts/PhotoboothContext";
import { useEventConfig } from "../contexts/EventConfigContext";
import { useInactivityTimeout } from "../hooks/useInactivityTimeout";

// Suppress timeout on the splash screen (already home) and during AI
// generation (loading can take 30–60s with no user input).
const TIMEOUT_DISABLED_ROUTES = new Set(["/", "/loading"]);

function RootLayout() {
  const { reset } = usePhotobooth();
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useEventConfig();

  useInactivityTimeout({
    onTimeout: () => {
      reset();
      void navigate("/");
    },
    disabled: TIMEOUT_DISABLED_ROUTES.has(location.pathname),
    timeoutMs: config.techConfig.inactivityTimeoutSeconds * 1000,
  });

  return (
    <div className="min-h-svh bg-white text-black">
      <Outlet />
    </div>
  );
}

export default RootLayout;
