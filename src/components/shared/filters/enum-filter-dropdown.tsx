import React from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { cn } from "#/utils/utils";

interface EnumFilterDropdownProps<T extends string> {
  testId: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
  labelKeyByValue: Record<T, I18nKey>;
}

export function EnumFilterDropdown<T extends string>({
  testId,
  value,
  onChange,
  options,
  labelKeyByValue,
}: EnumFilterDropdownProps<T>) {
  const { t } = useTranslation("openhands");
  const [open, setOpen] = React.useState(false);
  const containerRef = useClickOutsideElement<HTMLDivElement>(() =>
    setOpen(false),
  );

  const defaultOption = options[0];
  const selectedLabel = t(labelKeyByValue[value]);

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 w-auto"
      data-testid={testId}
    >
      <button
        type="button"
        data-testid="dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(I18nKey.CONVERSATION_PANEL$FILTER_LABEL)}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
          "border-[var(--oh-border)] bg-base-secondary text-white",
          "focus-visible:border-white/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20",
          defaultOption &&
            value !== defaultOption &&
            "border-white/60 bg-white/10",
        )}
      >
        <span className="whitespace-nowrap">{selectedLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-tertiary-alt transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          data-testid={`${testId}-menu`}
          aria-label={t(I18nKey.CONVERSATION_PANEL$FILTER_LABEL)}
          className={cn(
            "absolute right-0 top-full z-50 mt-1 min-w-full w-max",
            "max-h-60 overflow-auto rounded-[6px] bg-tertiary p-1 context-menu-box-shadow",
          )}
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                data-testid={`${testId}-${option}`}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-white",
                  "hover:bg-[var(--oh-interactive-hover)] cursor-pointer",
                  selected && "bg-[var(--oh-interactive-selected)]",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {t(labelKeyByValue[option])}
                </span>
                {selected ? (
                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
