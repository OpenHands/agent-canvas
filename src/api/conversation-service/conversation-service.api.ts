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

const FILE_UPLOAD_CONCURRENCY = 5;

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
    const vscodeUrl = await createVSCodeClient(
      this.getClientOverrides(),
    ).getUrl({
      baseUrl:
        typeof window !== "undefined" ? window.location.origin : undefined,
      workspaceDir,
    });

    return { vscode_url: vscodeUrl };
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
    const workspace = createRemoteWorkspace(this.getClientOverrides());
    const uploadFile = async (file: File) => {
      try {
        await workspace.fileUpload(file, `/workspace/${file.name}`);
        return { uploadedFile: file.name, skippedFile: null };
      } catch (error) {
        return {
          uploadedFile: null,
          skippedFile: {
            name: file.name,
            reason: error instanceof Error ? error.message : "Upload failed",
          },
        };
      }
    };

    const results: Awaited<ReturnType<typeof uploadFile>>[] = [];
    for (
      let index = 0;
      index < files.length;
      index += FILE_UPLOAD_CONCURRENCY
    ) {
      const batch = files.slice(index, index + FILE_UPLOAD_CONCURRENCY);
      // eslint-disable-next-line no-await-in-loop
      results.push(...(await Promise.all(batch.map(uploadFile))));
    }

    return {
      uploaded_files: results.flatMap((result) =>
        result.uploadedFile ? [result.uploadedFile] : [],
      ),
      skipped_files: results.flatMap((result) =>
        result.skippedFile ? [result.skippedFile] : [],
      ),
    };
  }
}

export default ConversationService;
