import { useTranslation } from "react-i18next";
import { useNavigation } from "#/context/navigation-context";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { useWorkModeAvailability } from "#/hooks/use-work-mode-availability";
import { I18nKey } from "#/i18n/declaration";
import { useAppModeStore } from "#/stores/app-mode-store";
import type { AppMode } from "#/types/app-mode";
import { getEffectiveAppMode } from "#/utils/app-mode-capabilities";
import { getHomePathForAppMode } from "#/utils/app-mode";
import { cn } from "#/utils/utils";

const MODE_OPTIONS: AppMode[] = ["code", "work"];

export function AppModeToggle({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation("openhands");
  const { navigate, currentPath } = useNavigation();
  const { workAllowed, capabilityContext } = useWorkModeAvailability();
  const mode = useAppModeStore((state) => state.mode);
  const setMode = useAppModeStore((state) => state.setMode);
  const effectiveMode = getEffectiveAppMode(mode, capabilityContext);

  if (collapsed) {
    return null;
  }

  const labelForMode = (value: AppMode) =>
    value === "code" ? t(I18nKey.APP_MODE$CODE) : t(I18nKey.APP_MODE$WORK);

  const handleSelect = (next: AppMode) => {
    if (next === "work" && !workAllowed) {
      return;
    }
    if (next === effectiveMode) {
      return;
    }
    setMode(next);
    const homePath = getHomePathForAppMode(next);
    const isOnOtherModeHome =
      (next === "work" && currentPath.startsWith("/conversations")) ||
      (next === "code" && currentPath.startsWith("/work"));

    if (isOnOtherModeHome || currentPath === "/" || currentPath === homePath) {
      navigate(homePath);
    }
  };

  const toggle = (
    <div
      role="radiogroup"
      aria-label={t(I18nKey.APP_MODE$TOGGLE_ARIA)}
      data-testid="app-mode-toggle"
      className="inline-flex shrink-0 items-center rounded-md bg-[var(--oh-surface-raised)] p-0.5 text-[10px] leading-none"
    >
      {MODE_OPTIONS.map((option) => {
        const isActive = option === effectiveMode;
        const isDisabled = option === "work" && !workAllowed;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            data-testid={`app-mode-toggle-option-${option}`}
            onClick={() => handleSelect(option)}
            className={cn(
              "rounded px-1.5 py-1 transition-colors",
              isDisabled
                ? "cursor-not-allowed text-[var(--oh-muted)] opacity-45"
                : "cursor-pointer",
              isActive && !isDisabled
                ? "bg-[var(--oh-interactive-hover)] text-white"
                : !isDisabled && "text-[var(--oh-muted)] hover:text-white",
            )}
          >
            {labelForMode(option)}
          </button>
        );
      })}
    </div>
  );

  if (!workAllowed) {
    return (
      <StyledTooltip
        content={t(I18nKey.APP_MODE$WORK_CLOUD_TOOLTIP)}
        placement="bottom"
      >
        {toggle}
      </StyledTooltip>
    );
  }

  return toggle;
}
