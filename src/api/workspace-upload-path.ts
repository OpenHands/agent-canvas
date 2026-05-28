import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { getAgentServerWorkingDir } from "#/api/agent-server-config";
import { getStoredConversationMetadata } from "#/api/conversation-metadata-store";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getSafeUploadFileName(fileName: string): string {
  const parts = fileName.split(/[\\/]+/).filter(Boolean);
  const safeName = parts[parts.length - 1];

  if (!safeName || safeName === "." || safeName === "..") {
    throw new Error("Invalid file name");
  }

  return safeName;
}

/** Normalize agent-server working_dir values to absolute sandbox paths. */
export function toAbsoluteWorkspacePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export function buildWorkspaceUploadPath(
  fileName: string,
  workingDir: string,
): string {
  const safeName = getSafeUploadFileName(fileName);
  const base = toAbsoluteWorkspacePath(workingDir.replace(/\/+$/, ""));
  return `${base}/${safeName}`;
}

export async function resolveConversationUploadWorkingDir(
  conversationId: string,
  currentConversation?: AppConversation | null,
): Promise<string> {
  if (
    currentConversation?.id === conversationId &&
    currentConversation.workspace?.working_dir?.trim()
  ) {
    return currentConversation.workspace.working_dir.trim();
  }

  const stored = getStoredConversationMetadata(conversationId);
  if (stored?.selected_workspace?.trim()) {
    return stored.selected_workspace.trim();
  }

  if (UUID_PATTERN.test(conversationId)) {
    return AgentServerConversationService.resolveConversationWorkingDir(
      conversationId,
    );
  }

  return getAgentServerWorkingDir();
}
