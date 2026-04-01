import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePipeline } from "../contexts/PipelineContext";

export function NavigationListener() {
  const navigate = useNavigate();
  const pipeline = usePipeline();

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    const cleanupNavHome = window.electronAPI.onNavigateToHome(() => {
      pipeline.reset();
    });

    const cleanupNavData = window.electronAPI.onNavigateToData(() => {
      void navigate("/data");
    });

    return () => {
      cleanupNavHome();
      cleanupNavData();
    };
  }, [navigate, pipeline]);

  return null;
}
