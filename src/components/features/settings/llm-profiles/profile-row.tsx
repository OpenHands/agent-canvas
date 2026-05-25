import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileActionsMenu } from "./profile-actions-menu";
import { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import { I18nKey } from "#/i18n/declaration";
import { EllipsisButton } from "#/components/features/conversation-panel/ellipsis-button";
import { BrandBadge } from "#/components/shared/badge";
import { cn } from "#/utils/utils";
import {
  settingsListIconActionButtonClassName,
  settingsListRowClassName,
} from "#/utils/settings-list-classes";

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
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      data-testid="profile-row"
      className={cn(settingsListRowClassName, "justify-between gap-3")}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="min-w-0 max-w-full truncate text-sm font-medium text-white"
          title={profile.name}
        >
          {profile.name}
        </span>
        {profile.model ? (
          <span
            className="min-w-0 max-w-full truncate text-sm text-[var(--oh-muted)]"
            title={profile.model}
          >
            {profile.model}
          </span>
        ) : null}
        {isActive && (
          <BrandBadge
            className="shrink-0 whitespace-nowrap px-2.5 py-1 text-xs"
            data-testid="profile-active-badge"
          >
            {t(I18nKey.SETTINGS$PROFILE_ACTIVE)}
          </BrandBadge>
        )}
      </div>
      <div className="relative shrink-0">
        <EllipsisButton
          ref={triggerRef}
          onClick={() => setMenuOpen((open) => !open)}
          ariaLabel={t(I18nKey.SETTINGS$PROFILE_MENU)}
          testId="profile-menu-trigger"
          className={settingsListIconActionButtonClassName}
        />
        {menuOpen && (
          <ProfileActionsMenu
            anchorRef={triggerRef}
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
