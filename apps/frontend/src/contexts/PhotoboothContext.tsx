import type { ReactNode } from "react";
import React, { createContext, useContext, useState } from "react";

export type RacingTheme = "pitcrew" | "motogp" | "f1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EVENT_ID: string | null = (import.meta as any).env?.VITE_EVENT_ID ?? null;

export const RACING_THEMES: Record<
  RacingTheme,
  {
    title: string;
    description: string;
  }
> = {
  motogp: {
    title: "MotoGP Rider",
    description: "Feel the speed on two wheels",
  },
  f1: {
    title: "F1 Driver",
    description: "Experience Formula 1 glory",
  },
  pitcrew: {
    title: "Race Engineer",
    description: "Join the elite racing support team",
  },
};

interface ThemeSelection {
  theme: RacingTheme;
}

interface UserInfo {
  name: string;
  email: string;
  phone: string;
}

interface PhotoboothContextType {
  eventId: string | null;
  finalPhoto: string | null;
  selectedTheme: ThemeSelection | null;
  originalPhotos: string[];
  userInfo: UserInfo | null;
  setFinalPhoto: (photo: string | null) => void;
  setSelectedTheme: (theme: ThemeSelection | null) => void;
  setOriginalPhotos: (photos: string[]) => void;
  setUserInfo: (userInfo: UserInfo | null) => void;
  reset: () => void;
}

const PhotoboothContext = createContext<PhotoboothContextType | undefined>(
  undefined,
);

export function PhotoboothProvider({ children }: { children: ReactNode }) {
  const [finalPhoto, setFinalPhoto] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ThemeSelection | null>(
    null,
  );
  const [originalPhotos, setOriginalPhotos] = useState<string[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const reset = () => {
    setFinalPhoto(null);
    setSelectedTheme(null);
    setOriginalPhotos([]);
    setUserInfo(null);
  };

  return (
    <PhotoboothContext.Provider
      value={{
        eventId: EVENT_ID,
        originalPhotos,
        finalPhoto,
        selectedTheme,
        userInfo,
        setOriginalPhotos,
        setFinalPhoto,
        setSelectedTheme,
        setUserInfo,
        reset,
      }}
    >
      {children}
    </PhotoboothContext.Provider>
  );
}

export function usePhotobooth() {
  const context = useContext(PhotoboothContext);
  if (context === undefined) {
    throw new Error("usePhotobooth must be used within a PhotoboothProvider");
  }
  return context;
}
