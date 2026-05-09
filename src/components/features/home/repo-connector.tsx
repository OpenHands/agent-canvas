import { useUserProviders } from "#/hooks/use-user-providers";

import { WorkspaceSelectionForm } from "./workspace-selection-form";

export function RepoConnector() {
  const { isLoadingSettings } = useUserProviders();

  // Agent-canvas talks directly to an `agent_server` backend (there is no
  // hosted/cloud backend in this build), so the home screen always shows the
  // local-workspace launcher rather than a git repository picker. If/when a
  // cloud backend is supported, this component should branch on the backend
  // mode and render <RepositorySelectionForm /> instead.
  return (
    <section
      data-testid="repo-connector"
      className="w-full flex flex-col gap-6 rounded-[12px] p-[20px] border border-[#727987] bg-[#26282D] min-h-[263.5px] relative"
    >
      <WorkspaceSelectionForm isLoadingSettings={isLoadingSettings} />
    </section>
  );
}
