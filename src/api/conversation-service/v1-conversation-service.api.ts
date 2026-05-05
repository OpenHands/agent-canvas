import { Provider } from "#/types/settings";
import { SuggestedTask } from "#/utils/types";
import {
  buildConversationWorkingDir,
  getAgentServerBaseUrl,
  getAgentServerWorkingDir,
  getVSCodeBaseUrl,
} from "../agent-server-config";
import {
  DirectConversationInfo,
  buildStartConversationRequest,
  downloadTextFile,
  emptyHooksResponse,
  getDefaultConversationTitle,
  loadSkillsForConversation,
  toV1AppConversation,
  toV1ConversationPage,
} from "../agent-server-adapter";
import { ConversationTrigger, GetVSCodeUrlResponse } from "../open-hands.types";
import {
  createHttpClient,
  createRemoteWorkspace,
  createVSCodeClient,
} from "../typescript-client";
import SettingsService from "../settings-service/settings-service.api";
import type {
  GetHooksResponse,
  GetSkillsResponse,
  PluginSpec,
  V1AppConversation,
  V1AppConversationPage,
  V1AppConversationStartRequest,
  V1AppConversationStartTask,
  V1RuntimeConversationInfo,
  V1SendMessageRequest,
  V1SendMessageResponse,
} from "./v1-conversation-service.types";

class V1ConversationService {
  static async sendMessage(
    conversationId: string,
    message: V1SendMessageRequest,
  ): Promise<V1SendMessageResponse> {
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
  ): Promise<V1AppConversationStartTask> {
    const settings = await SettingsService.getSettings();
    const conversationId = crypto.randomUUID();
    const workingDir = buildConversationWorkingDir(conversationId);
    const payload = buildStartConversationRequest({
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

    return {
      id: data.id,
      created_by_user_id: null,
      status: "READY",
      detail: null,
      app_conversation_id: data.id,
      agent_server_url: getAgentServerBaseUrl(),
      request: {
        initial_message: payload.initial_message as
          | V1AppConversationStartRequest["initial_message"]
          | undefined,
        plugins: plugins ?? null,
      },
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  static async getStartTask(
    _taskId: string,
  ): Promise<V1AppConversationStartTask | null> {
    return null;
  }

  static async searchStartTasks(
    _limit: number = 100,
  ): Promise<V1AppConversationStartTask[]> {
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
      baseUrl: getVSCodeBaseUrl(),
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
  ): Promise<(V1AppConversation | null)[]> {
    if (ids.length === 0) return [];

    const response = await createHttpClient().get<
      (DirectConversationInfo | null)[]
    >("/api/conversations", { params: { ids } });

    return response.data.map((item) =>
      item ? toV1AppConversation(item) : null,
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
  ): Promise<V1AppConversation> {
    const results = await this.batchGetAppConversations([conversationId]);
    return results[0] as V1AppConversation;
  }

  static async updateConversationRepository(
    conversationId: string,
    _repository: string | null,
    _branch?: string | null,
    _gitProvider?: string | null,
  ): Promise<V1AppConversation> {
    const results = await this.batchGetAppConversations([conversationId]);
    return results[0] as V1AppConversation;
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
  ): Promise<V1RuntimeConversationInfo> {
    const response = await createHttpClient({ sessionApiKey }).get<
      DirectConversationInfo & { stats?: V1RuntimeConversationInfo["stats"] }
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
        (data.execution_status as V1RuntimeConversationInfo["status"]) ??
        "idle",
      stats: data.stats ?? { usage_to_metrics: {} },
    };
  }

  static async searchConversations(
    limit: number = 20,
    pageId?: string,
  ): Promise<V1AppConversationPage> {
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

    return toV1ConversationPage(response.data);
  }

  static async deleteConversation(conversationId: string): Promise<void> {
    await createHttpClient().delete(`/api/conversations/${conversationId}`);
  }

  static async updateConversationTitle(
    conversationId: string,
    title: string,
  ): Promise<V1AppConversation> {
    await createHttpClient().patch(`/api/conversations/${conversationId}`, {
      title,
    });
    const [conversation] = await this.batchGetAppConversations([
      conversationId,
    ]);
    return conversation as V1AppConversation;
  }
}

export default V1ConversationService;
