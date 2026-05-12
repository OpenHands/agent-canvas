import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { I18nKey } from "#/i18n/declaration";
import ThreeDotsVerticalIcon from "#/icons/three-dots-vertical.svg?react";
import { ProfileListActionsMenu } from "./profile-list-actions-menu";
import { LoadingSpinner } from "#/components/shared/loading-spinner";

interface ProfileListRowProps {
  profile: ProfileInfo;
  isActive: boolean;
  isActivating: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function ProfileListRow({
  profile,
  isActive,
  isActivating,
  onActivate,
  onEdit,
  onRename,
  onDelete,
}: ProfileListRowProps) {
  const { t } = useTranslation("openhands");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      data-testid="profile-list-row"
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
            className="text-xs bg-amber-600/30 text-amber-300 font-medium rounded-full px-2 py-0.5 whitespace-nowrap self-start sm:self-auto"
            data-testid="profile-active-badge"
          >
            {t(I18nKey.SETTINGS$PROFILE_ACTIVE)}
          </span>
        )}
      </div>
      <div className="relative shrink-0 flex items-center gap-2">
        {isActivating ? <LoadingSpinner size="small" /> : null}
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
          <ProfileListActionsMenu
            isActive={isActive}
            onActivate={onActivate}
            onEdit={onEdit}
            onRename={onRename}
            onDelete={onDelete}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
