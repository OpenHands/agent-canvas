import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";

const PREVIEW_SEEDED_KEY = "oh-pending-chat-preview-seeded";

const PREVIEW_SENDING_TEXT = "can you review the readme";

const PREVIEW_ERROR_TEXT =
  "here's a long message. here's a long message. here's a long message. " +
  "here's a long message. here's a long message. here's a long message.";

export function seedPendingChatPreview(conversationId: string): void {
  const store = useOptimisticUserMessageStore.getState();
  store.clearPendingMessages();

  store.enqueuePendingMessage({
    conversationId,
    text: PREVIEW_SENDING_TEXT,
  });

  const errorId = store.enqueuePendingMessage({
    conversationId,
    text: PREVIEW_ERROR_TEXT,
  });
  store.markPendingMessageError(errorId, "Failed to send message");
}

export function installPendingChatPreview(): void {
  (
    window as Window &
      typeof globalThis & {
        __OH_SEED_PENDING_PREVIEW__?: typeof seedPendingChatPreview;
        __OH_CLEAR_PENDING_PREVIEW__?: () => void;
      }
  ).__OH_SEED_PENDING_PREVIEW__ = seedPendingChatPreview;
  (
    window as Window &
      typeof globalThis & {
        __OH_CLEAR_PENDING_PREVIEW__?: () => void;
      }
  ).__OH_CLEAR_PENDING_PREVIEW__ = () => {
    sessionStorage.removeItem(PREVIEW_SEEDED_KEY);
    useOptimisticUserMessageStore.getState().clearPendingMessages();
  };

  const params = new URLSearchParams(window.location.search);
  const preview = params.get("previewPendingChat");
  if (!preview) {
    return;
  }

  const conversationId = preview === "true" ? "1" : preview;
  const targetPath = `/conversations/${conversationId}`;

  if (!window.location.pathname.startsWith(targetPath)) {
    window.location.assign(
      `${targetPath}?previewPendingChat=${encodeURIComponent(conversationId)}`,
    );
    return;
  }

  seedPendingChatPreview(conversationId);
}
