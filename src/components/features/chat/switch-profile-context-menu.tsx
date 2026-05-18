import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import { Typography } from "#/ui/typography";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ContextMenuListItem } from "../context-menu/context-menu-list-item";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import CircuitIcon from "#/icons/u-circuit.svg?react";
import SettingsIcon from "#/icons/settings.svg?react";
import CheckIcon from "#/icons/checkmark.svg?react";
import { cn } from "#/utils/utils";
import type { ProfileInfo } from "#/api/profiles-service/profiles-service.api";

const rowBaseClassName = cn(
  "w-full flex gap-3 px-3 rounded",
  "text-start hover:bg-white/10 cursor-pointer text-nowrap",
);
const profileRowClassName = cn(rowBaseClassName, "h-auto items-start py-2.5");
const linkRowClassName = cn(rowBaseClassName, "h-10 items-center");

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
      <div className="px-3 pt-1 pb-0.5">
        <Typography.Text className="text-[11px] font-medium text-[var(--oh-text-dim)] uppercase tracking-wide leading-4">
          {t(I18nKey.SETTINGS$AVAILABLE_PROFILES)}
        </Typography.Text>
      </div>
      {profiles.map((profile) => {
        const isActive = profile.name === activeProfileName;
        return (
          <ContextMenuListItem
            key={profile.name}
            testId={`switch-profile-option-${profile.name}`}
            onClick={(event) => handleSelect(event, profile.name)}
            className={cn(profileRowClassName, isActive && "bg-[#5C5D62]")}
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
        className={linkRowClassName}
      >
        <SettingsIcon width={16} height={16} className="shrink-0" />
        <span className="text-sm leading-5">
          {t(I18nKey.MODEL$OPEN_SETTINGS)}
        </span>
      </NavigationLink>
    </ContextMenu>
  );
}
