import { VSCodeClient } from "@openhands/typescript-client/clients";
import { HttpClient } from "@openhands/typescript-client/client/http-client";
import { RemoteEventsList } from "@openhands/typescript-client/events/remote-events-list";
import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import {
  buildWorkspaceUploadPath,
  getSafeUploadFileName,
  resolveConversationUploadWorkingDir,
} from "#/api/workspace-upload-path";
import {
  GetVSCodeUrlResponse,
  GetTrajectoryResponse,
  FileUploadSuccessResponse,
} from "../open-hands.types";
import { getAgentServerWorkingDir } from "../agent-server-config";
import {
  getAgentServerClientOptions,
  getAgentServerHttpClientOptions,
} from "../agent-server-client-options";
import { AppConversation } from "./agent-server-conversation-service.types";

const FILE_UPLOAD_CONCURRENCY = 5;

class ConversationService {
  private static currentConversation: AppConversation | null = null;

  static setCurrentConversation(
    currentConversation: AppConversation | null,
  ): void {
    this.currentConversation = currentConversation;
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
    const vscodeUrl = await new VSCodeClient(
      getAgentServerClientOptions(this.getClientOverrides()),
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
    const page = await new RemoteEventsList(
      new HttpClient(
        getAgentServerHttpClientOptions(this.getClientOverrides()),
      ),
      conversationId,
    ).search({ limit: 10000 });

    return { trajectory: page.items ?? [] };
  }

  static async uploadFiles(
    conversationId: string,
    files: File[],
  ): Promise<FileUploadSuccessResponse> {
    const workingDir = await resolveConversationUploadWorkingDir(
      conversationId,
      this.currentConversation,
    );
    const workspace = new RemoteWorkspace(
      getAgentServerClientOptions({
        ...this.getClientOverrides(),
        workingDir,
      }),
    );
    const uploadFile = async (file: File) => {
      try {
        const safeName = getSafeUploadFileName(file.name);
        const uploadPath = buildWorkspaceUploadPath(file.name, workingDir);
        await workspace.fileUpload(file, uploadPath);
        return { uploadedFile: safeName, skippedFile: null };
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
