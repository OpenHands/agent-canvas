import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Owner/source scoping for the conversation list — the "mine vs all" + source
 * facets that make a shared, visible-by-default control plane personally
 * usable. Pure (no React/DOM) so the predicates are unit-tested directly.
 *
 * Ownership here is advisory (the local backend has no enforced per-user
 * identity — see `firehose-plan.md`); it organizes the list, it does not hide
 * anything. `owner`/`source` are surfaced from the conversation tags map in
 * `toAppConversation`.
 */

/** Which conversations to show by owner. */
export type OwnerScope = "all" | "mine";

/** Which conversations to show by launch source. */
export type SourceScope = "all" | "hermes" | "app";

type OwnedConversation = Pick<AppConversation, "owner" | "source">;

export const ConversationOwnership = {
  /** Hermes-launched sessions carry `source: "hermes"`. Everything else is "app". */
  isHermes(conversation: OwnedConversation): boolean {
    return (conversation.source ?? "").toLowerCase() === "hermes";
  },

  ownerOf(conversation: OwnedConversation): string | null {
    return conversation.owner?.trim() || null;
  },

  /** Case-insensitive owner match; false when either side is empty/unknown. */
  matchesOwner(
    conversation: OwnedConversation,
    email: string | null | undefined,
  ): boolean {
    const target = email?.trim().toLowerCase();
    if (!target) return false;
    const owner = ConversationOwnership.ownerOf(conversation);
    return owner?.toLowerCase() === target;
  },

  matchesSourceScope(
    conversation: OwnedConversation,
    scope: SourceScope,
  ): boolean {
    switch (scope) {
      case "hermes":
        return ConversationOwnership.isHermes(conversation);
      case "app":
        return !ConversationOwnership.isHermes(conversation);
      case "all":
      default:
        return true;
    }
  },

  filter<T extends OwnedConversation>(
    conversations: readonly T[],
    options: {
      ownerScope: OwnerScope;
      sourceScope: SourceScope;
      currentUserEmail: string | null;
    },
  ): T[] {
    const { ownerScope, sourceScope, currentUserEmail } = options;
    return conversations.filter((conversation) => {
      if (
        !ConversationOwnership.matchesSourceScope(conversation, sourceScope)
      ) {
        return false;
      }
      if (
        ownerScope === "mine" &&
        !ConversationOwnership.matchesOwner(conversation, currentUserEmail)
      ) {
        return false;
      }
      return true;
    });
  },
} as const;
