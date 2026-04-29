import {
  ComboBox,
  Input,
  ListBox,
  type Key,
} from "@heroui/react";
import React, { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { OptionalTag } from "./optional-tag";
import { cn } from "#/utils/utils";

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

const INPUT_GROUP_CLASS =
  "bg-tertiary border border-[#717888] h-10 w-full max-w-[680px] rounded-sm px-2 flex items-center gap-2";
const POPOVER_CLASS =
  "bg-tertiary rounded-xl border border-[#717888] overflow-hidden";
const LIST_BOX_CLASS = "max-h-60 overflow-auto py-1";
const LIST_BOX_ITEM_CLASS =
  "px-3 py-2 text-sm text-content hover:bg-white/5 cursor-pointer rounded-md mx-1";
const CLEAR_BUTTON_CLASS =
  "text-tertiary-light/80 hover:text-content transition-colors text-lg leading-none";
const TRIGGER_CLASS = "text-tertiary-light/80 hover:text-content transition-colors";

const normalizeKey = (key: React.Key | null | undefined) =>
  key === null || key === undefined ? null : String(key);

const getItemLabel = (
  items: { key: React.Key; label: string }[],
  key: React.Key | null | undefined,
) => {
  const normalizedKey = normalizeKey(key);

  if (normalizedKey === null) {
    return "";
  }

  return (
    items.find((item) => normalizeKey(item.key) === normalizedKey)?.label ?? ""
  );
};

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
  const { t } = useTranslation();
  const isControlled = selectedKey !== undefined;
  const [internalSelectedKey, setInternalSelectedKey] = React.useState<Key | null>(
    defaultSelectedKey ?? null,
  );
  const [inputValue, setInputValue] = React.useState(() =>
    getItemLabel(items, defaultSelectedKey),
  );

  const effectiveSelectedKey = isControlled
    ? (selectedKey ?? null)
    : internalSelectedKey;
  const effectiveLabel = React.useMemo(
    () => getItemLabel(items, effectiveSelectedKey),
    [effectiveSelectedKey, items],
  );

  React.useEffect(() => {
    if (!isControlled) {
      setInternalSelectedKey(defaultSelectedKey ?? null);
    }
  }, [defaultSelectedKey, isControlled]);

  React.useEffect(() => {
    if (effectiveSelectedKey !== null) {
      setInputValue(effectiveLabel);
      return;
    }

    if (!allowsCustomValue) {
      setInputValue("");
    }
  }, [allowsCustomValue, effectiveLabel, effectiveSelectedKey]);

  const clearSelection = () => {
    if (!isControlled) {
      setInternalSelectedKey(null);
    }

    setInputValue("");
    onSelectionChange?.(null);
    onInputChange?.("");
  };

  const handleSelectionChange = (key: Key | null) => {
    if (!isControlled) {
      setInternalSelectedKey(key);
    }

    setInputValue(getItemLabel(items, key));
    onSelectionChange?.(key);
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);

    if (!value && isClearable) {
      if (!isControlled) {
        setInternalSelectedKey(null);
      }

      onSelectionChange?.(null);
    }

    onInputChange?.(value);
  };

  return (
    <label className={cn("flex flex-col gap-2.5", wrapperClassName)}>
      {label && (
        <div className="flex items-center gap-1">
          <span className="text-sm">{label}</span>
          {showOptionalTag && <OptionalTag />}
        </div>
      )}
      <ComboBox
        aria-label={typeof label === "string" ? label : name}
        allowsCustomValue={allowsCustomValue}
        className="w-full"
        defaultFilter={defaultFilter}
        defaultInputValue={getItemLabel(items, defaultSelectedKey)}
        defaultSelectedKey={defaultSelectedKey}
        inputValue={inputValue}
        isDisabled={isDisabled || isLoading}
        isRequired={required}
        items={items}
        name={name}
        onInputChange={handleInputChange}
        onSelectionChange={handleSelectionChange}
        selectedKey={effectiveSelectedKey}
      >
        <ComboBox.InputGroup
          className={cn(INPUT_GROUP_CLASS, inputWrapperClassName)}
        >
          {startContent ? (
            <span className="flex shrink-0 items-center">{startContent}</span>
          ) : null}
          <Input
            aria-label={typeof label === "string" ? label : name}
            className={cn(
              "flex-1 bg-transparent text-sm text-content placeholder:italic outline-none",
              inputClassName,
            )}
            data-testid={testId}
            placeholder={isLoading ? t("HOME$LOADING") : placeholder}
          />
          {isClearable && inputValue ? (
            <button
              aria-label="Clear selection"
              className={CLEAR_BUTTON_CLASS}
              onClick={clearSelection}
              type="button"
            >
              ×
            </button>
          ) : null}
          <ComboBox.Trigger className={TRIGGER_CLASS} />
        </ComboBox.InputGroup>
        <ComboBox.Popover className={POPOVER_CLASS}>
          <ListBox className={LIST_BOX_CLASS} items={items}>
            {(item) => (
              <ListBox.Item
                className={LIST_BOX_ITEM_CLASS}
                id={String(item.key)}
                textValue={item.label}
              >
                {item.label}
              </ListBox.Item>
            )}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>
    </label>
  );
}
