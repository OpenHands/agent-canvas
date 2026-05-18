import { BashClient } from "@openhands/typescript-client/clients";
import type {
  BashCommand,
  BashEvent,
  BashEventPage,
  BashOutput,
} from "@openhands/typescript-client";
import { buildHttpBaseUrl } from "#/utils/websocket-url";
import { getActiveBackend } from "../backend-registry/active-store";
import { callCloudProxy } from "../cloud/proxy";
import { getAgentServerClientOptions } from "../agent-server-client-options";

export interface BashCommandLogs {
  command: BashCommand;
  outputs: BashOutput[];
}

interface SearchOptions {
  kind__eq?: "BashCommand" | "BashOutput";
  command_id__eq?: string;
  sort_order?: "TIMESTAMP" | "TIMESTAMP_DESC";
  page_id?: string;
  limit?: number;
}

const MAX_OUTPUT_PAGES = 20; // safety cap; >2000 output events is unlikely.

function isBashOutput(event: BashEvent): event is BashOutput {
  return event.kind === "BashOutput";
}

function isBashCommand(event: BashEvent): event is BashCommand {
  return event.kind === "BashCommand";
}

/**
 * Cloud-aware bash event reads.
 *
 * Bash events live on the agent-server runtime (the same host that owns
 * the conversation). In **local** mode we talk to the agent-server
 * directly with the SDK's `BashClient`. In **cloud** mode we have to
 * tunnel through `callCloudProxy` with the runtime URL as `hostOverride`
 * — direct browser calls to `*.prod-runtime.all-hands.dev` are blocked
 * by CORS, and the runtime endpoints authenticate with the conversation's
 * `X-Session-API-Key` rather than the cloud backend's bearer token.
 */
class BashService {
  /**
   * Fetch the `BashCommand` event plus all of its `BashOutput` events
   * (paginated) so callers can render a single chronological log view.
   */
  static async getCommandLogs(
    conversationUrl: string,
    sessionApiKey: string | null | undefined,
    bashCommandId: string,
  ): Promise<BashCommandLogs> {
    const command = await BashService.getEvent(
      conversationUrl,
      sessionApiKey,
      bashCommandId,
    );

    if (!isBashCommand(command)) {
      throw new Error(
        `Expected BashCommand for id ${bashCommandId}, got kind=${command.kind ?? "<unknown>"}`,
      );
    }

    const outputs: BashOutput[] = [];
    let pageId: string | undefined;
    for (let i = 0; i < MAX_OUTPUT_PAGES; i += 1) {
      const page: BashEventPage = await BashService.searchEvents(
        conversationUrl,
        sessionApiKey,
        {
          kind__eq: "BashOutput",
          command_id__eq: bashCommandId,
          sort_order: "TIMESTAMP",
          ...(pageId ? { page_id: pageId } : {}),
        },
      );
      page.items.forEach((event) => {
        if (isBashOutput(event)) outputs.push(event);
      });
      if (!page.next_page_id) break;
      pageId = page.next_page_id;
    }
    return { command, outputs };
  }

  private static async getEvent(
    conversationUrl: string,
    sessionApiKey: string | null | undefined,
    eventId: string,
  ): Promise<BashEvent> {
    const active = getActiveBackend().backend;

    if (active.kind === "cloud") {
      return callCloudProxy<BashEvent>({
        backend: active,
        method: "GET",
        hostOverride: buildHttpBaseUrl(conversationUrl),
        path: `/api/bash/bash_events/${encodeURIComponent(eventId)}`,
        authMode: "session-api-key",
        sessionApiKey,
      });
    }

    return new BashClient(
      getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
    ).getEvent(eventId);
  }

  private static async searchEvents(
    conversationUrl: string,
    sessionApiKey: string | null | undefined,
    options: SearchOptions,
  ): Promise<BashEventPage> {
    const active = getActiveBackend().backend;

    if (active.kind === "cloud") {
      const params = new URLSearchParams();
      Object.entries(options).forEach(([k, v]) => {
        if (v !== undefined && v !== null) params.set(k, String(v));
      });
      return callCloudProxy<BashEventPage>({
        backend: active,
        method: "GET",
        hostOverride: buildHttpBaseUrl(conversationUrl),
        path: `/api/bash/bash_events/search?${params.toString()}`,
        authMode: "session-api-key",
        sessionApiKey,
      });
    }

    return new BashClient(
      getAgentServerClientOptions({ conversationUrl, sessionApiKey }),
    ).searchEvents(options);
  }
}

export default BashService;
