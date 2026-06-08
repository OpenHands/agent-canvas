import { AxiosError } from "axios";
import i18n from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import type {
  AppConversation,
  AppConversationStartTask,
} from "#/api/conversation-service/agent-server-conversation-service.types";
import {
  getStoredConversationMetadata,
  setStoredConversationMetadata,
} from "#/api/conversation-metadata-store";
import { queryClient } from "#/query-client-config";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import type { CanvasConversationAction } from "#/types/agent-server/core";

function getRepositoryMetadata(parent: AppConversation) {
  if (!parent.selected_repository) {
    return null;
  }

  return {
    selected_repository: parent.selected_repository,
    selected_branch: parent.selected_branch,
    git_provider: parent.git_provider,
  };
}

function syncChildConversationMetadata(
  parentConversationId: string,
  child: AppConversationStartTask,
  parent: AppConversation,
) {
  if (!child.app_conversation_id) {
    return;
  }

  const parentMetadata = getStoredConversationMetadata(parentConversationId);
  const childMetadata = getStoredConversationMetadata(
    child.app_conversation_id,
  );
  const repositoryMetadata = getRepositoryMetadata(parent);

  setStoredConversationMetadata(child.app_conversation_id, {
    selected_repository:
      repositoryMetadata?.selected_repository ??
      childMetadata?.selected_repository ??
      null,
    selected_branch:
      repositoryMetadata?.selected_branch ??
      childMetadata?.selected_branch ??
      null,
    git_provider:
      repositoryMetadata?.git_provider ?? childMetadata?.git_provider ?? null,
    selected_workspace: parentMetadata?.selected_workspace ?? null,
    active_profile:
      parentMetadata?.active_profile ?? childMetadata?.active_profile ?? null,
  });
}

function getActionPrompt(action: CanvasConversationAction): string | null {
  const prompt = action.prompt?.trim();
  return prompt ? prompt : null;
}

async function getParentConversation(
  parentConversationId: string,
): Promise<AppConversation | null> {
  const [parent] =
    await AgentServerConversationService.batchGetAppConversations([
      parentConversationId,
    ]);
  return parent ?? null;
}

export async function handleCanvasConversationAction(
  action: CanvasConversationAction,
  parentConversationId?: string,
): Promise<void> {
  if (action.command !== "create_child_conversation") {
    return;
  }

  const prompt = getActionPrompt(action);
  if (!prompt) {
    console.warn(
      "[canvas_conversation] Ignoring child conversation request without a prompt.",
    );
    return;
  }

  if (!parentConversationId) {
    console.warn(
      "[canvas_conversation] Ignoring child conversation request without a parent conversation id.",
    );
    return;
  }

  try {
    const parent = await getParentConversation(parentConversationId);
    if (!parent) {
      throw new Error(`Conversation ${parentConversationId} was not found`);
    }

    const child = await AgentServerConversationService.createConversation(
      prompt,
      undefined,
      undefined,
      getRepositoryMetadata(parent),
      parent.workspace?.working_dir ?? undefined,
      undefined,
      undefined,
      parent.sandbox_id ?? undefined,
    );

    syncChildConversationMetadata(parentConversationId, child, parent);

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] }),
      queryClient.invalidateQueries({ queryKey: ["start-tasks"] }),
    ]);

    displaySuccessToast(i18n.t(I18nKey.CONVERSATION$CLEAR_SUCCESS));
  } catch (error) {
    const message =
      error instanceof AxiosError
        ? retrieveAxiosErrorMessage(error)
        : error instanceof Error
          ? error.message
          : null;
    displayErrorToast(message ?? i18n.t(I18nKey.ERROR$GENERIC));
  }
}
