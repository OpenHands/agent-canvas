import { useActiveBackend } from "#/contexts/active-backend-context";
import { useUserProviders } from "#/hooks/use-user-providers";

import { RepositorySelectionForm } from "./repo-selection-form";
import { WorkspaceSelectionForm } from "./workspace-selection-form";

export function RepoConnector() {
  const { isLoadingSettings } = useUserProviders();
  const isCloud = useActiveBackend().backend.kind === "cloud";

  // Local (agent-server) backends operate on folders on the host machine, so
  // the launcher shows the workspace picker. Cloud backends run conversations
  // against remote git repositories, so the launcher shows the git provider /
  // repo / branch dropdowns instead.
  return (
    <section
      data-testid="repo-connector"
      className="w-full flex flex-col gap-6 rounded-[12px] p-[20px] border border-[var(--oh-border)] bg-[var(--oh-surface)] min-h-[263.5px] relative"
    >
      {isCloud ? (
        <RepositorySelectionForm isLoadingSettings={isLoadingSettings} />
      ) : (
        <WorkspaceSelectionForm isLoadingSettings={isLoadingSettings} />
      )}
    </section>
  );
}
