import { cn } from "#/utils/utils";
import { formControlInlineInputClassName } from "#/utils/form-control-classes";

interface DropdownInputProps {
  placeholder?: string;
  isDisabled: boolean;
  getInputProps: (props?: object) => object;
  /** When false, placeholder hint keeps upright type (e.g. backend selector). */
  italicPlaceholder?: boolean;
}

export function DropdownInput({
  placeholder,
  isDisabled,
  getInputProps,
  italicPlaceholder = true,
}: DropdownInputProps) {
  return (
    <input
      {...getInputProps({
        placeholder,
        disabled: isDisabled,
        className: cn(
          formControlInlineInputClassName,
          "px-0 not-italic text-inherit",
          italicPlaceholder && "placeholder:italic",
        ),
      })}
    />
  );
}
