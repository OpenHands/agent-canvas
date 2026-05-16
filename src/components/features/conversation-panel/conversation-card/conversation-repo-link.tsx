import { FaBitbucket, FaGithub, FaGitlab } from "react-icons/fa6";
import { FaCodeBranch } from "react-icons/fa";
import { IconType } from "react-icons/lib";
import { RepositorySelection } from "#/api/open-hands.types";
import { Provider } from "#/types/settings";
import AzureDevOpsLogo from "#/assets/branding/azure-devops-logo.svg?react";

interface ConversationRepoLinkProps {
  selectedRepository: RepositorySelection;
}

const providerIcon: Partial<Record<Provider, IconType>> = {
  bitbucket: FaBitbucket,
  bitbucket_data_center: FaBitbucket,
  github: FaGithub,
  gitlab: FaGitlab,
};

export function ConversationRepoLink({
  selectedRepository,
}: ConversationRepoLinkProps) {
  const Icon = selectedRepository.git_provider
    ? providerIcon[selectedRepository.git_provider]
    : null;

  return (
    <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {Icon && <Icon size={14} className="text-[var(--oh-muted)]" />}
        {selectedRepository.git_provider === "azure_devops" && (
          <AzureDevOpsLogo className="text-[var(--oh-muted)] w-[14px] h-[14px]" />
        )}
        <span
          data-testid="conversation-card-selected-repository"
          className="text-xs text-[var(--oh-muted)] truncate min-w-0"
        >
          {selectedRepository.selected_repository}
        </span>
      </div>
      <div className="flex items-center gap-1 min-w-0 max-w-[45%] shrink">
        <FaCodeBranch size={12} className="text-[var(--oh-muted)]" />

        <span
          data-testid="conversation-card-selected-branch"
          className="text-xs text-[var(--oh-muted)] truncate min-w-0"
        >
          {selectedRepository.selected_branch}
        </span>
      </div>
    </div>
  );
}
