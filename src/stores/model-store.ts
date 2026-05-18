import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { ProfileInfo } from "#/api/profiles-service/profiles-service.api";

export interface ModelListEntry {
  id: string;
  /**
   * Id of the chat event after which this entry should render, or `null` to
   * pin it to the top of the chat history (no rendered events at the time
   * of /model).
   */
  anchorEventId: string | null;
  profiles: ProfileInfo[];
  switchedTo?: string;
}

interface ModelState {
  entriesByConversation: Record<string, ModelListEntry[]>;
  /**
   * Most-recently-switched profile name per conversation. Updated by
   * `recordSwitch` so the UI (button label, popover check mark) reflects the
   * new selection instantly, before the conversation refetch from the agent
   * server lands.
   */
  activeProfileByConversation: Record<string, string>;
}

interface ModelActions {
  show: (
    conversationId: string,
    anchorEventId: string | null,
    profiles: ProfileInfo[],
  ) => void;
  recordSwitch: (
    conversationId: string,
    anchorEventId: string | null,
    profileName: string,
  ) => void;
  /** Drops only the optimistic active-profile entry for a conversation. */
  clearActiveProfile: (conversationId: string) => void;
  clear: (conversationId: string) => void;
  clearAll: () => void;
}

type ModelStore = ModelState & ModelActions;

const appendEntry = (
  state: ModelState,
  conversationId: string,
  entry: ModelListEntry,
): Pick<ModelState, "entriesByConversation"> => ({
  entriesByConversation: {
    ...state.entriesByConversation,
    [conversationId]: [
      ...(state.entriesByConversation[conversationId] ?? []),
      entry,
    ],
  },
});

export const useModelStore = create<ModelStore>()(
  devtools(
    (set) => ({
      entriesByConversation: {},
      activeProfileByConversation: {},
      show: (conversationId, anchorEventId, profiles) =>
        set((s) =>
          appendEntry(s, conversationId, {
            id: uuidv4(),
            anchorEventId,
            profiles,
          }),
        ),
      recordSwitch: (conversationId, anchorEventId, profileName) =>
        set((s) => ({
          ...appendEntry(s, conversationId, {
            id: uuidv4(),
            anchorEventId,
            profiles: [],
            switchedTo: profileName,
          }),
          activeProfileByConversation: {
            ...s.activeProfileByConversation,
            [conversationId]: profileName,
          },
        })),
      clearActiveProfile: (conversationId) =>
        set((s) => {
          if (!(conversationId in s.activeProfileByConversation)) return s;
          const activeProfileByConversation = {
            ...s.activeProfileByConversation,
          };
          delete activeProfileByConversation[conversationId];
          return { activeProfileByConversation };
        }),
      clear: (conversationId) =>
        set((s) => {
          const entriesByConversation = { ...s.entriesByConversation };
          delete entriesByConversation[conversationId];
          const activeProfileByConversation = {
            ...s.activeProfileByConversation,
          };
          delete activeProfileByConversation[conversationId];
          return { entriesByConversation, activeProfileByConversation };
        }),
      clearAll: () =>
        set({ entriesByConversation: {}, activeProfileByConversation: {} }),
    }),
    { name: "ModelStore" },
  ),
);
