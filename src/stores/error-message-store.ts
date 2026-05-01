import { create, createStore, type StateCreator, type StoreApi } from "zustand";

export interface ErrorMessageState {
  errorMessage: string | null;
}

export interface ErrorMessageActions {
  setErrorMessage: (message: string) => void;
  removeErrorMessage: () => void;
}

export type ErrorMessageStore = ErrorMessageState & ErrorMessageActions;
export type ErrorMessageStoreApi = StoreApi<ErrorMessageStore>;

const initialState: ErrorMessageState = {
  errorMessage: null,
};

const createErrorMessageState: StateCreator<ErrorMessageStore> = (set) => ({
  ...initialState,

  setErrorMessage: (message: string) =>
    set(() => ({
      errorMessage: message,
    })),

  removeErrorMessage: () =>
    set(() => ({
      errorMessage: null,
    })),
});

export const createErrorMessageStore = (): ErrorMessageStoreApi =>
  createStore<ErrorMessageStore>()(createErrorMessageState);

export const useErrorMessageStore = create<ErrorMessageStore>()(
  createErrorMessageState,
);
