import { create } from "zustand";

/**
 * "connection" errors auto-clear once connectivity recovers; "conversation"
 * errors (e.g. a wrong API key) are sticky and clear only on an explicit user
 * action (dismiss, retry, new message).
 */
export type ErrorMessageType = "connection" | "conversation";

interface ErrorMessageState {
  errorMessage: string | null;
  errorType: ErrorMessageType | null;
}

interface ErrorMessageActions {
  setErrorMessage: (message: string, type?: ErrorMessageType) => void;
  removeErrorMessage: () => void;
  /** Clears the error only when it is a transient connection error. */
  clearConnectionError: () => void;
}

type ErrorMessageStore = ErrorMessageState & ErrorMessageActions;

const initialState: ErrorMessageState = {
  errorMessage: null,
  errorType: null,
};

export const useErrorMessageStore = create<ErrorMessageStore>((set) => ({
  ...initialState,

  setErrorMessage: (message: string, type: ErrorMessageType = "conversation") =>
    set(() => ({
      errorMessage: message,
      errorType: type,
    })),

  removeErrorMessage: () =>
    set(() => ({
      errorMessage: null,
      errorType: null,
    })),

  clearConnectionError: () =>
    set((state) =>
      state.errorType === "connection"
        ? { errorMessage: null, errorType: null }
        : state,
    ),
}));
