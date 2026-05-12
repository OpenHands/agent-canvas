import { create } from "zustand";

/**
 * Monotonic counter that ticks every time the agent commits a file-editor
 * mutation in the workspace. The file-content query includes this counter in
 * its query key, so the selected file is refetched after each edit even when
 * the selected path has not changed.
 *
 * Consumers:
 *   - {@link useAutoRefreshFilesOnEdit} bumps this on each mutation event.
 *   - {@link useWorkspaceFileContent} reads the count and refreshes its Blob
 *     preview URL and decoded text.
 */
interface WorkspaceMutationCounterState {
  count: number;
  bump: () => void;
}

export const useWorkspaceMutationCounter =
  create<WorkspaceMutationCounterState>((set) => ({
    count: 0,
    bump: () => set((state) => ({ count: state.count + 1 })),
  }));
