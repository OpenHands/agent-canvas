import { ConversationClient } from "@openhands/typescript-client/clients";
import { HttpClient } from "@openhands/typescript-client/client/http-client";
import { RemoteEventsList } from "@openhands/typescript-client/events/remote-events-list";
import { OpenHandsEvent } from "#/types/agent-server/core";
import { buildHttpBaseUrl } from "#/utils/websocket-url";
import { getActiveBackend } from "../backend-registry/active-store";
import { callCloudProxy } from "../cloud/proxy";
import {
  getAgentServerClientOptions,
  getAgentServerHttpClientOptions,
} from "../agent-server-client-options";
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
 * conversation's host directly via typed client classes.
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

    return new ConversationClient(
      getAgentServerClientOptions({
        conversationUrl,
        sessionApiKey,
      }),
    ).respondToConfirmation<ConfirmationResponseResponse>(
      conversationId,
      request,
    );
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

    return new ConversationClient(
      getAgentServerClientOptions({
        conversationUrl,
        sessionApiKey,
      }),
    ).getEventCount(conversationId);
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
      //
      // Mirror the OpenHands SaaS frontend's request shape and send ONLY
      // `limit`. The SaaS app-server's `search_events` has a server-side
      // TypeError when filtering by `timestamp__lt` / `timestamp__gte`
      // (it compares the stored `event.timestamp` str against the parsed
      // datetime, which raises in Python 3 and surfaces as HTTP 500). The
      // cloud frontend has never sent timestamp/sort/page filters here,
      // so the broken path is untested; the safe contract is "limit
      // only" until the server is fixed. `sort_order` and `page_id` are
      // also dropped — neither is part of the proven-working shape, and
      // older-event pagination is gated off in `useLoadOlderEvents` for
      // cloud, so they have no caller to satisfy.
      const cloudLimit = Math.min(limit, 100);
      const params = new URLSearchParams();
      params.set("limit", String(cloudLimit));

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

    const page = await new RemoteEventsList(
      new HttpClient(
        getAgentServerHttpClientOptions({ conversationUrl, sessionApiKey }),
      ),
      conversationId,
    ).search({
      limit,
      ...(options.pageId ? { page_id: options.pageId } : {}),
      ...(options.sortOrder ? { sort_order: options.sortOrder } : {}),
      ...(options.timestampGte ? { timestamp__gte: options.timestampGte } : {}),
      ...(options.timestampLt ? { timestamp__lt: options.timestampLt } : {}),
    });

    return {
      items: (page?.items ?? []) as OpenHandsEvent[],
      next_page_id: page?.next_page_id ?? null,
    };
  }
}

export default EventService;
