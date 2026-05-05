import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { LocalWorkspace } from "#/types/workspace";

interface WorkspacesState {
  workspaces: LocalWorkspace[];
}

interface WorkspacesActions {
  addWorkspaces: (items: LocalWorkspace[]) => void;
  removeWorkspace: (path: string) => void;
  clearWorkspaces: () => void;
}

type WorkspacesStore = WorkspacesState & WorkspacesActions;

const initialState: WorkspacesState = {
  workspaces: [],
};

export const useWorkspacesStore = create<WorkspacesStore>()(
  persist(
    (set) => ({
      ...initialState,

      addWorkspaces: (items: LocalWorkspace[]) =>
        set((state) => {
          const existingPaths = new Set(state.workspaces.map((w) => w.path));
          const newOnes = items.filter((item) => !existingPaths.has(item.path));
          if (newOnes.length === 0) return state;
          return { workspaces: [...state.workspaces, ...newOnes] };
        }),

      removeWorkspace: (path: string) =>
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.path !== path),
        })),

      clearWorkspaces: () => set(() => ({ workspaces: [] })),
    }),
    {
      name: "workspaces-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
