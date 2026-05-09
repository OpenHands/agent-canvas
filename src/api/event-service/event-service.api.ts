import { OpenHandsEvent } from "#/types/agent-server/core";
import { buildHttpBaseUrl } from "#/utils/websocket-url";
import { getActiveBackend } from "../backend-registry/active-store";
import { callCloudProxy } from "../cloud/proxy";
import { createHttpClient, createRemoteEventsList } from "../typescript-client";
import type {
  ConfirmationResponseRequest,
  ConfirmationResponseResponse,
  EventSearchOptions,
  EventSearchPage,
} from "./event-service.types";

/**
 * Cloud-mode REST calls are split between two upstream hosts (matching
 * OpenHands' SaaS frontend):
 *
 *   - **App API** (`backend.host`, default in `callCloudProxy`):
 *     event *history* (`/api/v1/conversation/{id}/events/search`).
 *     Persisted by the SaaS — survives the runtime sandbox.
 *
 *   - **Runtime sandbox** (extracted from `conversation.conversation_url`
 *     and passed as `hostOverride`): live runtime endpoints like
 *     `/api/conversations/{id}/events/count` and
 *     `/api/conversations/{id}/events/respond_to_confirmation`. Auth on
 *     these endpoints is `X-Session-API-Key`, not `Authorization: Bearer`.
 *
 * Both go through the bundled local agent-server's `/api/cloud-proxy`,
 * which sidesteps the cross-origin restrictions that block the GUI at
 * `localhost` from talking directly to either the SaaS or the runtime.
 *
 * Local mode keeps the existing typescript-client path: it targets the
 * conversation's host directly via `createRemoteEventsList`/`createHttpClient`.
 */
class EventService {
  static async respondToConfirmation(
    conversationId: string,
    conversationUrl: string,
    request: ConfirmationResponseRequest,
    sessionApiKey?: string | null,
  ): Promise<ConfirmationResponseResponse> {
    const active = getActiveBackend().backend;

    if (active.kind === "cloud") {
      return callCloudProxy<ConfirmationResponseResponse>({
        backend: active,
        method: "POST",
        hostOverride: buildHttpBaseUrl(conversationUrl),
        path: `/api/conversations/${conversationId}/events/respond_to_confirmation`,
        body: request,
        authMode: "session-api-key",
        sessionApiKey,
      });
    }

    const response = await createHttpClient({
      conversationUrl,
      sessionApiKey,
    }).post<ConfirmationResponseResponse>(
      `/api/conversations/${conversationId}/events/respond_to_confirmation`,
      request,
    );

    return response.data;
  }

  static async getEventCount(
    conversationId: string,
    conversationUrl: string,
    sessionApiKey?: string | null,
  ): Promise<number> {
    const active = getActiveBackend().backend;

    if (active.kind === "cloud") {
      return callCloudProxy<number>({
        backend: active,
        method: "GET",
        hostOverride: buildHttpBaseUrl(conversationUrl),
        path: `/api/conversations/${conversationId}/events/count`,
        authMode: "session-api-key",
        sessionApiKey,
      });
    }

    return createRemoteEventsList(conversationId, {
      conversationUrl,
      sessionApiKey,
    }).count();
  }

  /**
   * Search events for a conversation. Returns the raw page so callers can
   * paginate (via `next_page_id`) and so REST-driven history loading can
   * tell when there are no more older events to load.
   */
  static async searchEvents(
    conversationId: string,
    conversationUrl?: string | null,
    sessionApiKey?: string | null,
    options: EventSearchOptions = {},
  ): Promise<EventSearchPage<OpenHandsEvent>> {
    const active = getActiveBackend().backend;
    const limit = options.limit ?? 100;

    if (active.kind === "cloud") {
      // Event *history* lives on the SaaS App API, not the runtime
      // sandbox. Path is singular `conversation` and v1-prefixed.
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (options.pageId) params.set("page_id", options.pageId);
      if (options.sortOrder) params.set("sort_order", options.sortOrder);
      if (options.timestampGte)
        params.set("timestamp__gte", options.timestampGte);
      if (options.timestampLt) params.set("timestamp__lt", options.timestampLt);

      const data = await callCloudProxy<EventSearchPage<OpenHandsEvent>>({
        backend: active,
        method: "GET",
        path: `/api/v1/conversation/${conversationId}/events/search?${params.toString()}`,
      });
      return {
        items: data?.items ?? [],
        next_page_id: data?.next_page_id ?? null,
      };
    }

    const page = await createRemoteEventsList(conversationId, {
      conversationUrl,
      sessionApiKey,
    }).search({
      limit,
      ...(options.pageId ? { page_id: options.pageId } : {}),
      ...(options.sortOrder ? { sort_order: options.sortOrder } : {}),
      ...(options.timestampGte ? { timestamp__gte: options.timestampGte } : {}),
      ...(options.timestampLt ? { timestamp__lt: options.timestampLt } : {}),
    });

    return {
      items: (page.items ?? []) as OpenHandsEvent[],
      next_page_id: page.next_page_id ?? null,
    };
  }
}

export default EventService;
