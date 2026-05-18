import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ContextMenuListItem } from "../context-menu/context-menu-list-item";
import { SettingsNavHeader } from "../settings/settings-nav-header";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import CircuitIcon from "#/icons/u-circuit.svg?react";
import SettingsIcon from "#/icons/settings.svg?react";
import CheckIcon from "#/icons/checkmark.svg?react";
import { cn } from "#/utils/utils";
import type { ProfileInfo } from "#/api/profiles-service/profiles-service.api";

const rowClassName = cn(
  "h-auto w-full flex items-center gap-3 px-3 py-2.5 rounded",
  "text-start hover:bg-white/10 cursor-pointer text-nowrap",
);

interface SwitchProfileContextMenuProps {
  profiles: ProfileInfo[];
  activeProfileName: string | null;
  onSelect: (profileName: string) => void;
  onClose: () => void;
}

export function SwitchProfileContextMenu({
  profiles,
  activeProfileName,
  onSelect,
  onClose,
}: SwitchProfileContextMenuProps) {
  const { t } = useTranslation("openhands");
  const ref = useClickOutsideElement<HTMLUListElement>(onClose);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSelect = (
    event: React.MouseEvent<HTMLButtonElement>,
    name: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(name);
    onClose();
  };

  return (
    <ContextMenu
      ref={ref}
      testId="switch-profile-context-menu"
      position="top"
      alignment="left"
      className="z-[60] left-0 mb-2 bottom-full min-w-[280px] max-h-[60vh] overflow-y-auto p-1"
    >
      <SettingsNavHeader
        text={I18nKey.SETTINGS$AVAILABLE_PROFILES}
        className="px-3 pt-2 pb-2"
      />
      {profiles.map((profile) => {
        const isActive = profile.name === activeProfileName;
        return (
          <ContextMenuListItem
            key={profile.name}
            testId={`switch-profile-option-${profile.name}`}
            onClick={(event) => handleSelect(event, profile.name)}
            className={cn(rowClassName, isActive && "bg-[#5C5D62]")}
          >
            <CircuitIcon width={16} height={16} className="shrink-0" />
            <span
              className="flex min-w-0 flex-1 flex-col gap-0.5"
              title={profile.model ?? undefined}
            >
              <span className="text-sm leading-5">{profile.name}</span>
              {profile.model && (
                <span className="truncate text-xs leading-4 text-[var(--oh-muted)]">
                  {profile.model}
                </span>
              )}
            </span>
            {isActive && (
              <CheckIcon width={14} height={14} className="shrink-0" />
            )}
          </ContextMenuListItem>
        );
      })}
      <Divider />
      <NavigationLink
        to="/settings"
        onClick={onClose}
        data-testid="switch-profile-open-settings"
        className={rowClassName}
      >
        <SettingsIcon width={16} height={16} className="shrink-0" />
        <span className="text-sm leading-5">
          {t(I18nKey.MODEL$OPEN_SETTINGS)}
        </span>
      </NavigationLink>
    </ContextMenu>
  );
}
