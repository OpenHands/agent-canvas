import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { RenameProfileModal } from "./rename-profile-modal";
import { DeleteProfileModal } from "./delete-profile-modal";
import { ProfilesBody } from "./profiles-body";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useActivateLlmProfile } from "#/hooks/mutation/use-activate-llm-profile";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";

interface LlmProfilesManagerProps {
  onAddProfile?: () => void;
  onEditProfile?: (profile: ProfileInfo) => void;
}

export function LlmProfilesManager({
  onAddProfile,
  onEditProfile,
}: LlmProfilesManagerProps) {
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
  const active = data?.active_profile ?? null;

  const handleActivate = async (name: string) => {
    try {
      await activateProfile.mutateAsync(name);
      displaySuccessToast(t(I18nKey.SETTINGS$PROFILE_ACTIVATED, { name }));
    } catch (error) {
      console.error("Failed to activate profile:", error);
      displayErrorToast(t(I18nKey.ERROR$GENERIC));
    }
  };

  const handleEdit = (profile: ProfileInfo) => {
    onEditProfile?.(profile);
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">
            {t(I18nKey.SETTINGS$AVAILABLE_PROFILES)}
          </h2>
          {onAddProfile ? (
            <BrandButton
              testId="add-llm-profile"
              type="button"
              variant="secondary"
              className="ml-auto"
              onClick={onAddProfile}
            >
              {t(I18nKey.SETTINGS$ADD_LLM_PROFILE)}
            </BrandButton>
          ) : null}
        </div>

        <ProfilesBody
          isLoading={isLoading}
          loadError={error ?? null}
          profiles={profiles}
          active={active}
          onActivate={handleActivate}
          onEdit={handleEdit}
          onRename={setProfileToRename}
          onDelete={setProfileToDelete}
          isActivating={activateProfile.isPending}
        />
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
