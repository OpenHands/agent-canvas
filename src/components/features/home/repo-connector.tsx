import { LaunchTabs } from "./launch-tabs";
import { useUserProviders } from "#/hooks/use-user-providers";
import { GitRepository } from "#/types/git";

interface RepoConnectorProps {
  onRepoSelection: (repo: GitRepository | null) => void;
}

export function RepoConnector({ onRepoSelection }: RepoConnectorProps) {
  const { isLoadingSettings } = useUserProviders();

  return (
    <section
      data-testid="repo-connector"
      className="w-full min-w-0 md:flex-1 md:basis-0 flex flex-col gap-6 rounded-[12px] p-[20px] border border-[#727987] bg-[#26282D] min-h-[263.5px] relative"
    >
      <LaunchTabs
        onRepoSelection={onRepoSelection}
        isLoadingSettings={isLoadingSettings}
      />
    </section>
  );
}
