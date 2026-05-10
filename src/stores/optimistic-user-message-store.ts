import { create } from "zustand";

export type PendingUserMessageStatus = "sending" | "error";

export interface PendingUserMessage {
  id: string;
  /**
   * The conversation this pending message belongs to. The chat UI filters the
   * global queue by the active conversation id so messages enqueued in one
   * conversation never leak into another when the user switches.
   */
  conversationId: string;
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
  conversationId: string;
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
   * Remove the oldest pending message in "sending" state for the given
   * conversation. Called when the WebSocket echoes back a real
   * `UserMessageEvent` for that conversation. Scoping by `conversationId`
   * ensures a stale ack for one conversation never pops a pending entry
   * belonging to another.
   */
  consumeOldestSendingMessage: (
    conversationId: string,
  ) => PendingUserMessage | null;
  /** Wipe all queued messages (e.g., when changing conversations). */
  clearPendingMessages: () => void;
}

type OptimisticUserMessageStore = OptimisticUserMessageState &
  OptimisticUserMessageActions;

const initialState: OptimisticUserMessageState = {
  pendingMessages: [],
};

// Use a timestamp + random suffix instead of a module-level counter so ids
// stay unique across test resets and don't accumulate state between runs.
// `crypto.randomUUID` would be ideal but isn't available in older test
// environments, so a base36 random suffix is a safe lowest-common-denominator.
const generatePendingId = (): string =>
  `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const useOptimisticUserMessageStore = create<OptimisticUserMessageStore>(
  (set) => ({
    ...initialState,

    enqueuePendingMessage: (payload) => {
      const id = generatePendingId();
      const message: PendingUserMessage = {
        id,
        conversationId: payload.conversationId,
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

    consumeOldestSendingMessage: (conversationId) => {
      // Atomic find + remove in a single `set` so we can't race against
      // another action mutating the queue between the read and the write.
      // The WebSocket transport for a given conversation is sequential, so
      // FIFO consumption matches the order in which the server echoes user
      // messages back; scoping by `conversationId` keeps cross-conversation
      // echoes from popping the wrong bubble.
      let consumed: PendingUserMessage | null = null;
      set((state) => {
        const idx = state.pendingMessages.findIndex(
          (message) =>
            message.status === "sending" &&
            message.conversationId === conversationId,
        );
        if (idx === -1) return state;
        consumed = state.pendingMessages[idx];
        return {
          pendingMessages: [
            ...state.pendingMessages.slice(0, idx),
            ...state.pendingMessages.slice(idx + 1),
          ],
        };
      });
      return consumed;
    },

    clearPendingMessages: () => set(() => ({ ...initialState })),
  }),
);
