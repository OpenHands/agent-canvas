import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileActionsMenu } from "./profile-actions-menu";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { I18nKey } from "#/i18n/declaration";
import ThreeDotsVerticalIcon from "#/icons/three-dots-vertical.svg?react";

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
            className="text-sm text-gray-400 truncate min-w-0 max-w-full"
            title={profile.model}
          >
            {profile.model}
          </span>
        ) : null}
        {isActive && (
          <span
            className="text-xs bg-success text-white font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap self-start sm:self-auto"
            data-testid="profile-active-badge"
          >
            {t(I18nKey.SETTINGS$PROFILE_ACTIVE)}
          </span>
        )}
      </div>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={t(I18nKey.SETTINGS$PROFILE_MENU)}
          className="cursor-pointer text-gray-300 hover:text-white p-2 border border-tertiary rounded-md"
          data-testid="profile-menu-trigger"
        >
          <ThreeDotsVerticalIcon width={16} height={16} />
        </button>
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
