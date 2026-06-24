import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Source provenance for a conversation, derived from server-stamped tags on
 * Hermes/API-created sessions. Absent for sessions started directly in Canvas.
 */
export interface ConversationSource {
  /** Originating system, e.g. ``"hermes"``. */
  origin?: string;
  /** Linear issue identifier, e.g. ``"ENG-123"``. */
  linear?: string;
  /** Human who requested the work, e.g. ``"raimonds"``. */
  requester?: string;
  /** Canonical link back to the source (Linear issue, Slack thread, …). */
  url?: string;
}

const ORIGIN_TAG_KEYS = ["source", "origin"] as const;
const URL_TAG_KEYS = ["sourceurl", "source_url", "url"] as const;

function pickTag(
  tags: AppConversation["tags"],
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = tags?.[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export const ConversationSource = {
  fromTags(tags: AppConversation["tags"]): ConversationSource | null {
    const origin = pickTag(tags, ORIGIN_TAG_KEYS);
    const linear = pickTag(tags, ["linear"]);
    const requester = pickTag(tags, ["requester"]);
    const url = pickTag(tags, URL_TAG_KEYS);

    if (!origin && !linear && !requester) {
      return null;
    }

    return { origin, linear, requester, url };
  },
} as const;
