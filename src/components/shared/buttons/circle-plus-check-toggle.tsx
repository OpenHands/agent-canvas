import React from "react";
import { useTranslation } from "react-i18next";
import PlusIcon from "#/icons/u-plus.svg?react";
import CheckmarkIcon from "#/icons/checkmark.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

interface CirclePlusCheckToggleProps {
  testId?: string;
  isSelected: boolean;
  onToggle: (selected: boolean) => void;
  isDisabled?: boolean;
  className?: string;
  enableLabelKey?: I18nKey;
  disableLabelKey?: I18nKey;
}

export function CirclePlusCheckToggle({
  testId,
  isSelected,
  onToggle,
  isDisabled = false,
  className,
  enableLabelKey = I18nKey.SETTINGS$SKILLS_ENABLE_SKILL,
  disableLabelKey = I18nKey.SETTINGS$SKILLS_DISABLE_SKILL,
}: CirclePlusCheckToggleProps) {
  const { t } = useTranslation("openhands");

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isDisabled) {
      return;
    }
    onToggle(!isSelected);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isSelected}
      data-testid={testId}
      disabled={isDisabled}
      aria-label={t(isSelected ? disableLabelKey : enableLabelKey)}
      onClick={handleClick}
      className={cn(
        "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 transition-colors",
        isSelected
          ? "bg-white text-base hover:bg-white/90 [&_path]:fill-current"
          : "bg-surface-raised text-white hover:bg-[var(--oh-interactive-hover)]",
        isDisabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {isSelected ? (
        <CheckmarkIcon aria-hidden width={14} height={14} />
      ) : (
        <PlusIcon aria-hidden className="size-3" />
      )}
    </button>
  );
}
