import React from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "#/ui/dropdown/dropdown";
import { DropdownOption } from "#/ui/dropdown/types";
import { I18nKey } from "#/i18n/declaration";
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

  const dropdownOptions = React.useMemo<DropdownOption[]>(
    () =>
      options.map((option) => ({
        value: option,
        label: t(labelKeyByValue[option]),
      })),
    [labelKeyByValue, options, t],
  );

  const selectedOption =
    dropdownOptions.find((option) => option.value === value) ??
    dropdownOptions[0];
  const defaultOption = dropdownOptions[0];

  return (
    <div className="shrink-0 w-auto">
      <Dropdown
        key={value}
        testId={testId}
        options={dropdownOptions}
        defaultValue={selectedOption}
        placeholder={selectedOption.label}
        onChange={(item) => {
          if (item) {
            onChange(item.value as T);
          }
        }}
        italicPlaceholder={false}
        fitContent
        className={cn(
          "rounded-lg border border-[var(--oh-border)] bg-base-secondary",
          "px-3 py-2 text-sm font-medium text-white",
          "focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/20",
          "transition-colors",
          defaultOption &&
            value !== defaultOption.value &&
            "border-white/60 bg-white/10",
        )}
      />
    </div>
  );
}
