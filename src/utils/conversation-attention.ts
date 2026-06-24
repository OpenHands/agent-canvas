import { ExecutionStatus } from "#/types/agent-server/core/base/common";

/**
 * Cross-conversation "needs attention" derivation.
 *
 * The conversation list is polled every 10s (see `usePaginatedConversations`),
 * but today only the *open* conversation surfaces sound/title signals — any
 * background or parallel agent that goes blocked / needs-input / done is
 * silent. This module turns the polled list into two things:
 *
 *   - one-shot interrupt events for conversations that just *transitioned*
 *     into an attention state (drives sound + OS notifications), and
 *   - a persistent count of conversations still awaiting the user (drives the
 *     tab-title `(N)` prefix + the app badge).
 *
 * It is intentionally pure (no React, no DOM) so the classification and
 * transition logic is unit-tested without mounting anything.
 */

/** The kinds of attention a conversation can demand. */
export type AttentionKind = "blocked" | "needs_input" | "done";

/** Minimal shape this module needs from a conversation list item. */
export interface AttentionConversation {
  id: string;
  title: string | null;
  execution_status: ExecutionStatus | null;
}

/** A conversation that just entered an attention state — fired once per transition. */
export interface AttentionEvent {
  id: string;
  title: string | null;
  kind: AttentionKind;
}

export interface AttentionDiff {
  /** One-shot notifications for conversations that just transitioned in. */
  events: AttentionEvent[];
  /**
   * Snapshot of current statuses keyed by id, to feed back as `previous` on
   * the next diff. Only ids present in this poll are carried forward.
   */
  next: Map<string, ExecutionStatus | null>;
  /**
   * How many conversations are *persistently* awaiting the user right now
   * (blocked + needs-input), excluding the active one. "done" is transient and
   * excluded so a finished agent doesn't keep the badge lit forever.
   */
  pendingCount: number;
}

export interface AttentionDiffInput {
  /** Statuses seen on the previous poll (empty on first run). */
  previous: Map<string, ExecutionStatus | null>;
  conversations: readonly AttentionConversation[];
  /** The conversation the user is currently viewing — never notified about. */
  activeConversationId: string | null;
}

export const ConversationAttention = {
  /**
   * The attention kind a status represents, or null when it needs nothing
   * from the user (idle / running / paused).
   */
  notifyKind(status: ExecutionStatus | null | undefined): AttentionKind | null {
    switch (status) {
      case ExecutionStatus.ERROR:
      case ExecutionStatus.STUCK:
        return "blocked";
      case ExecutionStatus.WAITING_FOR_CONFIRMATION:
        return "needs_input";
      case ExecutionStatus.FINISHED:
        return "done";
      default:
        return null;
    }
  },

  /**
   * Whether a status keeps a conversation in the "awaiting you" count. "done"
   * resolves on its own (the agent stopped), so it fires a one-shot
   * notification but is not counted; blocked / needs-input persist until the
   * user acts.
   */
  isPending(status: ExecutionStatus | null | undefined): boolean {
    const kind = ConversationAttention.notifyKind(status);
    return kind === "blocked" || kind === "needs_input";
  },

  diff(input: AttentionDiffInput): AttentionDiff {
    const { previous, conversations, activeConversationId } = input;
    const events: AttentionEvent[] = [];
    const next = new Map<string, ExecutionStatus | null>();
    let pendingCount = 0;

    for (const conv of conversations) {
      const status = conv.execution_status ?? null;
      next.set(conv.id, status);

      const isActive = conv.id === activeConversationId;
      if (!isActive && ConversationAttention.isPending(status)) {
        pendingCount += 1;
      }

      // The open conversation has its own in-view notifier; never double-fire,
      // and don't interrupt the user about what they're already looking at.
      if (isActive) continue;

      // First sighting: seed the status but don't notify. Otherwise opening a
      // tab would fire a burst for sessions that finished/errored before now.
      if (!previous.has(conv.id)) continue;

      if (previous.get(conv.id) === status) continue;

      const kind = ConversationAttention.notifyKind(status);
      if (kind === null) continue;

      events.push({ id: conv.id, title: conv.title, kind });
    }

    return { events, next, pendingCount };
  },
} as const;
