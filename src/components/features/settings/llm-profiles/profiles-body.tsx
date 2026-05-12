import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { ProfileRow } from "./profile-row";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { I18nKey } from "#/i18n/declaration";

interface ProfilesBodyProps {
  isLoading: boolean;
  loadError: Error | null;
  profiles: ProfileInfo[];
  onEdit: (profile: ProfileInfo) => void;
  onRename: (profile: ProfileInfo) => void;
  onDelete: (profile: ProfileInfo) => void;
}

export function ProfilesBody({
  isLoading,
  loadError,
  profiles,
  onEdit,
  onRename,
  onDelete,
}: ProfilesBodyProps) {
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
      <p className="text-sm text-red-400">
        {t(I18nKey.SETTINGS$PROFILES_LOAD_ERROR)}
      </p>
    );
  }

  if (profiles.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">
        {t(I18nKey.SETTINGS$PROFILES_EMPTY)}
      </p>
    );
  }

  return (
    <div className="border border-tertiary rounded-md divide-y divide-tertiary">
      {profiles.map((profile) => (
        <ProfileRow
          key={profile.name}
          profile={profile}
          onEdit={onEdit}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
