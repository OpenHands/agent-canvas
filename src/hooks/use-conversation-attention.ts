import { useEffect, useRef } from "react";
import i18n from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import { useNavigation } from "#/context/navigation-context";
import { useSettings } from "#/hooks/query/use-settings";
import { useAttentionStore } from "#/stores/attention-store";
import { useMutedConversationsStore } from "#/stores/muted-conversations-store";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  ConversationAttention,
  type AttentionEvent,
  type AttentionKind,
} from "#/utils/conversation-attention";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import notificationSound from "#/assets/notification.mp3";

const EMPTY_MUTED_IDS: readonly string[] = [];

// Reuse existing, fully-translated status labels so this adds no new i18n keys
// (the repo enforces translation completeness across 15 languages).
const KIND_LABEL: Record<AttentionKind, I18nKey> = {
  blocked: I18nKey.AGENT_STATUS$ERROR_OCCURRED,
  needs_input: I18nKey.AGENT_STATUS$WAITING_FOR_USER_CONFIRMATION,
  done: I18nKey.CHAT_INTERFACE$AGENT_FINISHED_MESSAGE,
};

const KIND_EMOJI: Record<AttentionKind, string> = {
  blocked: "🔴",
  needs_input: "⚠️",
  done: "✅",
};

// The Badging API isn't in every lib.dom version. A struct of optional members
// accepts any Navigator structurally — no type assertion needed.
interface BadgingNavigator {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

function applyAppBadge(pendingCount: number) {
  if (typeof navigator === "undefined") return;
  const nav: BadgingNavigator = navigator;
  if (pendingCount > 0) {
    nav.setAppBadge?.(pendingCount)?.catch(() => {});
  } else {
    nav.clearAppBadge?.()?.catch(() => {});
  }
}

function fireNotifications(
  events: AttentionEvent[],
  navigate: (to: string) => void,
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "denied") return;
  if (Notification.permission === "default") {
    // Ask once; this round is skipped, later transitions will fire once granted.
    Notification.requestPermission().catch(() => {});
    return;
  }

  events.forEach((event) => {
    const label = i18n.t(KIND_LABEL[event.kind]);
    const title = `${KIND_EMOJI[event.kind]} ${event.title?.trim() || label}`;
    const notification = new Notification(title, {
      body: label,
      tag: event.id, // collapse repeat alerts for the same conversation
    });
    notification.onclick = () => {
      window.focus();
      navigate(`/conversations/${event.id}`);
      notification.close();
    };
  });
}

/**
 * Watches the polled conversation list and surfaces cross-conversation
 * attention: a tab-title `(N)` count + app badge (always on, passive) and an
 * interrupt tier — sound + OS notification — for background conversations that
 * transition into blocked / needs-input / done. The open conversation is
 * excluded (it has its own in-view notifier via `useAgentNotification`).
 *
 * Must be mounted inside `ReactRouterNavigationProvider` so `useNavigation()`
 * resolves the active conversation id and a working `navigate`.
 */
export function useConversationAttention() {
  const { data } = usePaginatedConversations();
  const { conversationId, navigate } = useNavigation();
  const { data: settings } = useSettings();
  const setPendingCount = useAttentionStore((state) => state.setPendingCount);
  const { backend } = useActiveBackend();
  const mutedIds = useMutedConversationsStore(
    (state) => state.mutedByBackendId[backend.id] ?? EMPTY_MUTED_IDS,
  );

  const previousRef = useRef<Map<string, ExecutionStatus | null>>(new Map());
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);

  const isSoundEnabled = settings?.enable_sound_notifications ?? false;

  useEffect(() => {
    if (typeof window !== "undefined" && !audioRef.current) {
      audioRef.current = new Audio(notificationSound);
      audioRef.current.volume = 0.5;
    }
  }, []);

  useEffect(() => {
    const conversations = (data?.pages ?? []).flatMap((page) => page.items);

    const { events, next, pendingCount } = ConversationAttention.diff({
      previous: previousRef.current,
      conversations,
      activeConversationId: conversationId,
      mutedIds: new Set(mutedIds),
    });
    previousRef.current = next;

    // Badge + title count are always-on, passive awareness (no permission,
    // no setting) — the heart of taming the firehose.
    if (pendingCount !== useAttentionStore.getState().pendingCount) {
      setPendingCount(pendingCount);
    }
    applyAppBadge(pendingCount);

    if (events.length === 0) return;

    // Sound + OS notification are the interrupt tier, gated by the existing
    // notification setting (and, for OS notifications, browser permission).
    if (!isSoundEnabled) return;

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
    fireNotifications(events, navigate);
  }, [
    data,
    conversationId,
    isSoundEnabled,
    setPendingCount,
    navigate,
    mutedIds,
  ]);
}
