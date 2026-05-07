import { Provider } from "#/types/settings";
import { SuggestedTask } from "#/utils/types";
import { v4 as uuidv4 } from 'uuid';
import {
  buildConversationWorkingDir,
  getAgentServerBaseUrl,
  getAgentServerWorkingDir,
} from "../agent-server-config";
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
import { ConversationTrigger, GetVSCodeUrlResponse } from "../open-hands.types";
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
  ): Promise<AppConversationStartTask> {
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

    const response = await createHttpClient().post<DirectConversationInfo>(
      "/api/conversations",
      payload,
    );
    const { data } = response;

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
      agent_server_url: getAgentServerBaseUrl(),
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
    _taskId: string,
  ): Promise<AppConversationStartTask | null> {
    return null;
  }

  static async searchStartTasks(
    _limit: number = 100,
  ): Promise<AppConversationStartTask[]> {
    return [];
  }

  static async getVSCodeUrl(
    conversationId: string,
    _conversationUrl: string | null | undefined,
    sessionApiKey?: string | null,
  ): Promise<GetVSCodeUrlResponse> {
    const workspaceDir =
      await this.resolveConversationWorkingDir(conversationId);
    const vscode_url = await createVSCodeClient({ sessionApiKey }).getUrl({
      baseUrl:
        typeof window !== "undefined" ? window.location.origin : undefined,
      workspaceDir,
    });

    return { vscode_url };
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

    const response = await createHttpClient().get<
      (DirectConversationInfo | null)[]
    >("/api/conversations", { params: { ids } });

    return response.data.map((item) =>
      item ? toAppConversation(item) : null,
    );
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
    _isPublic: boolean,
  ): Promise<AppConversation> {
    const results = await this.batchGetAppConversations([conversationId]);
    return results[0] as AppConversation;
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
    if (filePath) {
      return downloadTextFile(filePath);
    }

    const workingDir = await this.resolveConversationWorkingDir(conversationId);
    return downloadTextFile(`${workingDir}/.agents_tmp/PLAN.md`);
  }

  static async downloadConversation(conversationId: string): Promise<Blob> {
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

  static async getHooks(_conversationId: string): Promise<GetHooksResponse> {
    return emptyHooksResponse();
  }

  static async getRuntimeConversation(
    conversationId: string,
    _conversationUrl: string | null | undefined,
    sessionApiKey?: string | null,
  ): Promise<RuntimeConversationInfo> {
    const response = await createHttpClient({ sessionApiKey }).get<
      DirectConversationInfo & { stats?: RuntimeConversationInfo["stats"] }
    >(`/api/conversations/${conversationId}`);
    const { data } = response;

    return {
      id: data.id,
      title: data.title?.trim() ? data.title : getDefaultConversationTitle(data.id),
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
        (data.execution_status as RuntimeConversationInfo["status"]) ??
        "idle",
      stats: data.stats ?? { usage_to_metrics: {} },
    };
  }

  static async searchConversations(
    limit: number = 20,
    pageId?: string,
  ): Promise<AppConversationPage> {
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
    await createHttpClient().delete(`/api/conversations/${conversationId}`);
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
