import type { RacingTheme } from "../contexts/PhotoboothContext";

export interface PhotoResultDocument {
  id: string;
  photoPath: string;
  selectedTheme: {
    theme: RacingTheme;
  };
  userInfo: {
    name: string;
    email: string;
    phone: string;
  };
  eventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function savePhotoFile(
  base64Data: string,
  fileName: string,
): Promise<string> {
  if (!window.electronAPI) {
    throw new Error("Electron API not available");
  }

  const result = await window.electronAPI.savePhotoFile(base64Data, fileName);

  if (!result.success || !result.filePath) {
    throw new Error(result.error || "Failed to save photo file");
  }

  return result.filePath;
}

export async function savePhotoResult(
  data: Omit<PhotoResultDocument, "id" | "createdAt" | "updatedAt">,
): Promise<PhotoResultDocument> {
  if (!window.electronAPI) {
    throw new Error("Electron API not available");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const document: PhotoResultDocument = {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  };

  const result = await window.electronAPI.db.savePhotoResult(document);

  if (!result.success) {
    throw new Error(result.error || "Failed to save photo result");
  }

  return document;
}

export async function getAllPhotoResults(): Promise<PhotoResultDocument[]> {
  if (!window.electronAPI) {
    throw new Error("Electron API not available");
  }

  const result = await window.electronAPI.db.getAllPhotoResults();

  if (!result.success) {
    throw new Error(result.error || "Failed to get photo results");
  }

  return result.data;
}

export async function getPhotoResultById(
  id: string,
): Promise<PhotoResultDocument | null> {
  if (!window.electronAPI) {
    throw new Error("Electron API not available");
  }

  const result = await window.electronAPI.db.getPhotoResultById(id);

  if (!result.success) {
    throw new Error(result.error || "Failed to get photo result");
  }

  return result.data;
}
