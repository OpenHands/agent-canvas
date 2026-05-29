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
import type { ProfileWithPlan } from "#/hooks/use-profile-runtime-plans";
import { reasonToI18nKey } from "#/utils/agent-profiles/reason-labels";

const profileRowClassName = cn("w-full flex flex-col gap-0.5 p-2 h-auto");
const linkRowClassName = cn(
  "w-full flex items-center gap-2 p-2 rounded",
  "text-start hover:bg-[var(--oh-interactive-hover)] cursor-pointer text-nowrap",
);

interface SwitchProfileContextMenuProps {
  profiles: ProfileWithPlan[];
  onSelect: (profileName: string) => void;
  onClose: () => void;
}

export function SwitchProfileContextMenu({
  profiles,
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
      {profiles.map(({ profile, plan }) => {
        const isCurrent = plan.action === "current";
        const isDisabled = plan.action === "disabled";
        const reasonLabel =
          plan.action === "disabled" ? t(reasonToI18nKey(plan.reason)) : null;

        // Block partial application: a disabled row never fires (the button is
        // disabled), a `current` row is a no-op close, and only `switch-live`
        // reaches `onSelect`.
        const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
          event.preventDefault();
          event.stopPropagation();
          if (isCurrent) {
            onClose();
            return;
          }
          onSelect(profile.name);
          onClose();
        };

        return (
          <ContextMenuListItem
            key={profile.name}
            testId={`switch-profile-option-${profile.name}`}
            isDisabled={isDisabled}
            onClick={handleClick}
            className={cn(
              profileRowClassName,
              isCurrent && "bg-[var(--oh-interactive-hover)]",
            )}
          >
            <span
              className="flex items-center gap-2 min-w-0"
              // The reason is shown inline; mirror it on the title for a tooltip.
              title={reasonLabel ?? profile.model ?? undefined}
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
              {isCurrent && (
                <CheckIcon
                  width={14}
                  height={14}
                  className="shrink-0"
                  aria-hidden
                />
              )}
            </span>
            {reasonLabel ? (
              <span
                className="block truncate text-xs leading-4 text-[var(--oh-text-dim)] pl-6"
                data-testid={`switch-profile-reason-${profile.name}`}
              >
                {reasonLabel}
              </span>
            ) : (
              profile.model && (
                <span className="block truncate text-xs leading-4 text-[var(--oh-muted)] pl-6">
                  {profile.model}
                </span>
              )
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
