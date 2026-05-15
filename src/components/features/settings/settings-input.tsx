import { forwardRef } from "react";
import { cn } from "#/utils/utils";
import { OptionalTag } from "./optional-tag";

interface SettingsInputProps {
  testId?: string;
  name?: string;
  label: string;
  type: React.HTMLInputTypeAttribute;
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  showOptionalTag?: boolean;
  isDisabled?: boolean;
  startContent?: React.ReactNode;
  className?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
  /** Validation message shown when pattern doesn't match */
  title?: string;
  labelClassName?: string;
  /** ARIA describedby attribute for accessibility */
  ariaDescribedBy?: string;
  /** ARIA invalid attribute for accessibility */
  ariaInvalid?: boolean;
}

export const SettingsInput = forwardRef<HTMLInputElement, SettingsInputProps>(
  function SettingsInput(
    {
      testId,
      name,
      label,
      type,
      defaultValue,
      value,
      placeholder,
      showOptionalTag,
      isDisabled,
      startContent,
      className,
      onChange,
      onKeyDown,
      required,
      min,
      max,
      step,
      pattern,
      title,
      labelClassName,
      ariaDescribedBy,
      ariaInvalid,
    },
    ref,
  ) {
    return (
      <label className={cn("flex flex-col gap-2.5 w-fit", className)}>
        <div className="flex items-center gap-2">
          {startContent}
          <span className={cn("text-sm", labelClassName)}>{label}</span>
          {showOptionalTag && <OptionalTag />}
        </div>
        <input
          ref={ref}
          data-testid={testId}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          name={name}
          disabled={isDisabled}
          type={type}
          defaultValue={defaultValue}
          value={value}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          required={required}
          pattern={pattern}
          title={title}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          className={cn(
            "bg-tertiary border border-[var(--oh-border-input)] h-10 w-full max-w-[680px] rounded-sm p-2 placeholder:italic placeholder:text-tertiary-alt",
            "disabled:bg-[var(--oh-surface-raised)] disabled:border-[var(--oh-border-subtle)] disabled:cursor-not-allowed",
          )}
        />
      </label>
    );
  },
);
