import { getAgentServerWorkingDir } from "../agent-server-config";
import {
  GetVSCodeUrlResponse,
  GetTrajectoryResponse,
  FileUploadSuccessResponse,
} from "../open-hands.types";
import {
  createRemoteEventsList,
  createRemoteWorkspace,
  createVSCodeClient,
} from "../typescript-client";
import { AppConversation } from "./agent-server-conversation-service.types";

class ConversationService {
  private static currentConversation: AppConversation | null = null;

  static getCurrentConversation(): AppConversation | null {
    return this.currentConversation;
  }

  static setCurrentConversation(
    currentConversation: AppConversation | null,
  ): void {
    this.currentConversation = currentConversation;
  }

  static getConversationUrl(conversationId: string): string {
    if (this.currentConversation?.id === conversationId) {
      if (this.currentConversation.conversation_url) {
        return this.currentConversation.conversation_url;
      }
    }
    return `/api/conversations/${conversationId}`;
  }

  private static getClientOverrides() {
    return {
      sessionApiKey: this.currentConversation?.session_api_key,
    };
  }

  static async getVSCodeUrl(
    conversationId: string,
  ): Promise<GetVSCodeUrlResponse> {
    const workspaceDir =
      this.currentConversation?.id === conversationId
        ? (this.currentConversation?.workspace?.working_dir ??
          getAgentServerWorkingDir())
        : getAgentServerWorkingDir();
    const vscode_url = await createVSCodeClient(
      this.getClientOverrides(),
    ).getUrl({
      baseUrl:
        typeof window !== "undefined" ? window.location.origin : undefined,
      workspaceDir,
    });

    return { vscode_url };
  }

  static async getTrajectory(
    conversationId: string,
  ): Promise<GetTrajectoryResponse> {
    const page = await createRemoteEventsList(
      conversationId,
      this.getClientOverrides(),
    ).search({ limit: 10000 });

    return { trajectory: page.items ?? [] };
  }

  static async uploadFiles(
    _conversationId: string,
    files: File[],
  ): Promise<FileUploadSuccessResponse> {
    const uploaded_files: string[] = [];
    const skipped_files: { name: string; reason: string }[] = [];
    const workspace = createRemoteWorkspace(this.getClientOverrides());

    for (const file of files) {
      try {
        await workspace.fileUpload(file, `/workspace/${file.name}`);
        uploaded_files.push(file.name);
      } catch (error) {
        skipped_files.push({
          name: file.name,
          reason: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }

    return { uploaded_files, skipped_files };
  }
}

export default ConversationService;
