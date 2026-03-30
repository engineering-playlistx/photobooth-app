// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // detect platform
  platform: process.platform,

  // return true because it is using electron if the code reaches here
  isElectron: true,

  // Print function
  print: async (filePath: string, printerName?: string) => {
    try {
      // send print command to main process with file path
      const result = await ipcRenderer.invoke(
        "print-window",
        filePath,
        printerName,
      );
      return result;
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Print Failed because of unknown error",
      };
    }
  },

  // Save photo file function
  savePhotoFile: async (base64Data: string, fileName: string) => {
    try {
      const result = await ipcRenderer.invoke(
        "save-photo-file",
        base64Data,
        fileName,
      );
      return result;
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to save photo file",
      };
    }
  },

  // Database functions
  db: {
    savePhotoResult: async (document: unknown) => {
      try {
        const result = await ipcRenderer.invoke(
          "db-save-photo-result",
          document,
        );
        return result;
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to save photo result",
        };
      }
    },
    getAllPhotoResults: async () => {
      try {
        const result = await ipcRenderer.invoke("db-get-all-photo-results");
        return result;
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to get photo results",
          data: [],
        };
      }
    },
    getPhotoResultById: async (id: string) => {
      try {
        const result = await ipcRenderer.invoke(
          "db-get-photo-result-by-id",
          id,
        );
        return result;
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to get photo result",
          data: null,
        };
      }
    },
  },
  // Kiosk config
  getKioskConfig: () => ipcRenderer.invoke("get-kiosk-config"),

  // Navigation listener
  onNavigateToHome: (callback: () => void) => {
    ipcRenderer.on("navigate-to-home", callback);
    return () => {
      ipcRenderer.removeListener("navigate-to-home", callback);
    };
  },
  onNavigateToData: (callback: () => void) => {
    ipcRenderer.on("navigate-to-data", callback);
    return () => {
      ipcRenderer.removeListener("navigate-to-data", callback);
    };
  },
});
