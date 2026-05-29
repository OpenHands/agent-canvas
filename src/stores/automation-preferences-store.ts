import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * User display preferences for the automations feature. Persisted to
 * localStorage (same `zustand/persist` pattern as the other preference
 * stores) so dismissals survive reloads.
 */
interface AutomationPreferencesState {
  /**
   * When true, the GitHub/Slack responder deployment-choice modal is skipped
   * and selecting a responder proceeds straight to local setup. Set via the
   * modal's "Don't show this again" checkbox (issue #868).
   */
  hideResponderDeploymentChoice: boolean;
}

interface AutomationPreferencesActions {
  setHideResponderDeploymentChoice: (value: boolean) => void;
}

type AutomationPreferencesStore = AutomationPreferencesState &
  AutomationPreferencesActions;

const initialState: AutomationPreferencesState = {
  hideResponderDeploymentChoice: false,
};

export const useAutomationPreferencesStore =
  create<AutomationPreferencesStore>()(
    persist(
      (set) => ({
        ...initialState,
        setHideResponderDeploymentChoice: (value) =>
          set(() => ({ hideResponderDeploymentChoice: value })),
      }),
      {
        name: "automation-preferences",
        storage: createJSONStorage(() => localStorage),
        partialize: (state): AutomationPreferencesState => ({
          hideResponderDeploymentChoice: state.hideResponderDeploymentChoice,
        }),
      },
    ),
  );
