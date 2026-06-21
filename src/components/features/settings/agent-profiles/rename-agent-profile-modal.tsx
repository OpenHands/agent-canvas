import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentProfileSummary } from "#/api/agent-profiles-service/agent-profiles-service.api";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ProfileNameInput } from "#/components/features/settings/llm-profiles/profile-name-input";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { ApiKeyModalBase } from "#/components/features/settings/api-key-modal-base";
import { useRenameAgentProfile } from "#/hooks/mutation/use-rename-agent-profile";
import { isSdkHttpStatusError } from "#/api/agent-server-compatibility";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import { isProfileNameValid } from "#/utils/derive-profile-name";

interface RenameAgentProfileModalProps {
  profile: AgentProfileSummary | null;
  onClose: () => void;
}

export function RenameAgentProfileModal({
  profile,
  onClose,
}: RenameAgentProfileModalProps) {
  const { t } = useTranslation("openhands");
  const [newName, setNewName] = useState("");
  const renameProfile = useRenameAgentProfile();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNewName(profile?.name ?? "");
  }, [profile?.name]);

  if (!profile) return null;

  const isValid = isProfileNameValid(newName, { isRequired: true });
  const isUnchanged = newName === profile.name;

  const handleSubmit = async () => {
    if (!isValid) {
      displayErrorToast(t(I18nKey.SETTINGS$PROFILE_NAME_RULE));
      return;
    }
    if (isUnchanged) {
      onClose();
      return;
    }
    try {
      await renameProfile.mutateAsync({ name: profile.name, newName });
      displaySuccessToast(
        t(I18nKey.SETTINGS$PROFILE_RENAMED, { name: newName }),
      );
      onClose();
    } catch (error) {
      displayErrorToast(
        isSdkHttpStatusError(error, 409)
          ? t(I18nKey.SETTINGS$AGENT_PROFILE_NAME_EXISTS)
          : error instanceof Error
            ? error.message
            : t(I18nKey.ERROR$GENERIC),
      );
    }
  };

  const handleClose = () => {
    if (!renameProfile.isPending) onClose();
  };

  const footer = (
    <>
      <BrandButton
        type="button"
        variant="tertiary"
        onClick={handleClose}
        isDisabled={renameProfile.isPending}
      >
        {t(I18nKey.BUTTON$CANCEL)}
      </BrandButton>
      <BrandButton
        testId="rename-agent-profile-submit"
        type="button"
        variant="primary"
        onClick={handleSubmit}
        isDisabled={renameProfile.isPending || !isValid}
      >
        {renameProfile.isPending ? (
          <LoadingSpinner size="small" />
        ) : (
          t(I18nKey.BUTTON$RENAME)
        )}
      </BrandButton>
    </>
  );

  return (
    <ApiKeyModalBase
      isOpen
      title={t(I18nKey.SETTINGS$PROFILE_RENAME_TITLE)}
      footer={footer}
      onClose={handleClose}
      initialFocusRef={inputRef}
    >
      <div
        data-testid="rename-agent-profile-modal"
        className="flex flex-col gap-3"
      >
        <ProfileNameInput
          ref={inputRef}
          testId="rename-agent-profile-input"
          ruleTestId="rename-agent-profile-rule"
          value={newName}
          onChange={setNewName}
          isRequired
          onKeyDown={(e) => {
            if (e.key === "Enter" && !renameProfile.isPending && isValid) {
              handleSubmit();
            }
          }}
        />
      </div>
    </ApiKeyModalBase>
  );
}
