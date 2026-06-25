import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppMode } from "#/types/app-mode";

interface AppModeState {
  mode: AppMode;
}

interface AppModeActions {
  setMode: (mode: AppMode) => void;
}

type AppModeStore = AppModeState & AppModeActions;

const STORAGE_KEY = "openhands-app-mode";

export const useAppModeStore = create<AppModeStore>()(
  persist(
    (set) => ({
      mode: "code",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): AppModeState => ({ mode: state.mode }),
    },
  ),
);
