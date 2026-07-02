import { useTranslation } from "react-i18next";
import type { AgentProfileSummary } from "#/api/agent-profiles-service/agent-profiles-service.api";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { AgentProfileRow } from "./agent-profile-row";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  settingsListContainerClassName,
  settingsListDividerClassName,
} from "#/utils/settings-list-classes";
import { extensionModuleEmptyStateClassName } from "#/utils/extension-module-card-classes";

interface AgentProfilesBodyProps {
  isLoading: boolean;
  loadError: Error | null;
  profiles: AgentProfileSummary[];
  activeId: string | null;
  onActivate: (profile: AgentProfileSummary) => void;
  onEdit: (profile: AgentProfileSummary) => void;
  onRename: (profile: AgentProfileSummary) => void;
  onDuplicate: (profile: AgentProfileSummary) => void;
  onDelete: (profile: AgentProfileSummary) => void;
  isActivating: boolean;
}

export function AgentProfilesBody({
  isLoading,
  loadError,
  profiles,
  activeId,
  onActivate,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  isActivating,
}: AgentProfilesBodyProps) {
  const { t } = useTranslation("openhands");

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        data-testid="agent-profiles-load-error"
        className={extensionModuleEmptyStateClassName}
      >
        <p className="text-sm text-red-400">
          {t(I18nKey.SETTINGS$PROFILES_LOAD_ERROR)}
        </p>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div
        data-testid="agent-profiles-empty"
        className={extensionModuleEmptyStateClassName}
      >
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.SETTINGS$PROFILES_EMPTY)}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        settingsListContainerClassName,
        settingsListDividerClassName,
      )}
    >
      {profiles.map((profile) => (
        <AgentProfileRow
          key={profile.id ?? profile.name}
          profile={profile}
          isActive={profile.id != null && profile.id === activeId}
          onActivate={onActivate}
          onEdit={onEdit}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          isActivating={isActivating}
        />
      ))}
    </div>
  );
}
