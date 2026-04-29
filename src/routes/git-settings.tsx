import { useConfig } from "#/hooks/query/use-config";
import { useSettings } from "#/hooks/query/use-settings";
import { GIT_PROVIDER_TOKENS_UNSUPPORTED_MESSAGE } from "#/api/secrets-service";
import { GitSettingInputsSkeleton } from "#/components/features/settings/git-settings/github-settings-inputs-skeleton";
import { ProjectManagementIntegration } from "#/components/features/settings/project-management/project-management-integration";
import { createPermissionGuard } from "#/utils/org/permission-guard";

export const clientLoader = createPermissionGuard("manage_integrations");

function GitSettingsScreen() {
  const { isLoading } = useSettings();
  const { data: config } = useConfig();

  const shouldRenderProjectManagementIntegrations =
    config?.feature_flags?.enable_jira ||
    config?.feature_flags?.enable_jira_dc ||
    config?.feature_flags?.enable_linear;

  return (
    <div data-testid="git-settings-screen" className="flex flex-col h-full gap-6">
      {isLoading && <GitSettingInputsSkeleton />}

      {!isLoading && (
        <div className="flex flex-col gap-6">
          {shouldRenderProjectManagementIntegrations && (
            <div className="mt-6">
              <ProjectManagementIntegration />
            </div>
          )}

          <div
            data-testid="git-provider-settings-unavailable"
            className="rounded-lg border border-tertiary bg-tertiary p-4"
          >
            <p className="text-sm text-primary">
              {GIT_PROVIDER_TOKENS_UNSUPPORTED_MESSAGE}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default GitSettingsScreen;
