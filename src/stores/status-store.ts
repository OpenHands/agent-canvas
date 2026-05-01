import { create, createStore, type StateCreator, type StoreApi } from "zustand";
import { StatusMessage } from "#/types/message";

const initialStatusMessage: StatusMessage = {
  status_update: true,
  type: "info",
  id: "",
  message: "",
};

export interface StatusState {
  curStatusMessage: StatusMessage;
  setCurStatusMessage: (message: StatusMessage) => void;
}

export type StatusStoreApi = StoreApi<StatusState>;

const createStatusState: StateCreator<StatusState> = (set) => ({
  curStatusMessage: initialStatusMessage,
  setCurStatusMessage: (message: StatusMessage) =>
    set({ curStatusMessage: message }),
});

export const createStatusStore = (): StatusStoreApi =>
  createStore<StatusState>()(createStatusState);

export const useStatusStore = create<StatusState>()(createStatusState);
