import { create } from "zustand";

interface WorkToolRequestStore {
  dismissedEventIds: string[];
  dismissEvent: (eventId: string) => void;
  reset: () => void;
}

export const useWorkToolRequestStore = create<WorkToolRequestStore>((set) => ({
  dismissedEventIds: [],
  dismissEvent: (eventId) =>
    set((state) => ({
      dismissedEventIds: state.dismissedEventIds.includes(eventId)
        ? state.dismissedEventIds
        : [...state.dismissedEventIds, eventId],
    })),
  reset: () => set({ dismissedEventIds: [] }),
}));
