import axios from "axios";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "#/api/backend-registry/active-store";
import { buildAuthHeaders } from "#/api/backend-registry/auth";
import { callCloudProxy } from "#/api/cloud/proxy";
import type { CustomSecretWithoutValue } from "#/api/secrets-service.types";
import { buildHttpBaseUrl } from "#/utils/websocket-url";
import type { AppConversation } from "./agent-server-conversation-service.types";

interface LookupSecret {
  kind: "LookupSecret";
  url: string;
  headers?: Record<string, string>;
  description?: string;
}

interface UpdateSecretsPayload {
  secrets: Record<string, LookupSecret>;
}

function encodedSecretPath(name: string): string {
  return encodeURIComponent(name);
}

export function buildSecretUpdatePayload(
  conversation: AppConversation,
  secret: CustomSecretWithoutValue,
): UpdateSecretsPayload | null {
  const active = getActiveBackend();
  const description = secret.description?.trim() || undefined;

  if (active.backend.kind === "cloud") {
    if (!conversation.sandbox_id || !conversation.session_api_key) return null;

    return {
      secrets: {
        [secret.name]: {
          kind: "LookupSecret",
          url: `${active.backend.host.replace(/\/+$/, "")}/api/v1/sandboxes/${encodeURIComponent(conversation.sandbox_id)}/settings/secrets/${encodedSecretPath(secret.name)}`,
          headers: { "X-Session-API-Key": conversation.session_api_key },
          ...(description ? { description } : {}),
        },
      },
    };
  }

  const backend = getEffectiveLocalBackend();
  if (!backend) return null;

  const headers = conversation.session_api_key
    ? { "X-Session-API-Key": conversation.session_api_key }
    : buildAuthHeaders(backend);

  return {
    secrets: {
      [secret.name]: {
        kind: "LookupSecret",
        url: `/api/settings/secrets/${encodedSecretPath(secret.name)}`,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(description ? { description } : {}),
      },
    },
  };
}

export async function updateConversationSecret(
  conversation: AppConversation,
  secret: CustomSecretWithoutValue,
): Promise<boolean> {
  const payload = buildSecretUpdatePayload(conversation, secret);
  if (!payload) return false;

  const active = getActiveBackend();
  const path = `/api/conversations/${encodeURIComponent(conversation.id)}/secrets`;

  if (active.backend.kind === "cloud") {
    if (!conversation.conversation_url || !conversation.session_api_key) {
      return false;
    }

    await callCloudProxy({
      backend: active.backend,
      method: "POST",
      path,
      body: payload,
      hostOverride: buildHttpBaseUrl(conversation.conversation_url),
      authMode: "session-api-key",
      sessionApiKey: conversation.session_api_key,
    });
    return true;
  }

  const backend = getEffectiveLocalBackend();
  if (!backend) return false;

  const host = (
    conversation.conversation_url
      ? buildHttpBaseUrl(conversation.conversation_url)
      : backend.host
  ).replace(/\/+$/, "");

  const authHeaders = conversation.session_api_key
    ? { "X-Session-API-Key": conversation.session_api_key }
    : buildAuthHeaders(backend);

  await axios.post(`${host}${path}`, payload, { headers: authHeaders });
  return true;
}
