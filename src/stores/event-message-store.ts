import { create, createStore, type StateCreator, type StoreApi } from "zustand";

export interface EventMessageState {
  submittedEventIds: number[];
  v1SubmittedEventIds: string[];
}

export interface EventMessageStore extends EventMessageState {
  addSubmittedEventId: (id: number) => void;
  removeSubmittedEventId: (id: number) => void;
  addV1SubmittedEventId: (id: string) => void;
  removeV1SubmittedEventId: (id: string) => void;
}

export type EventMessageStoreApi = StoreApi<EventMessageStore>;

const createEventMessageState: StateCreator<EventMessageStore> = (set) => ({
  submittedEventIds: [],
  v1SubmittedEventIds: [],
  addSubmittedEventId: (id: number) =>
    set((state) => ({
      submittedEventIds: [...state.submittedEventIds, id],
    })),
  removeSubmittedEventId: (id: number) =>
    set((state) => ({
      submittedEventIds: state.submittedEventIds.filter(
        (eventId) => eventId !== id,
      ),
    })),
  addV1SubmittedEventId: (id: string) =>
    set((state) => ({
      v1SubmittedEventIds: [...state.v1SubmittedEventIds, id],
    })),
  removeV1SubmittedEventId: (id: string) =>
    set((state) => ({
      v1SubmittedEventIds: state.v1SubmittedEventIds.filter(
        (eventId) => eventId !== id,
      ),
    })),
});

export const createEventMessageStore = (): EventMessageStoreApi =>
  createStore<EventMessageStore>()(createEventMessageState);

export const useEventMessageStore = create<EventMessageStore>()(
  createEventMessageState,
);
