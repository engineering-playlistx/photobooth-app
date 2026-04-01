import React from "react";
import { Outlet } from "react-router-dom";

function RootLayout() {
  return (
    <div className="min-h-svh bg-white text-black">
      <Outlet />
    </div>
  );
}

export default RootLayout;
