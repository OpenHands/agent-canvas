import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { CustomChatInput } from "#/components/features/chat/custom-chat-input";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useModelInterceptor } from "#/hooks/chat/use-model-interceptor";
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

  const hasSelection = isLocal
    ? !!pendingWorkspace
    : !!pendingRepository && !!pendingBranch;

  const handleSubmit = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || isCreating) return;

    // Workspace/repo are optional — match the "Start from scratch" flow which
    // creates a conversation with no working dir and no repo. Build the
    // payload from whatever is selected.
    let variables: Parameters<typeof createConversation>[0] = {
      query: trimmed,
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
      onSuccess: (data) => {
        toast.dismiss(toastId);
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
      className="flex w-full max-w-[800px] flex-col gap-4 md:px-4"
    >
      <div className="flex w-full justify-center">
        <HomeHeaderTitle />
      </div>

      <div className="w-full">
        <CustomChatInput
          onSubmit={handleSubmitWithModelGuard}
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
