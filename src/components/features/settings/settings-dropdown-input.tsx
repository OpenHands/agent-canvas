import { Autocomplete, AutocompleteItem } from "@heroui/react";
import React, { ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionalTag } from "./optional-tag";
import { cn } from "#/utils/utils";

function itemMatchesQuery(
  item: { key: React.Key; label: string },
  query: string,
  customFilter?: (textValue: string, inputValue: string) => boolean,
): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return true;
  }
  if (customFilter) {
    return (
      customFilter(String(item.label), trimmed) ||
      customFilter(String(item.key), trimmed)
    );
  }
  const needle = trimmed.toLocaleLowerCase();
  const haystackLabel = String(item.label).toLocaleLowerCase();
  const haystackKey = String(item.key).toLocaleLowerCase();
  return haystackLabel.includes(needle) || haystackKey.includes(needle);
}

interface SettingsDropdownInputProps {
  testId: string;
  name: string;
  items: { key: React.Key; label: string }[];
  label?: ReactNode;
  wrapperClassName?: string;
  placeholder?: string;
  showOptionalTag?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  defaultSelectedKey?: string;
  selectedKey?: string;
  isClearable?: boolean;
  allowsCustomValue?: boolean;
  required?: boolean;
  onSelectionChange?: (key: React.Key | null) => void;
  onInputChange?: (value: string) => void;
  defaultFilter?: (textValue: string, inputValue: string) => boolean;
  startContent?: ReactNode;
  inputWrapperClassName?: string;
  inputClassName?: string;
}

export function SettingsDropdownInput({
  testId,
  label,
  wrapperClassName,
  name,
  items,
  placeholder,
  showOptionalTag,
  isDisabled,
  isLoading,
  defaultSelectedKey,
  selectedKey,
  isClearable,
  allowsCustomValue,
  required,
  onSelectionChange,
  onInputChange,
  defaultFilter,
  startContent,
  inputWrapperClassName,
  inputClassName,
}: SettingsDropdownInputProps) {
  const { t } = useTranslation("openhands");

  const [filterQuery, setFilterQuery] = useState("");

  const filteredItems = useMemo(
    () =>
      items.filter((item) => itemMatchesQuery(item, filterQuery, defaultFilter)),
    [items, filterQuery, defaultFilter],
  );

  const handleInputChange = (value: string) => {
    setFilterQuery(value);
    onInputChange?.(value);
  };

  const handleSelectionChange = (key: React.Key | null) => {
    setFilterQuery("");
    onSelectionChange?.(key);
  };

  return (
    <label
      className={cn("flex flex-col gap-2.5 w-full min-w-0", wrapperClassName)}
    >
      {label && (
        <div className="flex items-center gap-1">
          <span className="text-sm">{label}</span>
          {showOptionalTag && <OptionalTag />}
        </div>
      )}
      <Autocomplete
        aria-label={typeof label === "string" ? label : name}
        data-testid={testId}
        name={name}
        items={filteredItems}
        defaultSelectedKey={defaultSelectedKey}
        selectedKey={selectedKey}
        onSelectionChange={handleSelectionChange}
        onInputChange={handleInputChange}
        isClearable={isClearable}
        isDisabled={isDisabled || isLoading}
        isLoading={isLoading}
        placeholder={isLoading ? t("HOME$LOADING") : placeholder}
        allowsCustomValue={allowsCustomValue}
        isRequired={required}
        className="w-full"
        classNames={{
          popoverContent: "bg-content1 rounded-xl",
          selectorButton:
            "!rounded-none !bg-transparent data-[hover=true]:!bg-transparent !min-w-0 !w-auto !h-auto px-1",
        }}
        selectorButtonProps={{ disableRipple: true }}
        inputProps={{
          classNames: {
            inputWrapper: cn(
              "bg-tertiary border border-[var(--oh-border-input)] h-10 w-full min-w-0 rounded-sm p-2 placeholder:italic",
              inputWrapperClassName,
            ),
            input: inputClassName,
          },
        }}
        startContent={startContent || null}
      >
        {(item) => (
          <AutocompleteItem key={item.key} textValue={String(item.label)}>
            {item.label}
          </AutocompleteItem>
        )}
      </Autocomplete>
    </label>
  );
}
