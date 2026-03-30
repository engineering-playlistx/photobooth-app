"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { usePhotobooth } from "../contexts/PhotoboothContext";
import { useNavigate } from "react-router-dom";
import type { ToastMessage } from "../components/ToastContainer";
import ToastContainer from "../components/ToastContainer";
import { supabase } from "../utils/supabase";
import { getAssetPath } from "../utils/assets";
import { usePrint } from "../hooks/usePrint";
import { savePhotoFile, savePhotoResult } from "../utils/database";
import QRCodeModal from "../components/QRCodeModal";
import { useEventConfig } from "../contexts/EventConfigContext";

const API_BASE_URL =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:3000";
const API_CLIENT_KEY =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).env?.VITE_API_CLIENT_KEY || "";

const SUPABASE_BUCKET = "photobooth-bucket";

function base64ToBlob(base64: string, contentType = "", sliceSize = 512) {
  const byteCharacters = atob(base64.split(",")[1]);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  const blob = new Blob(byteArrays, { type: contentType });
  return blob;
}

export default function ResultPage() {
  const { eventId, finalPhoto, selectedTheme, userInfo } = usePhotobooth();
  const { config: eventConfig } = useEventConfig();
  const supabaseFolder = eventId ? `events/${eventId}/photos` : "public";
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const hasSaved = useRef(false);
  const [savedPhotoPath, setSavedPhotoPath] = useState<string | null>(null);
  const photoUuid = useMemo(() => crypto.randomUUID(), []);
  const photoFileName = useMemo(
    () =>
      `${photoUuid}-${userInfo?.name.trim().replace(/[^a-zA-Z0-9]/g, "-")}.png`,
    [photoUuid, userInfo?.name],
  );

  const addToast = (message: string, type: "success" | "error") => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // Email feature - commented out
  // const emailResult = async () => { ... };

  const uploadToSupabaseAndShowQR = async () => {
    if (!finalPhoto) {
      addToast("Photo is missing.", "error");
      return;
    }

    try {
      const filePath = `${supabaseFolder}/${photoFileName}`;

      // Photo is already uploaded to Supabase during auto-save,
      // but re-upload with upsert as a fallback in case it failed
      if (!hasSaved.current) {
        const blob = base64ToBlob(finalPhoto, "image/png");
        const { error: uploadError } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .upload(filePath, blob, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.error("Supabase upload error:", uploadError);
          addToast("Failed to upload photo. Please try again.", "error");
          return;
        }
      }

      const { data } = supabase.storage
        .from(SUPABASE_BUCKET)
        .getPublicUrl(filePath);

      setQrUrl(data.publicUrl);
      setShowQrModal(true);
    } catch (error) {
      console.error("Error uploading photo:", error);
      addToast("Failed to generate download link. Please try again.", "error");
    }
  };

  const handlePrintAndDownload = async () => {
    if (!finalPhoto) {
      addToast("Photo is missing.", "error");
      return;
    }

    setIsProcessing(true);
    try {
      // Fire print and upload in parallel
      void handlePrint();
      await uploadToSupabaseAndShowQR();
    } finally {
      setIsProcessing(false);
    }
  };

  // printing feature
  const { print } = usePrint();

  const handlePrint = async () => {
    try {
      if (!savedPhotoPath) {
        addToast("Photo not saved yet. Please wait.", "error");
        return;
      }
      const result = await print(
        savedPhotoPath,
        eventConfig.techConfig.printerName,
      );
      if (result.success) {
        console.log("Print successful!");
        if (result.filepath) {
          console.log("pdf saved to:", result.filepath);
        }
      } else {
        console.error("Print failed:", result.error);
        addToast(`Print failed: ${result.error}`, "error");
      }
    } catch (error) {
      console.error("Print error", error);
      addToast(`Print error`, "error");
    }
  };

  // Auto-save photo result to local database and Supabase when page loads
  useEffect(() => {
    if (hasSaved.current || !finalPhoto || !selectedTheme || !userInfo) {
      return;
    }

    const saveToDatabase = async () => {
      try {
        hasSaved.current = true;

        // Save locally via Electron
        const photoPath = await savePhotoFile(finalPhoto, photoFileName);
        setSavedPhotoPath(photoPath);

        await savePhotoResult({
          photoPath,
          selectedTheme,
          userInfo,
          eventId,
        });

        console.log("Photo result saved to local database successfully");

        // Upload photo to Supabase storage and save user record
        const supabasePath = `${supabaseFolder}/${photoFileName}`;
        const blob = base64ToBlob(finalPhoto, "image/png");
        const { error: uploadError } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .upload(supabasePath, blob, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.error("Supabase upload error:", uploadError);
        } else {
          const response = await fetch(`${API_BASE_URL}/api/photo`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${API_CLIENT_KEY}`,
            },
            body: JSON.stringify({
              photoPath: supabasePath,
              name: userInfo.name,
              email: userInfo.email,
              phone: userInfo.phone,
              selectedTheme: selectedTheme.theme,
              eventId,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error("Failed to save user to Supabase:", errorData);
          } else {
            console.log("User record saved to Supabase successfully");
          }
        }
      } catch (error) {
        console.error("Failed to save photo result:", error);
        addToast("Failed to save photo result. Please try again.", "error");
        hasSaved.current = false;
      }
    };

    void saveToDatabase();
  }, [finalPhoto, selectedTheme, userInfo, photoFileName]);

  return (
    <div className="h-svh aspect-9/16 mx-auto relative flex items-center justify-center bg-primary text-secondary">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('${getAssetPath("/images/bg_result.png")}')`,
        }}
      />
      <div className="relative z-10 w-full px-36 mx-auto mb-40">
        <div className="flex flex-col items-center gap-0">
          <h1 className="text-8xl font-black text-tertiary mt-0 mb-14">
            Ready to Race!
          </h1>
          <div className="w-175">
            {!!finalPhoto && !!selectedTheme && (
              <img
                src={finalPhoto}
                // src="/images/_for-testing/frame-1.png"
                alt="Final photo"
                // add print area class for printing
                className="w-full h-auto rounded-xl shadow-md print-area border border-black/30 border-1"
              />
            )}
          </div>

          <button
            type="button"
            className="mt-12 mb-6 w-full text-5xl px-7 py-5 bg-tertiary text-white rounded-lg font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
            onClick={() => void handlePrintAndDownload()}
            disabled={isProcessing}
          >
            {isProcessing ? "Processing..." : "Print & Download"}
          </button>

          <div className="text-center text-4xl grid grid-cols-2 gap-6 w-full">
            <button
              type="button"
              className="px-7 py-3 bg-white text-secondary rounded-lg font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
              onClick={() => void navigate("/")}
            >
              Retry Result
            </button>
            <button
              type="button"
              className="px-7 py-3 bg-white text-secondary rounded-lg font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
              onClick={() => void navigate("/")}
            >
              Back to Home
            </button>
          </div>

          {qrUrl && (
            <QRCodeModal
              url={qrUrl}
              isOpen={showQrModal}
              onClose={() => setShowQrModal(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
