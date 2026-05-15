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
  getStoredConversationMetadata,
  removeStoredConversationMetadata,
  setStoredConversationMetadata,
} from "../conversation-metadata-store";
import type {
  PluginSpec,
  AppConversation,
  AppConversationPage,
  AppConversationStartRequest,
  AppConversationStartTask,
  MetricsSnapshot,
  RuntimeConversationInfo,
  SendMessageRequest,
  SendMessageResponse,
} from "./agent-server-conversation-service.types";

const DEFAULT_CONVERSATION_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const INVALID_CONVERSATION_RESPONSE_MESSAGE =
  "Unable to load conversations because the selected agent server returned " +
  "data this UI does not understand. Check the backend URL/session key and " +
  "update the agent server if needed.";

function invalidConversationResponse(): Error {
  return new Error(INVALID_CONVERSATION_RESPONSE_MESSAGE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readTimestamp(
  item: Record<string, unknown>,
  snakeKey: "created_at" | "updated_at",
  camelKey: "createdAt" | "updatedAt",
): string {
  const value = item[snakeKey] ?? item[camelKey];
  return typeof value === "string" && value.trim()
    ? value
    : DEFAULT_CONVERSATION_TIMESTAMP;
}

function normalizeTokenUsage(
  value: unknown,
): NonNullable<MetricsSnapshot["accumulated_token_usage"]> | null {
  if (!isRecord(value)) return null;

  return {
    prompt_tokens: numberOrZero(value.prompt_tokens),
    completion_tokens: numberOrZero(value.completion_tokens),
    cache_read_tokens: numberOrZero(value.cache_read_tokens),
    cache_write_tokens: numberOrZero(value.cache_write_tokens),
    context_window: numberOrZero(value.context_window),
    per_turn_token: numberOrZero(value.per_turn_token),
  };
}

function normalizeMetrics(value: unknown): MetricsSnapshot | null {
  if (!isRecord(value)) return null;

  return {
    accumulated_cost: numberOrNull(value.accumulated_cost),
    max_budget_per_task: numberOrNull(value.max_budget_per_task),
    accumulated_token_usage: normalizeTokenUsage(value.accumulated_token_usage),
  };
}

function normalizeAgent(value: unknown): DirectConversationInfo["agent"] {
  if (!isRecord(value)) return null;
  const llm = isRecord(value.llm)
    ? { model: stringOrNull(value.llm.model) }
    : null;
  return { llm };
}

function normalizeWorkspace(
  value: unknown,
): DirectConversationInfo["workspace"] {
  if (!isRecord(value)) return null;
  return { working_dir: stringOrNull(value.working_dir) };
}

function normalizeAbsolutePath(path: string): string | null {
  if (!path.startsWith("/")) return null;

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment && segment !== ".") {
      if (segment === "..") {
        if (!segments.length) return null;
        segments.pop();
      } else {
        segments.push(segment);
      }
    }
  }

  return `/${segments.join("/")}`;
}

function requirePathInsideDirectory(path: string, directory: string): string {
  const normalizedPath = normalizeAbsolutePath(path);
  const normalizedDirectory = normalizeAbsolutePath(directory);

  if (
    !normalizedPath ||
    !normalizedDirectory ||
    (normalizedPath !== normalizedDirectory &&
      !normalizedPath.startsWith(`${normalizedDirectory}/`))
  ) {
    throw new Error("Conversation file path must stay inside the workspace");
  }

  return normalizedPath;
}

function requireDirectConversationInfo(item: unknown): DirectConversationInfo {
  if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) {
    throw invalidConversationResponse();
  }

  return {
    id: item.id.trim(),
    title: stringOrNull(item.title),
    created_at: readTimestamp(item, "created_at", "createdAt"),
    updated_at: readTimestamp(item, "updated_at", "updatedAt"),
    execution_status: stringOrNull(item.execution_status),
    metrics: normalizeMetrics(item.metrics),
    agent: normalizeAgent(item.agent),
    workspace: normalizeWorkspace(item.workspace),
  };
}

function requireDirectConversationItems(
  items: unknown,
): DirectConversationInfo[] {
  if (!Array.isArray(items)) {
    throw invalidConversationResponse();
  }
  return items.map(requireDirectConversationInfo);
}

function requireConversationSearchPage(page: unknown): {
  items: DirectConversationInfo[];
  next_page_id: string | null;
} {
  if (Array.isArray(page)) {
    return {
      items: requireDirectConversationItems(page),
      next_page_id: null,
    };
  }

  if (!isRecord(page)) {
    throw invalidConversationResponse();
  }

  return {
    items: requireDirectConversationItems(page.items),
    next_page_id:
      typeof page.next_page_id === "string" ? page.next_page_id : null,
  };
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

    if (metadata?.selected_repository || workingDirOverride) {
      // The agent-server runtime has no concept of selected repo/branch/
      // workspace, so persist the home-page selection client-side.
      // `toAppConversation` reads the repo/branch fields back to hydrate
      // the chat-page badges; `useHasAttachedSource` reads
      // `selected_workspace` to default the Files tab to Diff mode when
      // the user explicitly attached a local workspace.
      setStoredConversationMetadata(data.id, {
        selected_repository: metadata?.selected_repository ?? null,
        selected_branch: metadata?.selected_branch ?? null,
        git_provider: metadata?.git_provider ?? null,
        selected_workspace: workingDirOverride ?? null,
      });
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
    // Local-only path. Cloud conversations read the VSCode URL straight
    // from the SaaS-computed `sandbox.exposed_urls` (see
    // `useUnifiedVSCodeUrl` + `useCloudSandbox`); the runtime's own
    // `/api/vscode/url` only knows its internal `localhost:8001`, which
    // the user's browser can't reach.
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

    return requireDirectConversationItems(data).map((item) =>
      toAppConversation(item),
    );
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
      const existing = getStoredConversationMetadata(conversationId);
      setStoredConversationMetadata(conversationId, {
        ...(existing ?? {}),
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
      const path = requirePathInsideDirectory(
        filePath ?? "/workspace/project/.agents_tmp/PLAN.md",
        "/workspace/project",
      );
      return readCloudConversationFile(conversationId, path);
    }

    const workingDir = await this.resolveConversationWorkingDir(conversationId);
    const path = requirePathInsideDirectory(
      filePath ?? `${workingDir}/.agents_tmp/PLAN.md`,
      workingDir,
    );
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
    const response =
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
    const data = requireDirectConversationInfo(response);
    const stats = isRecord(response) ? response.stats : null;

    return {
      id: data.id,
      title: data.title?.trim()
        ? data.title
        : getDefaultConversationTitle(data.id),
      metrics: normalizeMetrics(data.metrics),
      created_at: data.created_at,
      updated_at: data.updated_at,
      status: toRuntimeStatus(data.execution_status),
      stats: isRecord(stats) ? stats : { usage_to_metrics: {} },
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

    return toConversationPage(requireConversationSearchPage(data));
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

  static async switchProfile(
    conversationId: string,
    profileName: string,
  ): Promise<void> {
    if (getActiveBackend().backend.kind === "cloud") {
      throw new Error(
        "LLM profile switching is only supported for local agent-server backends.",
      );
    }

    await new ConversationClient(getAgentServerClientOptions()).switchProfile(
      conversationId,
      profileName,
    );
  }
}

export default AgentServerConversationService;
