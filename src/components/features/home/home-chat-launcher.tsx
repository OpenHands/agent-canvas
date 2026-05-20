import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { CustomChatInput } from "#/components/features/chat/custom-chat-input";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useModelInterceptor } from "#/hooks/chat/use-model-interceptor";
import { useChatAttachmentUpload } from "#/hooks/chat/use-chat-attachment-upload";
import { useConversationStore } from "#/stores/conversation-store";
import { useOptimisticUserMessageStore } from "#/stores/optimistic-user-message-store";
import { setPendingTaskAttachments } from "#/stores/pending-task-attachments-store";
import { sendMessageWithAttachments } from "#/utils/send-message-with-attachments";
import { useNavigation } from "#/context/navigation-context";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { Branch, GitRepository } from "#/types/git";
import { Provider } from "#/types/settings";
import { LocalWorkspace } from "#/types/workspace";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  TOAST_OPTIONS,
} from "#/utils/custom-toast-handlers";
import { HomeHeaderTitle } from "./home-header/home-header-title";
import { OpenLauncherButton } from "./open-launcher-button";
import { OpenWorkspaceDialog } from "./open-workspace-dialog";
import { OpenRepositoryDialog } from "./open-repository-dialog";
import { HomeGitControlBarPreview } from "./home-git-control-bar-preview";

export function HomeChatLauncher() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const { navigate } = useNavigation();
  const isLocal = backend.kind === "local";

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingWorkspace, setPendingWorkspace] =
    useState<LocalWorkspace | null>(null);
  const [pendingRepository, setPendingRepository] =
    useState<GitRepository | null>(null);
  const [pendingBranch, setPendingBranch] = useState<Branch | null>(null);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);

  const { mutate: createConversation, isPending } = useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isCreating = isPending || isCreatingElsewhere;
  const { images, files, imagesMarkedUploadAsFile, clearAllFiles } =
    useConversationStore();
  const enqueuePendingMessage = useOptimisticUserMessageStore(
    (state) => state.enqueuePendingMessage,
  );
  const { handleUpload } = useChatAttachmentUpload();

  const hasSelection = isLocal
    ? !!pendingWorkspace
    : !!pendingRepository && !!pendingBranch;

  const handleSubmit = (message: string) => {
    const trimmed = message.trim();
    const hasAttachments = images.length > 0 || files.length > 0;
    if ((!trimmed && !hasAttachments) || isCreating) return;

    const attachmentSnapshot = {
      images: [...images],
      files: [...files],
    };

    // Workspace/repo are optional — match the "Start from scratch" flow which
    // creates a conversation with no working dir and no repo. Build the
    // payload from whatever is selected.
    let variables: Parameters<typeof createConversation>[0] = {
      query: trimmed || undefined,
    };
    if (isLocal && pendingWorkspace) {
      variables = { ...variables, workingDir: pendingWorkspace.path };
    } else if (!isLocal && pendingRepository && pendingBranch) {
      variables = {
        ...variables,
        repository: {
          name: pendingRepository.full_name,
          gitProvider: pendingRepository.git_provider,
          branch: pendingBranch.name,
        },
      };
    }

    // Loading toast gives the user a clear signal that the request is in
    // flight; dismissed precisely once the mutation resolves.
    const toastId = toast.loading(
      t(I18nKey.HOME$CREATING_CONVERSATION),
      TOAST_OPTIONS,
    );

    createConversation(variables, {
      onSuccess: async (data) => {
        toast.dismiss(toastId);

        if (hasAttachments) {
          const isProvisioningTask = data.conversation_id.startsWith("task-");

          if (isProvisioningTask) {
            if (!data.task_id) {
              displayErrorToast(null);
              return;
            }

            setPendingTaskAttachments(data.task_id, {
              content: trimmed,
              images: attachmentSnapshot.images,
              files: attachmentSnapshot.files,
              imagesMarkedUploadAsFile: [...imagesMarkedUploadAsFile],
            });
            clearAllFiles();
          } else {
            try {
              const sent = await sendMessageWithAttachments({
                conversationId: data.conversation_id,
                content: trimmed,
                images: attachmentSnapshot.images,
                files: attachmentSnapshot.files,
                imagesMarkedUploadAsFile,
                t,
              });
              enqueuePendingMessage({
                conversationId: data.conversation_id,
                text: sent.text,
                content: sent.content,
                imageUrls: sent.imageUrls,
                fileUrls: sent.fileUrls,
                timestamp: sent.timestamp,
              });
              clearAllFiles();
            } catch (error) {
              displayErrorToast(error instanceof Error ? error.message : null);
              return;
            }
          }
        }

        navigate(`/conversations/${data.conversation_id}`);
      },
      onError: (error) => {
        toast.dismiss(toastId);
        displayErrorToast(error instanceof Error ? error.message : null);
      },
    });
  };

  // Without this wrapper a `/model NAME` typed here would become the first
  // user message of the new conversation. The interceptor activates the
  // profile globally (null conversationId path) so the next conversation
  // launches with it.
  const handleSubmitWithModelGuard = useModelInterceptor(null, handleSubmit);

  return (
    <div
      data-testid="home-chat-launcher"
      className="w-full max-w-[800px] flex flex-col gap-4 pl-0 md:pl-4 pr-0 md:pr-4"
    >
      <div className="flex justify-center">
        <HomeHeaderTitle />
      </div>

      <div className="w-full">
        <CustomChatInput
          onSubmit={handleSubmitWithModelGuard}
          onFilesPaste={handleUpload}
          disabled={isCreating}
        />
      </div>

      <div className="flex justify-start">
        {hasSelection ? (
          <HomeGitControlBarPreview
            workspace={pendingWorkspace}
            repository={pendingRepository}
            branch={pendingBranch}
            provider={pendingProvider}
            onRepoClick={() => setIsDialogOpen(true)}
          />
        ) : (
          <OpenLauncherButton
            kind={isLocal ? "local" : "cloud"}
            onClick={() => setIsDialogOpen(true)}
            disabled={isCreating}
          />
        )}
      </div>

      {isLocal ? (
        <OpenWorkspaceDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onConfirm={(workspace) => {
            setPendingWorkspace(workspace);
            setPendingRepository(null);
            setPendingBranch(null);
            setPendingProvider(null);
          }}
        />
      ) : (
        <OpenRepositoryDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onConfirm={({ repository, branch, provider }) => {
            setPendingRepository(repository);
            setPendingBranch(branch);
            setPendingProvider(provider ?? repository.git_provider);
            setPendingWorkspace(null);
          }}
        />
      )}
    </div>
  );
}
