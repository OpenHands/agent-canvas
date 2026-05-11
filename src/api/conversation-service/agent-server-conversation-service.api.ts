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
  downloadTextFile,
  emptyHooksResponse,
  getDefaultConversationTitle,
  loadSkillsForConversation,
  toAppConversation,
  toConversationPage,
} from "../agent-server-adapter";
import { GetVSCodeUrlResponse } from "../open-hands.types";
import {
  createHttpClient,
  createRemoteWorkspace,
  createVSCodeClient,
} from "../typescript-client";
import SettingsService from "../settings-service/settings-service.api";
import {
  ConversationMetadata,
  removeStoredConversationMetadata,
  setStoredConversationMetadata,
} from "../conversation-metadata-store";
import type {
  GetHooksResponse,
  GetSkillsResponse,
  PluginSpec,
  AppConversation,
  AppConversationPage,
  AppConversationStartRequest,
  AppConversationStartTask,
  RuntimeConversationInfo,
  SendMessageRequest,
  SendMessageResponse,
} from "./agent-server-conversation-service.types";

class AgentServerConversationService {
  static async sendMessage(
    conversationId: string,
    message: SendMessageRequest,
  ): Promise<SendMessageResponse> {
    await createHttpClient().post(
      `/api/conversations/${conversationId}/events`,
      {
        ...message,
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
      // Only request a per-conversation git worktree when the user has
      // attached a real repository. Local-only workspaces (no
      // `selected_repository`) may not be git checkouts, in which case
      // `git worktree add HEAD` on the server fails and the conversation
      // never starts.
      worktree: !!metadata?.selected_repository,
    });

    const response = await createHttpClient().post<DirectConversationInfo>(
      "/api/conversations",
      payload,
    );
    const { data } = response;

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

  static async searchStartTasks(
    limit: number = 100,
  ): Promise<AppConversationStartTask[]> {
    if (limit < 0) {
      return [];
    }
    return [];
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
    const vscodeUrl = await createVSCodeClient({
      conversationUrl,
      sessionApiKey,
    }).getUrl({
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

  static async pauseConversation(
    conversationId: string,
    _conversationUrl: string | null | undefined,
    sessionApiKey?: string | null,
  ): Promise<{ success: boolean }> {
    const response = await createHttpClient({ sessionApiKey }).post<{
      success: boolean;
    }>(`/api/conversations/${conversationId}/pause`, {});

    return response.data;
  }

  static async askAgent(
    conversationId: string,
    _conversationUrl: string | null | undefined,
    question: string,
    sessionApiKey?: string | null,
  ): Promise<{ response: string }> {
    const response = await createHttpClient({ sessionApiKey }).post<{
      response: string;
    }>(`/api/conversations/${conversationId}/ask_agent`, { question });

    return response.data;
  }

  static async resumeConversation(
    conversationId: string,
    _conversationUrl: string | null | undefined,
    sessionApiKey?: string | null,
  ): Promise<{ success: boolean }> {
    const response = await createHttpClient({ sessionApiKey }).post<{
      success: boolean;
    }>(`/api/conversations/${conversationId}/run`, {});

    return response.data;
  }

  static async batchGetAppConversations(
    ids: string[],
  ): Promise<(AppConversation | null)[]> {
    if (ids.length === 0) return [];

    if (getActiveBackend().backend.kind === "cloud") {
      return batchGetCloudConversations(ids);
    }

    const response = await createHttpClient().get<
      (DirectConversationInfo | null)[]
    >("/api/conversations", { params: { ids } });

    return response.data.map((item) => (item ? toAppConversation(item) : null));
  }

  static async uploadFile(
    _conversationUrl: string | null | undefined,
    sessionApiKey: string | null | undefined,
    file: File,
    path?: string,
  ): Promise<void> {
    const uploadPath = path || `/workspace/${file.name}`;
    await createRemoteWorkspace({ sessionApiKey }).fileUpload(file, uploadPath);
  }

  static async getConversationConfig(
    conversationId: string,
  ): Promise<{ runtime_id: string }> {
    return { runtime_id: conversationId };
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
    const results = await this.batchGetAppConversations([conversationId]);
    return results[0] as AppConversation;
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

    if (filePath) {
      return downloadTextFile(filePath);
    }

    const workingDir = await this.resolveConversationWorkingDir(conversationId);
    return downloadTextFile(`${workingDir}/.agents_tmp/PLAN.md`);
  }

  static async downloadConversation(conversationId: string): Promise<Blob> {
    if (getActiveBackend().backend.kind === "cloud") {
      return downloadCloudConversation(conversationId);
    }

    const response = await createHttpClient().get<Blob>(
      `/api/file/download-trajectory/${conversationId}`,
      {
        responseType: "blob",
      },
    );

    return response.data;
  }

  static async getSkills(conversationId: string): Promise<GetSkillsResponse> {
    const [conversation] = await this.batchGetAppConversations([
      conversationId,
    ]);
    return loadSkillsForConversation(conversation);
  }

  static async getHooks(conversationId: string): Promise<GetHooksResponse> {
    if (!conversationId) {
      return emptyHooksResponse();
    }
    return emptyHooksResponse();
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
        : (
            await createHttpClient({
              conversationUrl,
              sessionApiKey,
            }).get<RawRuntime>(`/api/conversations/${conversationId}`)
          ).data;

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
      status:
        (data.execution_status as RuntimeConversationInfo["status"]) ?? "idle",
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

    const response = await createHttpClient().get<{
      items: DirectConversationInfo[];
      next_page_id: string | null;
    }>("/api/conversations/search", {
      params: {
        limit,
        page_id: pageId,
        sort_order: "UPDATED_AT_DESC",
      },
    });

    return toConversationPage(response.data);
  }

  static async deleteConversation(conversationId: string): Promise<void> {
    if (getActiveBackend().backend.kind === "cloud") {
      await deleteCloudConversation(conversationId);
    } else {
      await createHttpClient().delete(`/api/conversations/${conversationId}`);
    }
    removeStoredConversationMetadata(conversationId);
  }

  static async updateConversationTitle(
    conversationId: string,
    title: string,
  ): Promise<AppConversation> {
    await createHttpClient().patch(`/api/conversations/${conversationId}`, {
      title,
    });
    const [conversation] = await this.batchGetAppConversations([
      conversationId,
    ]);
    return conversation as AppConversation;
  }
}

export default AgentServerConversationService;
