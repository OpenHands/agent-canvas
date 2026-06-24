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

/** Which conversations to show by project: all, or a single project slug. */
export type ProjectScope = "all" | { slug: string };

type OwnedConversation = Pick<AppConversation, "owner" | "source" | "project">;

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

  projectOf(conversation: OwnedConversation): string | null {
    return conversation.project?.trim() || null;
  },

  /** "all" matches everything; a `{slug}` scope matches only that project. */
  matchesProjectScope(
    conversation: OwnedConversation,
    scope: ProjectScope,
  ): boolean {
    if (scope === "all") return true;
    const project = ConversationOwnership.projectOf(conversation);
    return project?.toLowerCase() === scope.slug.trim().toLowerCase();
  },

  filter<T extends OwnedConversation>(
    conversations: readonly T[],
    options: {
      ownerScope: OwnerScope;
      sourceScope: SourceScope;
      currentUserEmail: string | null;
      // Optional so existing callers compile unchanged; defaults to "all".
      projectScope?: ProjectScope;
    },
  ): T[] {
    const {
      ownerScope,
      sourceScope,
      currentUserEmail,
      projectScope = "all",
    } = options;
    return conversations.filter((conversation) => {
      if (
        !ConversationOwnership.matchesProjectScope(conversation, projectScope)
      ) {
        return false;
      }
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
