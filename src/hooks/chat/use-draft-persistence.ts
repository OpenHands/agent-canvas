import { useEffect, useRef, useCallback, useState } from "react";
import {
  useConversationLocalStorageState,
  getConversationState,
  setConversationState,
} from "#/utils/conversation-local-storage";
import {
  focusContentEditableAtEnd,
  getTextContent,
} from "#/components/features/chat/utils/chat-input.utils";

/**
 * Check if a conversation ID is a temporary task ID.
 * Task IDs have the format "task-{uuid}" and are used during V1 conversation initialization.
 */
const isTaskId = (id: string): boolean => id.startsWith("task-");

const DRAFT_SAVE_DEBOUNCE_MS = 500;

/**
 * Hook for persisting draft messages to localStorage.
 * Handles debounced saving on input, restoration on mount, and clearing on confirmed delivery.
 *
 * `conversationId` may be undefined when the chat input renders on the home
 * page (no conversation exists yet). In that case the hook short-circuits:
 * no localStorage reads/writes happen and the returned callbacks are no-ops.
 */
export const useDraftPersistence = (
  conversationId: string | null | undefined,
  chatInputRef: React.RefObject<HTMLDivElement | null>,
) => {
  // Pass an empty string when conversationId is missing to keep the hook
  // call unconditional (rules of hooks). The early-return branches below
  // ensure we never actually touch localStorage with an empty key.
  const { state, setDraftMessage } = useConversationLocalStorageState(
    conversationId ?? "",
  );
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredRef = useRef(false);
  const [isRestored, setIsRestored] = useState(false);

  // Track current conversationId to prevent saving draft to wrong conversation
  const currentConversationIdRef = useRef(conversationId);
  // Track if this is the first mount to handle initial cleanup
  const isFirstMountRef = useRef(true);

  // IMPORTANT: This effect must run FIRST when conversation changes.
  // It handles three concerns:
  // 1. Cleanup: Cancel pending saves from previous conversation
  // 2. Task-to-real transition: Preserve draft typed during initialization
  // 3. DOM reset: Clear stale content before restoration effect runs
  useEffect(() => {
    if (!conversationId) {
      return;
    }
    const previousConversationId = currentConversationIdRef.current;
    const isInitialMount = isFirstMountRef.current;
    currentConversationIdRef.current = conversationId;
    isFirstMountRef.current = false;

    // --- 1. Cancel pending saves from previous conversation ---
    // Prevents draft from being saved to wrong conversation if user switched quickly
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const element = chatInputRef.current;

    // --- 2. Handle task-to-real ID transition (preserve draft during initialization) ---
    // When a new V1 conversation initializes, it starts with a temporary "task-xxx" ID
    // that transitions to a real conversation ID once ready. Task IDs don't persist
    // to localStorage, so any draft typed during this phase would be lost.
    // We detect this transition and transfer the draft to the new real ID.
    if (
      !isInitialMount &&
      previousConversationId &&
      previousConversationId !== conversationId
    ) {
      const wasTaskId = isTaskId(previousConversationId);
      const isNowRealId = !isTaskId(conversationId);

      if (wasTaskId && isNowRealId && element) {
        const currentText = getTextContent(element).trim();
        if (currentText) {
          // Transfer draft to the new (real) conversation ID
          setConversationState(conversationId, { draftMessage: currentText });
          // Keep draft visible in DOM and mark as restored to prevent overwrite
          hasRestoredRef.current = true;
          setIsRestored(true);
          return; // Skip normal cleanup - draft is already in correct state
        }
      }
    }

    // --- 3. Clear stale DOM content (will be restored by next effect if draft exists) ---
    // This prevents stale drafts from appearing in new conversations due to:
    // - Browser form restoration on back/forward navigation
    // - React DOM recycling between conversation switches
    // The restoration effect will then populate with the correct saved draft
    if (element) {
      element.textContent = "";
    }

    // Reset restoration flag so the restoration effect will run for new conversation
    hasRestoredRef.current = false;
    setIsRestored(false);
  }, [conversationId, chatInputRef]);

  // Restore draft from localStorage - reads directly to avoid state sync timing issues
  useEffect(() => {
    if (!conversationId) {
      return;
    }
    if (hasRestoredRef.current) {
      return;
    }

    const element = chatInputRef.current;
    if (!element) {
      return;
    }

    // Read directly from localStorage to avoid stale state from useConversationLocalStorageState
    // The hook's state may not have synced yet after conversationId change
    const { draftMessage } = getConversationState(conversationId);

    // Only restore if there's a saved draft and the input is empty
    if (draftMessage && getTextContent(element).trim() === "") {
      element.textContent = draftMessage;
      focusContentEditableAtEnd(element);
    }

    hasRestoredRef.current = true;
    setIsRestored(true);
  }, [chatInputRef, conversationId]);

  // Debounced save function - called from onInput handler
  const saveDraft = useCallback(() => {
    if (!conversationId) {
      return;
    }
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Capture the conversationId at the time of input
    const capturedConversationId = conversationId;

    saveTimeoutRef.current = setTimeout(() => {
      // Verify we're still on the same conversation before saving
      // This prevents saving draft to wrong conversation if user switched quickly
      if (capturedConversationId !== currentConversationIdRef.current) {
        return;
      }

      const element = chatInputRef.current;
      if (!element) {
        return;
      }

      const text = getTextContent(element).trim();
      // Only save if content has changed
      if (text !== (state.draftMessage || "")) {
        setDraftMessage(text || null);
      }
    }, DRAFT_SAVE_DEBOUNCE_MS);
  }, [chatInputRef, state.draftMessage, setDraftMessage, conversationId]);

  // Clear draft - called after message delivery is confirmed
  const clearDraft = useCallback(() => {
    if (!conversationId) {
      return;
    }
    // Cancel any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setDraftMessage(null);
  }, [conversationId, setDraftMessage]);

  // Cleanup timeout on unmount
  useEffect(
    () => () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    },
    [],
  );

  return {
    saveDraft,
    clearDraft,
    isRestored,
    hasDraft: !!state.draftMessage,
  };
};
