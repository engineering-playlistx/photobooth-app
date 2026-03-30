import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAssetPath } from "../utils/assets";
import { useEventConfig } from "../contexts/EventConfigContext";

function IndexPage() {
  const navigate = useNavigate();
  const { refresh } = useEventConfig();

  function handleOpenCamera() {
    refresh(); // re-fetch config in background for next session
    void navigate("/select");
  }

  useEffect(() => {
    console.log("Screen size:", window.innerWidth, window.innerHeight);
    console.log("Window size:", window.outerWidth, window.outerHeight);
  }, []);

  return (
    <div className="h-svh aspect-9/16 mx-auto relative flex items-center justify-center p-4 bg-black overflow-hidden">
      <div
        className="absolute inset-0 w-full h-full px-26 pb-20 pt-76"
        style={{
          background: `url('${getAssetPath("/images/bg_index.png")}')`,
          backgroundSize: "cover",
        }}
      >
        {/* <video autoPlay loop playsInline className="w-full h-full object-cover">
          <source src={getAssetPath("/videos/kv1.mp4")} type="video/mp4" />
        </video> */}
      </div>
      <div className="w-full text-center absolute bottom-85 left-1/2 -translate-x-1/2 z-10">
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleOpenCamera}
            className="px-12 py-8 bg-tertiary hover:bg-tertiary text-white rounded-xl font-shell font-black text-3xl lg:text-5xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none active:bg-secondary active:text-white shadow-xl"
          >
            Tap to Start
          </button>
        </div>
      </div>
    </div>
  );
}

export default IndexPage;
