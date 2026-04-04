import React, { useRef, useState, useEffect } from "react";
import { getAssetPath } from "../utils/assets";
import { useModuleBackground } from "../hooks/useModuleBackground";
import type { CameraModuleConfig } from "@photobooth/types";
import type { ModuleProps } from "./types";

const VIDEO_VERTICAL_OFFSET = 540;

export function CameraModule({ config, onComplete, onBack }: ModuleProps) {
  const { maxRetakes } = config as CameraModuleConfig;
  const bg = useModuleBackground("camera");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [retakeCount, setRetakeCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const capturedPhotosRef = useRef<HTMLImageElement[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [showCameraMenu, setShowCameraMenu] = useState(false);

  const canvasWidth = 1080;
  const canvasHeight = 1920;
  const videoAspectRatio = 9 / 16;
  const videoHeight = canvasHeight * (480 / canvasHeight);
  const videoWidth = videoHeight / videoAspectRatio;
  const verticalOffset = VIDEO_VERTICAL_OFFSET;

  async function enumerateDevices() {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
      setDevices(videoDevices);
      return videoDevices;
    } catch {
      return [];
    }
  }

  useEffect(() => {
    async function init() {
      await handleStartCamera();
      await enumerateDevices();
    }
    void init();

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    function drawFrame() {
      if (!canvas || !context) {
        animationFrameRef.current = window.requestAnimationFrame(drawFrame);
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);

      if (capturedPhotosRef.current.length === 0) {
        if (!video || video.readyState !== 4) {
          animationFrameRef.current = window.requestAnimationFrame(drawFrame);
          return;
        }

        context.save();
        context.translate(canvasWidth, 0);
        context.scale(-1, 1);
        const centerX = (canvasWidth - videoWidth) / 2;
        context.drawImage(
          video,
          centerX,
          verticalOffset,
          videoWidth,
          videoHeight,
        );
        context.restore();
      } else {
        const photoImage = capturedPhotosRef.current[0];
        if (photoImage && photoImage.complete) {
          const centerX = (canvasWidth - videoWidth) / 2;
          context.drawImage(
            photoImage,
            centerX,
            VIDEO_VERTICAL_OFFSET,
            videoWidth,
            videoHeight,
          );
        }
      }

      if (countdownRef.current !== null && countdownRef.current > 0) {
        const countdownX = 840;
        const countdownY = verticalOffset + videoHeight - 48;

        context.save();
        const countdownVal = countdownRef.current.toString();
        context.font = "bold 52px sans-serif";
        context.textAlign = "left";
        context.textBaseline = "bottom";

        const textMetrics = context.measureText(countdownVal);
        const textWidth = textMetrics.width;
        const radius = Math.max(45, textWidth / 2 + 20);
        const circleCenterX = countdownX + textWidth / 2;
        const circleCenterY = countdownY - 30;

        context.beginPath();
        context.arc(
          circleCenterX,
          circleCenterY,
          radius,
          0,
          2 * Math.PI,
          false,
        );
        context.fillStyle = "#DD1D21";
        context.fill();
        context.lineWidth = 4;
        context.strokeStyle = "#DD1D21";
        context.stroke();

        context.fillStyle = "#FFF";
        context.font = "bold 52px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(countdownVal, circleCenterX, circleCenterY);

        context.restore();
      }

      animationFrameRef.current = window.requestAnimationFrame(drawFrame);
    }

    drawFrame();

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCameraActive, verticalOffset, capturedPhotos]);

  async function handleStartCamera(deviceId?: string) {
    try {
      setError(null);

      if (videoRef.current) {
        const video = videoRef.current;
        video.pause();
        video.srcObject = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }

      if (
        !window.navigator.mediaDevices ||
        !window.navigator.mediaDevices.getUserMedia
      ) {
        throw new Error("Camera access is not supported in this browser");
      }

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };
      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      }

      const mediaStream = await window.navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      streamRef.current = mediaStream;

      if (videoRef.current) {
        const video = videoRef.current;

        video.srcObject = mediaStream;

        const handleCanPlay = () => {
          video.removeEventListener("canplay", handleCanPlay);
          video.play().catch((err) => {
            if (err instanceof Error && err.name !== "AbortError") {
              console.error("Error playing video:", err);
            }
          });
        };

        video.addEventListener("canplay", handleCanPlay);

        if (video.readyState >= 3) {
          video.play().catch((err) => {
            if (err instanceof Error && err.name !== "AbortError") {
              console.error("Error playing video:", err);
            }
          });
        }
      }

      setIsCameraActive(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to access camera";
      setError(errorMessage);
      setIsCameraActive(false);
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !isCameraActive) {
      return;
    }

    const video = videoRef.current;
    if (video.readyState !== 4) {
      return;
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = videoWidth;
    tempCanvas.height = videoHeight;
    const tempContext = tempCanvas.getContext("2d");

    if (!tempContext) {
      return;
    }

    tempContext.save();
    tempContext.translate(videoWidth, 0);
    tempContext.scale(-1, 1);
    tempContext.drawImage(video, 0, 0, videoWidth, videoHeight);
    tempContext.restore();

    const photoData = tempCanvas.toDataURL("image/png");

    const photoImage = new window.Image();
    photoImage.src = photoData;
    photoImage.onload = () => {
      capturedPhotosRef.current = [photoImage];
      setCapturedPhotos([photoData]);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }
      setIsCameraActive(false);
    };
  }

  function handleCapturePhoto() {
    if (!videoRef.current || !isCameraActive || countdown !== null) {
      return;
    }

    setCountdown(3);
    countdownRef.current = 3;
  }

  useEffect(() => {
    if (countdown === null) {
      countdownRef.current = null;
      return;
    }

    countdownRef.current = countdown;

    if (countdown === 0) {
      capturePhoto();
      setCountdown(null);
      countdownRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  function handleSelectCamera(deviceId: string) {
    setSelectedDeviceId(deviceId);
    setShowCameraMenu(false);
    capturedPhotosRef.current = [];
    setCapturedPhotos([]);
    setRetakeCount(0);
    void handleStartCamera(deviceId);
  }

  function handleRetake() {
    if (capturedPhotosRef.current.length === 0 || retakeCount >= maxRetakes) {
      return;
    }

    setRetakeCount((prev) => prev + 1);
    capturedPhotosRef.current = [];
    setCapturedPhotos([]);

    if (!isCameraActive && streamRef.current === null) {
      void handleStartCamera(selectedDeviceId ?? undefined);
    }
  }

  function handleNext() {
    if (capturedPhotos.length === 0 || !canvasRef.current) {
      return;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    setIsCameraActive(false);

    onComplete({ originalPhoto: capturedPhotos[0] });
  }

  return (
    <div
      className="h-svh aspect-9/16 mx-auto bg-cover bg-center bg-no-repeat text-secondary relative overflow-hidden"
      style={{
        backgroundImage: `url('${bg ?? getAssetPath("/images/bg_camera.png")}')`,
      }}
    >
      <button
        onClick={onBack}
        className="absolute top-22 left-32 z-20 transition-all duration-200 active:scale-95 flex flex-row align-left items-center  gap-4 text-secondary text-2xl"
        aria-label="Back to home"
      >
        <div className="p-3 bg-secondary rounded-full shadow-lg transition-all duration-200 active:scale-95 flex flex-row">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </div>
        Back
      </button>

      {/* Camera selector button - top right */}
      {devices.length > 1 && (
        <div className="absolute opacity-50 top-22 right-32 z-30">
          <button
            onClick={() => setShowCameraMenu((prev) => !prev)}
            className="p-3 rounded-full transition-all duration-200 active:scale-95"
            aria-label="Select camera"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>

          {showCameraMenu && (
            <>
              <div
                className="fixed inset-0"
                onClick={() => setShowCameraMenu(false)}
              />
              <div className="absolute top-16 right-0 bg-white rounded-2xl shadow-xl overflow-hidden min-w-72 z-10">
                {devices.map((device, index) => (
                  <button
                    key={device.deviceId}
                    onClick={() => handleSelectCamera(device.deviceId)}
                    className={`w-full text-left px-6 py-4 text-lg transition-colors duration-150 flex items-center gap-3 ${
                      selectedDeviceId === device.deviceId
                        ? "bg-primary font-bold text-secondary"
                        : "hover:bg-gray-100 text-secondary"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill={
                        selectedDeviceId === device.deviceId
                          ? "currentColor"
                          : "none"
                      }
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0"
                    >
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    {device.label || `Camera ${index + 1}`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-20 p-3 bg-red-500/20 border border-red-500 rounded-lg">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      <div className="relative w-full h-full overflow-hidden">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="w-full h-full object-contain"
        />
        <video ref={videoRef} autoPlay playsInline muted className="hidden" />

        <div className="z-10 absolute bottom-100 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer flex flex-col items-center gap-6 w-full">
          {capturedPhotos.length > 0 &&
            maxRetakes > 0 &&
            retakeCount === maxRetakes - 1 && (
              <p className="text-white/70 text-3xl font-medium">
                This is your last retake
              </p>
            )}
          <div className="flex items-center justify-center gap-8 lg:gap-16 w-full">
            <button
              onClick={handleRetake}
              className="flex flex-col items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
              aria-label="Retake photo"
              disabled={capturedPhotos.length <= 0 || retakeCount >= maxRetakes}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleRetake();
                }
              }}
            >
              <img
                src={getAssetPath("/images/ico-retake.png")}
                alt="Retake"
                className="size-32 object-contain"
              />
              <span className="text-white text-2xl lg:text-3xl absolute -bottom-4">
                Retake
              </span>
            </button>
            <button
              onClick={handleCapturePhoto}
              className="size-48 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
              disabled={
                capturedPhotos.length >= 1 ||
                !isCameraActive ||
                countdown !== null
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleCapturePhoto();
                }
              }}
            >
              <img
                src={getAssetPath("/images/ico-capture.png")}
                alt="Capture"
                className="transition-all duration-200 active:brightness-[1.3] active:hue-rotate-15"
              />
            </button>
            <button
              onClick={handleNext}
              className="flex flex-col items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
              aria-label="Next"
              disabled={capturedPhotos.length < 1}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleNext();
                }
              }}
            >
              <img
                src={getAssetPath("/images/ico-next.png")}
                alt="Next"
                className="size-32 object-contain"
              />
              <span className="text-white text-2xl lg:text-3xl absolute -bottom-4">
                Next
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
