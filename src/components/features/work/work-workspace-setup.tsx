import type { WorkManifest } from "#/types/work-manifest";
import { WorkSettingsForm } from "#/components/features/work/work-settings-form";

interface WorkWorkspaceSetupProps {
  manifest: WorkManifest;
}

export function WorkWorkspaceSetup({ manifest }: WorkWorkspaceSetupProps) {
  return (
    <div data-testid="work-workspace-setup">
      <WorkSettingsForm
        manifest={manifest}
        variant="compact"
        testIdPrefix="work-setup"
      />
    </div>
  );
}
