import { create } from "zustand";

export type PendingUserMessageStatus = "sending" | "error";

export interface PendingUserMessage {
  id: string;
  text: string;
  status: PendingUserMessageStatus;
  imageUrls: string[];
  fileUrls: string[];
  timestamp: string;
  errorMessage?: string;
}

interface OptimisticUserMessageState {
  pendingMessages: PendingUserMessage[];
}

export interface EnqueuePendingMessagePayload {
  text: string;
  imageUrls?: string[];
  fileUrls?: string[];
  timestamp?: string;
}

interface OptimisticUserMessageActions {
  /**
   * Append a new user message to the queue with status "sending".
   * Returns the locally-generated id for later updates.
   */
  enqueuePendingMessage: (payload: EnqueuePendingMessagePayload) => string;
  /** Mark a pending message as failed (the API rejected it). */
  markPendingMessageError: (id: string, errorMessage?: string) => void;
  /** Mark a pending message as sending again (used when retrying). */
  markPendingMessageSending: (id: string) => void;
  /** Drop a pending message from the queue (e.g., after success/cancellation). */
  removePendingMessage: (id: string) => void;
  /**
   * Remove the oldest pending message that is currently in "sending" state.
   * Called when the WebSocket echoes back a real `UserMessageEvent`.
   */
  consumeOldestSendingMessage: () => PendingUserMessage | null;
  /** Wipe all queued messages (e.g., when changing conversations). */
  clearPendingMessages: () => void;
}

type OptimisticUserMessageStore = OptimisticUserMessageState &
  OptimisticUserMessageActions;

const initialState: OptimisticUserMessageState = {
  pendingMessages: [],
};

let pendingIdCounter = 0;
const generatePendingId = (): string => {
  pendingIdCounter += 1;
  return `pending-${Date.now()}-${pendingIdCounter}`;
};

export const useOptimisticUserMessageStore = create<OptimisticUserMessageStore>(
  (set, get) => ({
    ...initialState,

    enqueuePendingMessage: (payload) => {
      const id = generatePendingId();
      const message: PendingUserMessage = {
        id,
        text: payload.text,
        status: "sending",
        imageUrls: payload.imageUrls ?? [],
        fileUrls: payload.fileUrls ?? [],
        timestamp: payload.timestamp ?? new Date().toISOString(),
      };
      set((state) => ({
        pendingMessages: [...state.pendingMessages, message],
      }));
      return id;
    },

    markPendingMessageError: (id, errorMessage) =>
      set((state) => ({
        pendingMessages: state.pendingMessages.map((message) =>
          message.id === id
            ? { ...message, status: "error", errorMessage }
            : message,
        ),
      })),

    markPendingMessageSending: (id) =>
      set((state) => ({
        pendingMessages: state.pendingMessages.map((message) =>
          message.id === id
            ? { ...message, status: "sending", errorMessage: undefined }
            : message,
        ),
      })),

    removePendingMessage: (id) =>
      set((state) => ({
        pendingMessages: state.pendingMessages.filter(
          (message) => message.id !== id,
        ),
      })),

    consumeOldestSendingMessage: () => {
      const oldest = get().pendingMessages.find(
        (message) => message.status === "sending",
      );
      if (!oldest) return null;
      set((state) => ({
        pendingMessages: state.pendingMessages.filter(
          (message) => message.id !== oldest.id,
        ),
      }));
      return oldest;
    },

    clearPendingMessages: () => set(() => ({ ...initialState })),
  }),
);
