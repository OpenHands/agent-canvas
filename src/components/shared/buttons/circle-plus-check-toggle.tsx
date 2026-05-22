import React from "react";
import { useTranslation } from "react-i18next";
import PlusIcon from "#/icons/u-plus.svg?react";
import CheckmarkIcon from "#/icons/checkmark.svg?react";
import RemoveIcon from "#/icons/x.svg?react";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
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
  enableTooltipKey?: I18nKey;
  removeTooltipKey?: I18nKey;
}

export function CirclePlusCheckToggle({
  testId,
  isSelected,
  onToggle,
  isDisabled = false,
  className,
  enableLabelKey = I18nKey.SETTINGS$SKILLS_ENABLE_SKILL,
  disableLabelKey = I18nKey.SETTINGS$SKILLS_DISABLE_SKILL,
  enableTooltipKey = I18nKey.COMMON$ENABLE,
  removeTooltipKey = I18nKey.COMMON$REMOVE,
}: CirclePlusCheckToggleProps) {
  const { t } = useTranslation("openhands");
  const [isHovered, setIsHovered] = React.useState(false);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isDisabled) {
      return;
    }
    onToggle(!isSelected);
  };

  const showRemoveIcon = isSelected && isHovered;
  const tooltipLabel = t(isSelected ? removeTooltipKey : enableTooltipKey);
  const ariaLabel = t(isSelected ? disableLabelKey : enableLabelKey);

  return (
    <StyledTooltip content={tooltipLabel} placement="top">
      <button
        type="button"
        role="switch"
        aria-checked={isSelected}
        data-testid={testId}
        data-showing-remove={showRemoveIcon ? "true" : "false"}
        disabled={isDisabled}
        aria-label={ariaLabel}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
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
          showRemoveIcon ? (
            <RemoveIcon aria-hidden className="size-3" />
          ) : (
            <CheckmarkIcon aria-hidden width={14} height={14} />
          )
        ) : (
          <PlusIcon aria-hidden className="size-3" />
        )}
      </button>
    </StyledTooltip>
  );
}
