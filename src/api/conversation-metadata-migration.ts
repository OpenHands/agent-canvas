import { ConversationClient } from "@openhands/typescript-client/clients";
import {
  AGENT_CANVAS_METADATA_TAG_KEYS,
  ConversationMetadataTags,
  mergeMetadataIntoTags,
  readMetadataFromTags,
} from "./agent-server-adapter";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import { getActiveBackend } from "./backend-registry/active-store";
import {
  getStoredConversationMetadata,
  removeStoredConversationMetadata,
} from "./conversation-metadata-store";
import type { AppConversation } from "./conversation-service/agent-server-conversation-service.types";

/**
 * One-shot lazy migration of the legacy
 * `openhands-agent-server-conversation-metadata` localStorage blob onto the
 * agent-server's `tags` field on each conversation.
 *
 * Triggered by the conversation list query (see `use-paginated-conversations`)
 * with the conversations the user just loaded. For each conversation that:
 *
 *   1. has a legacy localStorage entry,
 *   2. and is missing the corresponding tag on the server,
 *
 * we PATCH the merged tag map onto the conversation and (on success) drop
 * the localStorage entry. We deliberately do NOT overwrite a tag that
 * already exists on the server — once a conversation has been migrated,
 * the server is the source of truth and the legacy entry is just stale.
 *
 * Best-effort: any individual failure is swallowed (logged through console)
 * so a bad network/permissions hiccup doesn't break the conversation list.
 * Subsequent calls will retry until the legacy entry is gone.
 *
 * Cloud conversations are skipped — local profile/workspace metadata never
 * lived in the cloud localStorage blob in the first place.
 */
const inFlight = new Set<string>();

export async function migrateLegacyConversationMetadata(
  conversations: AppConversation[],
): Promise<void> {
  if (getActiveBackend().backend.kind === "cloud") return;
  if (typeof window === "undefined") return;
  if (conversations.length === 0) return;

  const client = new ConversationClient(getAgentServerClientOptions());

  await Promise.all(
    conversations.map(async (conversation) => {
      if (inFlight.has(conversation.id)) return;

      const legacy = getStoredConversationMetadata(conversation.id);
      if (!legacy) return;

      const serverTags = conversation.tags ?? null;
      const fromServer = readMetadataFromTags(serverTags);

      // Pick up only the fields the legacy entry has that the server is
      // missing. If every legacy field is already mirrored on the server,
      // there's nothing left to migrate — just drop the localStorage entry.
      const merged: ConversationMetadataTags = {};
      let needsPatch = false;
      for (const key of AGENT_CANVAS_METADATA_TAG_KEYS) {
        const legacyValue = legacy[key as keyof typeof legacy];
        const serverValue = fromServer[key];
        if (
          typeof legacyValue === "string" &&
          legacyValue.length > 0 &&
          !serverValue
        ) {
          merged[key] = legacyValue;
          needsPatch = true;
        }
      }

      if (!needsPatch) {
        removeStoredConversationMetadata(conversation.id);
        return;
      }

      inFlight.add(conversation.id);
      try {
        const nextTags = mergeMetadataIntoTags(serverTags, {
          ...fromServer,
          ...merged,
        });
        await client.updateConversation(conversation.id, { tags: nextTags });
        removeStoredConversationMetadata(conversation.id);
      } catch (error) {
        // Leave the localStorage entry in place so the next list refresh
        // retries. Silent for the user — the worst case is the legacy
        // entry just keeps surfacing through the fallback in
        // `toAppConversation`.
        console.warn(
          `[conversation-metadata-migration] failed to migrate ${conversation.id}`,
          error,
        );
      } finally {
        inFlight.delete(conversation.id);
      }
    }),
  );
}
