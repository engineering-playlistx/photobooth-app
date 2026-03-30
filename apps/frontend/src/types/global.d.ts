import type { PhotoResultDocument } from "../utils/database";

declare global {
  interface KioskConfig {
    eventId: string;
    apiBaseUrl: string;
    apiClientKey: string;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }

  interface ElectronAPI {
    getKioskConfig(): Promise<KioskConfig>;
    platform: string;
    isElectron: boolean;
    print: (imageDataUrl: string) => Promise<PrintResult>;
    savePhotoFile: (
      base64Data: string,
      fileName: string,
    ) => Promise<{ success: boolean; error?: string; filePath?: string }>;
    db: {
      savePhotoResult: (
        document: PhotoResultDocument,
      ) => Promise<{ success: boolean; error?: string }>;
      getAllPhotoResults: () => Promise<{
        success: boolean;
        error?: string;
        data: PhotoResultDocument[];
      }>;
      getPhotoResultById: (id: string) => Promise<{
        success: boolean;
        error?: string;
        data: PhotoResultDocument | null;
      }>;
    };
    onNavigateToHome: (callback: () => void) => () => void;
    onNavigateToData: (callback: () => void) => () => void;
  }

  interface PrintResult {
    success: boolean;
    error?: string;
    filepath?: string;
  }
}

export {};
