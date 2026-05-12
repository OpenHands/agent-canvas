import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileActionsMenu } from "./profile-actions-menu";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { I18nKey } from "#/i18n/declaration";
import ThreeDotsVerticalIcon from "#/icons/three-dots-vertical.svg?react";

interface ProfileRowProps {
  profile: ProfileInfo;
  onEdit: (profile: ProfileInfo) => void;
  onRename: (profile: ProfileInfo) => void;
  onDelete: (profile: ProfileInfo) => void;
}

export function ProfileRow({
  profile,
  onEdit,
  onRename,
  onDelete,
}: ProfileRowProps) {
  const { t } = useTranslation("openhands");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        {profile.api_key_set && (
          <span
            className="text-xs bg-green-600/20 text-green-400 font-medium rounded-full px-2 py-0.5 whitespace-nowrap self-start sm:self-auto"
            data-testid="profile-api-key-badge"
          >
            {t(I18nKey.SETTINGS$PROFILE_API_KEY_SET)}
          </span>
        )}
      </div>
      <div className="relative shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={`${t(I18nKey.SETTINGS$PROFILE_MENU)} for ${profile.name}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={menuOpen ? menuId : undefined}
          className="cursor-pointer text-gray-300 hover:text-white p-2 border border-tertiary rounded-md"
          data-testid="profile-menu-trigger"
        >
          <ThreeDotsVerticalIcon width={16} height={16} />
        </button>
        {menuOpen && (
          <ProfileActionsMenu
            menuId={menuId}
            triggerRef={triggerRef}
            onEdit={() => onEdit(profile)}
            onRename={() => onRename(profile)}
            onDelete={() => onDelete(profile)}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
