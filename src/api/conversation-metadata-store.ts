import { Provider } from "#/types/settings";

/**
 * @deprecated Replaced by agent-server `tags` on each conversation
 * (see `AGENT_CANVAS_METADATA_TAG_KEYS` in `agent-server-adapter.ts` and
 * the conversation-tag SDK PR #3621). This module is kept only to:
 *
 * 1. Allow `toAppConversation` to read legacy values as a fallback when
 *    the server has not yet been migrated.
 * 2. Allow `conversation-metadata-migration.ts` to lazily push legacy
 *    values onto server tags and then clear the localStorage entry.
 *
 * Do NOT add new readers or writers. New per-conversation metadata
 * belongs in server tags via `mergeMetadataIntoTags`. Once an upgrade
 * cycle has passed and the localStorage blob is unlikely to still exist
 * on user machines, this whole module can be deleted along with the
 * fallback branches in `toAppConversation` and the migration helper.
 */
const STORAGE_KEY = "openhands-agent-server-conversation-metadata";

export interface ConversationMetadata {
  selected_repository: string | null;
  selected_branch: string | null;
  git_provider: Provider | null;
  /**
   * The local workspace path the user explicitly attached at conversation
   * creation time. Distinct from `selected_repository` (which is set by
   * the repo picker on the home page). Used by the Files tab to decide
   * whether to default to diff view: if the user attached *anything*
   * (repo or local workspace), we lean diff-first because there's a real
   * git baseline to compare against.
   */
  selected_workspace?: string | null;
  /**
   * The LLM profile the conversation was created with (or last switched to).
   * Client-side only. Lets the chat-header switcher show the exact profile
   * name even when several profiles share the same underlying model — the
   * agent-server only round-trips the model string, so matching on it alone
   * is ambiguous (issue #1082).
   */
  active_profile?: string | null;
}

type StoredMetadata = Record<string, ConversationMetadata>;

const readAll = (): StoredMetadata => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredMetadata;
  } catch {
    return {};
  }
};

const writeAll = (next: StoredMetadata): void => {
  if (typeof window === "undefined") return;
  if (Object.keys(next).length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

export const getStoredConversationMetadata = (
  conversationId: string,
): ConversationMetadata | null => readAll()[conversationId] ?? null;

export const setStoredConversationMetadata = (
  conversationId: string,
  metadata: ConversationMetadata,
): void => {
  const all = readAll();
  all[conversationId] = metadata;
  writeAll(all);
};

export const removeStoredConversationMetadata = (
  conversationId: string,
): void => {
  const all = readAll();
  if (!(conversationId in all)) return;
  delete all[conversationId];
  writeAll(all);
};
