import { WorkModeCloudGuard } from "#/components/features/work/work-mode-cloud-guard";
import { WorkSettingsForm } from "#/components/features/work/work-settings-form";
import { useWorkManifest } from "#/hooks/query/use-work-manifest";
import { useWorkModeAvailability } from "#/hooks/use-work-mode-availability";
import { AppSettingsInputsSkeleton } from "#/components/features/settings/app-settings/app-settings-inputs-skeleton";

export function WorkSettingsScreen() {
  const { workAllowed } = useWorkModeAvailability();
  const { data: manifest, isLoading } = useWorkManifest();

  if (!workAllowed) {
    return <WorkModeCloudGuard />;
  }

  if (isLoading || !manifest) {
    return <AppSettingsInputsSkeleton />;
  }

  return <WorkSettingsForm manifest={manifest} variant="full" />;
}

export default WorkSettingsScreen;
