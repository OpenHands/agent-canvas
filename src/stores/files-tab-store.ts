import { create } from "zustand";

interface FilesTabState {
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
}

// Hoisted out of files-tab.tsx local state so non-React callers (e.g. the
// canvas_ui tool dispatcher in the WebSocket context) can drive selection.
export const useFilesTabStore = create<FilesTabState>((set) => ({
  selectedPath: null,
  setSelectedPath: (selectedPath) => set({ selectedPath }),
}));
