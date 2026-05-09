import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { LocalWorkspace, LocalWorkspaceParent } from "#/types/workspace";

interface WorkspacesState {
  workspaces: LocalWorkspace[];
  workspaceParents: LocalWorkspaceParent[];
}

interface WorkspacesActions {
  addWorkspaces: (items: LocalWorkspace[]) => void;
  removeWorkspace: (path: string) => void;
  clearWorkspaces: () => void;
  addWorkspaceParents: (items: LocalWorkspaceParent[]) => void;
  removeWorkspaceParent: (path: string) => void;
  clearWorkspaceParents: () => void;
  clearAll: () => void;
}

type WorkspacesStore = WorkspacesState & WorkspacesActions;

const initialState: WorkspacesState = {
  workspaces: [],
  workspaceParents: [],
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

      addWorkspaceParents: (items: LocalWorkspaceParent[]) =>
        set((state) => {
          const existingPaths = new Set(
            state.workspaceParents.map((p) => p.path),
          );
          const newOnes = items.filter((item) => !existingPaths.has(item.path));
          if (newOnes.length === 0) return state;
          return {
            workspaceParents: [...state.workspaceParents, ...newOnes],
          };
        }),

      removeWorkspaceParent: (path: string) =>
        set((state) => ({
          workspaceParents: state.workspaceParents.filter(
            (p) => p.path !== path,
          ),
        })),

      clearWorkspaceParents: () => set(() => ({ workspaceParents: [] })),

      clearAll: () => set(() => ({ workspaces: [], workspaceParents: [] })),
    }),
    {
      name: "workspaces-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
