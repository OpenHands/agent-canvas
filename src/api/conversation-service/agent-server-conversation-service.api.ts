import { ConversationSortOrder } from "@openhands/typescript-client";
import {
  ConversationClient,
  FileClient,
  VSCodeClient,
} from "@openhands/typescript-client/clients";
import { v4 as uuidv4 } from "uuid";
import { Provider } from "#/types/settings";
import { buildHttpBaseUrl } from "#/utils/websocket-url";
import {
  buildConversationWorkingDir,
  getAgentServerWorkingDir,
} from "../agent-server-config";
import {
  getActiveBackend,
  getEffectiveLocalBackend,
} from "../backend-registry/active-store";
import { callCloudProxy } from "../cloud/proxy";
import {
  batchGetCloudConversations,
  createCloudAppConversation,
  deleteCloudConversation,
  downloadCloudConversation,
  getCloudAppConversationStartTask,
  readCloudConversationFile,
  searchCloudConversations,
  updateCloudConversationPublicFlag,
} from "../cloud/conversation-service.api";
import {
  DirectConversationInfo,
  buildStartConversationRequestWithEncryptedSettings,
  getDefaultConversationTitle,
  toAppConversation,
  toConversationPage,
} from "../agent-server-adapter";
import { GetVSCodeUrlResponse } from "../open-hands.types";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import SettingsService from "../settings-service/settings-service.api";
import {
  ConversationMetadata,
  removeStoredConversationMetadata,
  setStoredConversationMetadata,
} from "../conversation-metadata-store";
import type {
  PluginSpec,
  AppConversation,
  AppConversationPage,
  AppConversationStartRequest,
  AppConversationStartTask,
  RuntimeConversationInfo,
  SendMessageRequest,
  SendMessageResponse,
} from "./agent-server-conversation-service.types";

function isDirectConversationInfo(
  item: unknown,
): item is DirectConversationInfo {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as { id?: unknown }).id === "string" &&
    typeof (item as { created_at?: unknown }).created_at === "string" &&
    typeof (item as { updated_at?: unknown }).updated_at === "string"
  );
}

function requireDirectConversationItems(
  items: unknown,
): DirectConversationInfo[] {
  if (!Array.isArray(items) || !items.every(isDirectConversationInfo)) {
    throw new Error("Invalid conversation response shape");
  }
  return items;
}

const RUNTIME_STATUSES = new Set<string>([
  "idle",
  "running",
  "paused",
  "waiting_for_confirmation",
  "finished",
  "error",
  "stuck",
]);

function toRuntimeStatus(
  status: DirectConversationInfo["execution_status"],
): RuntimeConversationInfo["status"] {
  const nextStatus = status ?? "idle";
  return (
    RUNTIME_STATUSES.has(nextStatus) ? nextStatus : "idle"
  ) as RuntimeConversationInfo["status"];
}

function requireAppConversation(
  conversation: AppConversation | null | undefined,
  conversationId: string,
): AppConversation {
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} was not found`);
  }
  return conversation;
}

class AgentServerConversationService {
  static async sendMessage(
    conversationId: string,
    message: SendMessageRequest,
  ): Promise<SendMessageResponse> {
    await new ConversationClient(getAgentServerClientOptions()).sendEvent(
      conversationId,
      message,
      {
        run: true,
      },
    );

    return message;
  }

  static async createConversation(
    initialUserMsg?: string,
    conversationInstructions?: string,
    plugins?: PluginSpec[],
    metadata?: ConversationMetadata | null,
    workingDirOverride?: string,
    parentConversationId?: string,
    agentType?: "default" | "plan",
    sandboxId?: string,
  ): Promise<AppConversationStartTask> {
    if (getActiveBackend().backend.kind === "cloud") {
      // Cloud SaaS path mirrors OpenHands' frontend: build a flat
      // AppConversationStartRequest, POST /api/v1/app-conversations
      // (returns a WORKING task), and let the conversation route's
      // useTaskPolling drive it to READY. NO encrypted-settings
      // round-trip — the SaaS holds secrets server-side.
      const request: AppConversationStartRequest = {
        initial_message: initialUserMsg
          ? {
              role: "user",
              content: [{ type: "text", text: initialUserMsg }],
            }
          : null,
        title: conversationInstructions ?? null,
        selected_repository: metadata?.selected_repository ?? null,
        selected_branch: metadata?.selected_branch ?? null,
        git_provider: metadata?.git_provider ?? null,
        plugins: plugins ?? null,
        parent_conversation_id: parentConversationId ?? null,
        agent_type: agentType,
        sandbox_id: sandboxId ?? null,
      };
      return createCloudAppConversation(request);
    }

    const settings = await SettingsService.getSettings();
    const conversationId = uuidv4();
    const workingDir =
      workingDirOverride ?? buildConversationWorkingDir(conversationId);

    // Use encrypted settings to avoid exposing secrets in the browser
    const payload = await buildStartConversationRequestWithEncryptedSettings({
      settings,
      query: initialUserMsg,
      conversationInstructions,
      plugins,
      conversationId,
      workingDir,
    });

    const data = await new ConversationClient(
      getAgentServerClientOptions(),
    ).createConversation<DirectConversationInfo>(payload);

    if (metadata?.selected_repository) {
      // The agent-server runtime has no concept of selected repo/branch, so
      // persist the home-page selection client-side. toAppConversation
      // reads the same store when the chat page hydrates the badges.
      setStoredConversationMetadata(data.id, metadata);
    }

    return {
      id: data.id,
      created_by_user_id: null,
      status: "READY",
      detail: null,
      app_conversation_id: data.id,
      agent_server_url: getEffectiveLocalBackend().host,
      request: {
        initial_message: payload.initial_message as
          | AppConversationStartRequest["initial_message"]
          | undefined,
        plugins: plugins ?? null,
      },
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  static async getStartTask(
    taskId: string,
  ): Promise<AppConversationStartTask | null> {
    if (getActiveBackend().backend.kind === "cloud") {
      return getCloudAppConversationStartTask(taskId);
    }
    // Local agent-server creates conversations synchronously — every
    // local "task" is already READY when createConversation returns, so
    // there's nothing to poll for.
    return null;
  }

  static async getVSCodeUrl(
    conversationId: string,
    conversationUrl: string | null | undefined,
    sessionApiKey?: string | null,
  ): Promise<GetVSCodeUrlResponse> {
    const active = getActiveBackend().backend;

    // Cloud mode: route through the cloud-proxy to the runtime sandbox.
    // The runtime exposes a SaaS-style endpoint at `/api/vscode/url`
    // that returns `{ url }`; we map it back to `{ vscode_url }` to
    // match the local response shape.
    if (active.kind === "cloud" && conversationUrl) {
      const data = await callCloudProxy<{ url: string | null }>({
        backend: active,
        method: "GET",
        hostOverride: buildHttpBaseUrl(conversationUrl),
        path: "/api/vscode/url",
        authMode: "session-api-key",
        sessionApiKey,
      });
      return { vscode_url: data?.url ?? null };
    }

    const workspaceDir =
      await this.resolveConversationWorkingDir(conversationId);
    // Local mode: the typescript-client targets the local agent-server
    // directly via the conversationUrl override.
    const vscodeUrl = await new VSCodeClient(
      getAgentServerClientOptions({
        conversationUrl,
        sessionApiKey,
      }),
    ).getUrl({
      baseUrl:
        typeof window !== "undefined" ? window.location.origin : undefined,
      workspaceDir,
    });

    return { vscode_url: vscodeUrl };
  }

  static async resolveConversationWorkingDir(
    conversationId: string,
  ): Promise<string> {
    const [conversation] = await this.batchGetAppConversations([
      conversationId,
    ]);
    return conversation?.workspace?.working_dir ?? getAgentServerWorkingDir();
  }

  static async batchGetAppConversations(
    ids: string[],
  ): Promise<(AppConversation | null)[]> {
    if (ids.length === 0) return [];

    if (getActiveBackend().backend.kind === "cloud") {
      return batchGetCloudConversations(ids);
    }

    const data = await new ConversationClient(
      getAgentServerClientOptions(),
    ).getConversations<DirectConversationInfo>(ids);

    return data.map((item) => (item ? toAppConversation(item) : null));
  }

  static async updateConversationPublicFlag(
    conversationId: string,
    isPublic: boolean,
  ): Promise<AppConversation> {
    if (getActiveBackend().backend.kind !== "cloud") {
      throw new Error("Public sharing requires a cloud backend.");
    }
    return updateCloudConversationPublicFlag(conversationId, isPublic);
  }

  static async updateConversationRepository(
    conversationId: string,
    repository: string | null,
    branch?: string | null,
    gitProvider?: string | null,
  ): Promise<AppConversation> {
    if (repository) {
      setStoredConversationMetadata(conversationId, {
        selected_repository: repository,
        selected_branch: branch ?? null,
        git_provider: (gitProvider as Provider | null | undefined) ?? null,
      });
    } else {
      removeStoredConversationMetadata(conversationId);
    }
    const [conversation] = await this.batchGetAppConversations([
      conversationId,
    ]);
    return requireAppConversation(conversation, conversationId);
  }

  static async readConversationFile(
    conversationId: string,
    filePath?: string,
  ): Promise<string> {
    if (getActiveBackend().backend.kind === "cloud") {
      // Cloud SaaS exposes a per-conversation file endpoint; the sandbox
      // working dir is fixed (`/workspace/project`), so PLAN.md lives at
      // a known absolute path. Mirrors OpenHands' readConversationFile.
      return readCloudConversationFile(
        conversationId,
        filePath ?? "/workspace/project/.agents_tmp/PLAN.md",
      );
    }

    const path =
      filePath ??
      `${await this.resolveConversationWorkingDir(conversationId)}/.agents_tmp/PLAN.md`;
    return new FileClient(getAgentServerClientOptions()).downloadTextFile(path);
  }

  static async downloadConversation(conversationId: string): Promise<Blob> {
    if (getActiveBackend().backend.kind === "cloud") {
      return downloadCloudConversation(conversationId);
    }

    return new FileClient(getAgentServerClientOptions()).downloadTrajectory(
      conversationId,
    );
  }

  static async getRuntimeConversation(
    conversationId: string,
    conversationUrl: string | null | undefined,
    sessionApiKey?: string | null,
  ): Promise<RuntimeConversationInfo> {
    const active = getActiveBackend().backend;

    type RawRuntime = DirectConversationInfo & {
      stats?: RuntimeConversationInfo["stats"];
    };

    // Cloud mode: route through the cloud-proxy to the runtime sandbox at
    // the conversation's runtime URL — same pattern as getVSCodeUrl. Local
    // mode forwards conversationUrl so the host explicitly resolves to the
    // conversation's runtime instead of falling back to the active backend.
    const data: RawRuntime =
      active.kind === "cloud" && conversationUrl
        ? await callCloudProxy<RawRuntime>({
            backend: active,
            method: "GET",
            hostOverride: buildHttpBaseUrl(conversationUrl),
            path: `/api/conversations/${conversationId}`,
            authMode: "session-api-key",
            sessionApiKey,
          })
        : await new ConversationClient(
            getAgentServerClientOptions({
              conversationUrl,
              sessionApiKey,
            }),
          ).getConversation<RawRuntime>(conversationId);

    return {
      id: data.id,
      title: data.title?.trim()
        ? data.title
        : getDefaultConversationTitle(data.id),
      metrics: data.metrics
        ? {
            accumulated_cost: data.metrics.accumulated_cost ?? null,
            max_budget_per_task: data.metrics.max_budget_per_task ?? null,
            accumulated_token_usage: data.metrics.accumulated_token_usage
              ? {
                  prompt_tokens:
                    data.metrics.accumulated_token_usage.prompt_tokens ?? 0,
                  completion_tokens:
                    data.metrics.accumulated_token_usage.completion_tokens ?? 0,
                  cache_read_tokens:
                    data.metrics.accumulated_token_usage.cache_read_tokens ?? 0,
                  cache_write_tokens:
                    data.metrics.accumulated_token_usage.cache_write_tokens ??
                    0,
                  context_window:
                    data.metrics.accumulated_token_usage.context_window ?? 0,
                  per_turn_token:
                    data.metrics.accumulated_token_usage.per_turn_token ?? 0,
                }
              : null,
          }
        : null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      status: toRuntimeStatus(data.execution_status),
      stats: data.stats ?? { usage_to_metrics: {} },
    };
  }

  static async searchConversations(
    limit: number = 20,
    pageId?: string,
  ): Promise<AppConversationPage> {
    if (getActiveBackend().backend.kind === "cloud") {
      return searchCloudConversations(limit, pageId);
    }

    const data = await new ConversationClient(
      getAgentServerClientOptions(),
    ).searchConversations({
      limit,
      page_id: pageId,
      sort_order: ConversationSortOrder.UPDATED_AT_DESC,
    });

    return toConversationPage({
      items: requireDirectConversationItems(data.items),
      next_page_id: data.next_page_id ?? null,
    });
  }

  static async deleteConversation(conversationId: string): Promise<void> {
    if (getActiveBackend().backend.kind === "cloud") {
      await deleteCloudConversation(conversationId);
    } else {
      await new ConversationClient(
        getAgentServerClientOptions(),
      ).deleteConversation(conversationId);
    }
    removeStoredConversationMetadata(conversationId);
  }

  static async updateConversationTitle(
    conversationId: string,
    title: string,
  ): Promise<AppConversation> {
    await new ConversationClient(
      getAgentServerClientOptions(),
    ).updateConversation(conversationId, {
      title,
    });
    const [conversation] = await this.batchGetAppConversations([
      conversationId,
    ]);
    return requireAppConversation(conversation, conversationId);
  }
}

export default AgentServerConversationService;
