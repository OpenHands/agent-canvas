import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Client-side conversation search — the firehose "find my work amid the noise"
 * filter. Matches over the fields a user would scan for (title, repo, branch,
 * owner) with AND-tokenized, case-insensitive matching so `"canvas search"`
 * narrows to conversations mentioning both.
 *
 * Scoped to already-loaded pages (a tracer-bullet): the agent-server search
 * endpoint takes no query param, so true server-side search is a follow-up.
 * Pure (no React) so the matcher is unit-tested directly.
 */

type SearchableConversation = Pick<
  AppConversation,
  "title" | "selected_repository" | "selected_branch" | "owner"
>;

export const ConversationSearch = {
  matches(conversation: SearchableConversation, query: string): boolean {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    const haystack = [
      conversation.title,
      conversation.selected_repository,
      conversation.selected_branch,
      conversation.owner,
    ]
      .filter((field): field is string => Boolean(field))
      .join(" ")
      .toLowerCase();
    return normalized.split(/\s+/).every((term) => haystack.includes(term));
  },

  filter<T extends SearchableConversation>(
    conversations: readonly T[],
    query: string,
  ): T[] {
    if (!query.trim()) return [...conversations];
    return conversations.filter((conversation) =>
      ConversationSearch.matches(conversation, query),
    );
  },
} as const;
