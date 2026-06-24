import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Project, type ProjectInput } from "#/utils/project";

/**
 * Per-browser registry of projects, keyed by backend id exactly like
 * `pinned-conversations-store`. A registry row gives a slug a human name (and
 * optional linked repos) that the bare `tags.project` slug can't carry; the
 * slug stays the cross-surface join key.
 *
 * Per-browser and advisory for v1 — names/repos are NOT shared across users or
 * devices (a foreign or Hermes-stamped slug still groups + filters, just shows
 * the raw slug as its label). The moment shared names/repos are needed is the
 * trigger for the v2 control-plane Project entity (see
 * `.context/research/project-scoping.md`).
 */
interface ProjectRegistryState {
  projectsByBackendId: Record<string, Project[]>;
}

interface ProjectRegistryActions {
  /**
   * Create or update a project (keyed by its derived slug). Returns the parsed
   * project, or null when the draft is invalid (blank/alphanumeric-free name).
   * An existing slug is replaced in place — re-running create with the same
   * name is how a user edits its display name / linked repos in v1.
   */
  upsertProject: (backendId: string, input: ProjectInput) => Project | null;
  removeProject: (backendId: string, slug: string) => void;
}

type ProjectRegistryStore = ProjectRegistryState & ProjectRegistryActions;

const initialState: ProjectRegistryState = {
  projectsByBackendId: {},
};

function getProjectsForBackend(
  projectsByBackendId: Record<string, Project[]>,
  backendId: string,
): Project[] {
  return projectsByBackendId[backendId] ?? [];
}

export const useProjectRegistryStore = create<ProjectRegistryStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      upsertProject: (backendId, input) => {
        const project = Project.parse(input);
        if (!project) {
          return null;
        }
        const current = getProjectsForBackend(
          get().projectsByBackendId,
          backendId,
        );
        const next = current.some((p) => p.slug === project.slug)
          ? current.map((p) => (p.slug === project.slug ? project : p))
          : [...current, project];
        set((state) => ({
          projectsByBackendId: {
            ...state.projectsByBackendId,
            [backendId]: next,
          },
        }));
        return project;
      },

      removeProject: (backendId, slug) => {
        const current = getProjectsForBackend(
          get().projectsByBackendId,
          backendId,
        );
        if (!current.some((p) => p.slug === slug)) {
          return;
        }
        set((state) => ({
          projectsByBackendId: {
            ...state.projectsByBackendId,
            [backendId]: current.filter((p) => p.slug !== slug),
          },
        }));
      },
    }),
    {
      name: "project-registry",
      storage: createJSONStorage(() => localStorage),
      partialize: (state): ProjectRegistryState => ({
        projectsByBackendId: state.projectsByBackendId,
      }),
    },
  ),
);
