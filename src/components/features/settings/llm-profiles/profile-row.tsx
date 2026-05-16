import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileActionsMenu } from "./profile-actions-menu";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { I18nKey } from "#/i18n/declaration";
import { EllipsisButton } from "#/components/features/conversation-panel/ellipsis-button";
import { BrandBadge } from "#/components/shared/badge";

interface ProfileRowProps {
  profile: ProfileInfo;
  isActive: boolean;
  onActivate: (name: string) => void;
  onEdit: (profile: ProfileInfo) => void;
  onRename: (profile: ProfileInfo) => void;
  onDelete: (profile: ProfileInfo) => void;
  isActivating: boolean;
}

export function ProfileRow({
  profile,
  isActive,
  onActivate,
  onEdit,
  onRename,
  onDelete,
  isActivating,
}: ProfileRowProps) {
  const { t } = useTranslation("openhands");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      data-testid="profile-row"
      className="flex items-center justify-between gap-3 px-5 py-4"
    >
      <div className="flex flex-col gap-1 min-w-0 flex-1 sm:flex-row sm:items-center sm:gap-3">
        <span
          className="font-medium text-white truncate min-w-0 max-w-full"
          title={profile.name}
        >
          {profile.name}
        </span>
        {profile.model ? (
          <span
            className="text-sm text-[var(--oh-muted)] truncate min-w-0 max-w-full"
            title={profile.model}
          >
            {profile.model}
          </span>
        ) : null}
        {isActive && (
          <BrandBadge
            className="text-xs px-2.5 py-1 whitespace-nowrap self-start sm:self-auto"
            data-testid="profile-active-badge"
          >
            {t(I18nKey.SETTINGS$PROFILE_ACTIVE)}
          </BrandBadge>
        )}
      </div>
      <div className="relative shrink-0">
        <EllipsisButton
          onClick={() => setMenuOpen((open) => !open)}
          ariaLabel={t(I18nKey.SETTINGS$PROFILE_MENU)}
          testId="profile-menu-trigger"
        />
        {menuOpen && (
          <ProfileActionsMenu
            onEdit={() => onEdit(profile)}
            onRename={() => onRename(profile)}
            onSetActive={() => onActivate(profile.name)}
            onDelete={() => onDelete(profile)}
            isActive={isActive}
            isActivating={isActivating}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
