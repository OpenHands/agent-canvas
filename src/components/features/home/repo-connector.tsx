import { useActiveBackend } from "#/contexts/active-backend-context";
import { useUserProviders } from "#/hooks/use-user-providers";
import { GitRepository } from "#/types/git";

import { ConnectToProviderMessage } from "./connect-to-provider-message";
import { RepositorySelectionForm } from "./repo-selection-form";
import { WorkspaceSelectionForm } from "./workspace-selection-form";

interface RepoConnectorProps {
  onRepoSelection: (repo: GitRepository | null) => void;
}

export function RepoConnector({ onRepoSelection }: RepoConnectorProps) {
  const { isLoadingSettings, providers } = useUserProviders();
  const isCloud = useActiveBackend().backend.kind === "cloud";

  let content = (
    <WorkspaceSelectionForm isLoadingSettings={isLoadingSettings} />
  );

  if (isCloud) {
    content =
      providers.length > 0 ? (
        <RepositorySelectionForm
          onRepoSelection={onRepoSelection}
          isLoadingSettings={isLoadingSettings}
        />
      ) : (
        <ConnectToProviderMessage />
      );
  }

  return (
    <section
      data-testid="repo-connector"
      className="w-full flex flex-col gap-6 rounded-[12px] p-[20px] border border-[#727987] bg-[#26282D] min-h-[263.5px] relative"
    >
      {content}
    </section>
  );
}
