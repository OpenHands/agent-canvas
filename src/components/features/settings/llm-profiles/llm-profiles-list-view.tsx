import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { RenameProfileModal } from "./rename-profile-modal";
import { DeleteProfileModal } from "./delete-profile-modal";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { I18nKey } from "#/i18n/declaration";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useActivateLlmProfile } from "#/hooks/mutation/use-activate-llm-profile";
import { ProfileListRow } from "./profile-list-row";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

interface LlmProfilesListViewProps {
  onAddProfile: () => void;
  onEditProfile: (profile: ProfileInfo) => void;
}

export function LlmProfilesListView({
  onAddProfile,
  onEditProfile,
}: LlmProfilesListViewProps) {
  const { t } = useTranslation("openhands");
  const { data, isLoading, error } = useLlmProfiles();
  const activateProfile = useActivateLlmProfile();
  const [profileToRename, setProfileToRename] = useState<ProfileInfo | null>(
    null,
  );
  const [profileToDelete, setProfileToDelete] = useState<ProfileInfo | null>(
    null,
  );

  const profiles = data?.profiles ?? [];
  const activeProfile = data?.active_profile ?? null;

  const handleActivate = async (profile: ProfileInfo) => {
    try {
      await activateProfile.mutateAsync(profile.name);
      displaySuccessToast(
        t(I18nKey.SETTINGS$PROFILE_ACTIVATED, { name: profile.name }),
      );
    } catch {
      displayErrorToast(t(I18nKey.ERROR$GENERIC));
    }
  };

  const handleEdit = (profile: ProfileInfo) => {
    onEditProfile(profile);
  };

  // Header with Add button
  const renderHeader = () => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-white">
        {t(I18nKey.SETTINGS$AVAILABLE_PROFILES)}
      </h2>
      <BrandButton
        testId="add-llm-profile"
        type="button"
        variant="primary"
        onClick={onAddProfile}
      >
        {t(I18nKey.SETTINGS$ADD_LLM_PROFILE)}
      </BrandButton>
    </div>
  );

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {renderHeader()}
        <div className="flex justify-center p-4">
          <LoadingSpinner size="large" />
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        {renderHeader()}
        <p className="text-sm text-red-400">
          {t(I18nKey.SETTINGS$PROFILES_LOAD_ERROR)}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {renderHeader()}

        {profiles.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            {t(I18nKey.SETTINGS$PROFILES_EMPTY)}
          </p>
        ) : (
          <div className="border border-tertiary rounded-md divide-y divide-tertiary">
            {profiles.map((profile) => (
              <ProfileListRow
                key={profile.name}
                profile={profile}
                isActive={profile.name === activeProfile}
                isActivating={
                  activateProfile.isPending &&
                  activateProfile.variables === profile.name
                }
                onActivate={() => handleActivate(profile)}
                onEdit={() => handleEdit(profile)}
                onRename={() => setProfileToRename(profile)}
                onDelete={() => setProfileToDelete(profile)}
              />
            ))}
          </div>
        )}
      </div>

      <RenameProfileModal
        profile={profileToRename}
        onClose={() => setProfileToRename(null)}
      />
      <DeleteProfileModal
        profile={profileToDelete}
        onClose={() => setProfileToDelete(null)}
      />
    </>
  );
}
