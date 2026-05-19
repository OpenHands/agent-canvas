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
  "w-full flex flex-col gap-0.5 p-2 rounded",
  "text-start hover:bg-[var(--oh-interactive-hover)] cursor-pointer text-nowrap",
);
const profileRowClassName = cn(rowBaseClassName, "h-auto");
const linkRowClassName = cn(
  "w-full flex items-center gap-2 p-2 rounded",
  "text-start hover:bg-[var(--oh-interactive-hover)] cursor-pointer text-nowrap",
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
      className="z-[60] left-0 mb-2 bottom-full min-w-[280px] max-h-[60vh] overflow-y-auto"
    >
      <div className="px-2 pt-1 pb-0.5">
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
            className={cn(
              profileRowClassName,
              isActive && "bg-[var(--oh-interactive-hover)]",
            )}
          >
            <span
              className="flex items-center gap-2 min-w-0"
              title={profile.model ?? undefined}
            >
              <CircuitIcon
                width={16}
                height={16}
                className="shrink-0"
                aria-hidden
              />
              <span className="flex-1 truncate text-sm leading-5">
                {profile.name}
              </span>
              {isActive && (
                <CheckIcon
                  width={14}
                  height={14}
                  className="shrink-0"
                  aria-hidden
                />
              )}
            </span>
            {profile.model && (
              <span className="block truncate text-xs leading-4 text-[var(--oh-muted)] pl-6">
                {profile.model}
              </span>
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
