import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { GitRepository } from "#/types/git";
import { Provider } from "#/types/settings";

interface HomeState {
  recentRepositories: GitRepository[];
  lastSelectedProvider: Provider | null;
  recentBranches: Record<string, string>; // repository full_name -> branch name
}

interface HomeActions {
  addRecentRepository: (repository: GitRepository) => void;
  clearRecentRepositories: () => void;
  getRecentRepositories: () => GitRepository[];
  setLastSelectedProvider: (provider: Provider | null) => void;
  getLastSelectedProvider: () => Provider | null;
  setRecentBranch: (repoFullName: string, branchName: string) => void;
  getRecentBranch: (repoFullName: string) => string | null;
}

type HomeStore = HomeState & HomeActions;

const initialState: HomeState = {
  recentRepositories: [],
  lastSelectedProvider: null,
  recentBranches: {},
};

export const useHomeStore = create<HomeStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      addRecentRepository: (repository: GitRepository) =>
        set((state) => {
          // Remove the repository if it already exists to avoid duplicates
          const filteredRepos = state.recentRepositories.filter(
            (repo) => repo.id !== repository.id,
          );

          // Add the new repository to the beginning and keep only top 3
          const updatedRepos = [repository, ...filteredRepos].slice(0, 3);

          return {
            recentRepositories: updatedRepos,
          };
        }),

      clearRecentRepositories: () =>
        set(() => ({
          recentRepositories: [],
          recentBranches: {},
        })),

      getRecentRepositories: () => get().recentRepositories,

      setLastSelectedProvider: (provider: Provider | null) =>
        set(() => ({
          lastSelectedProvider: provider,
        })),

      getLastSelectedProvider: () => get().lastSelectedProvider,

      setRecentBranch: (repoFullName: string, branchName: string) =>
        set((state) => ({
          recentBranches: {
            ...state.recentBranches,
            [repoFullName]: branchName,
          },
        })),

      getRecentBranch: (repoFullName: string) =>
        get().recentBranches[repoFullName] || null,
    }),
    {
      name: "home-store", // unique name for localStorage
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
