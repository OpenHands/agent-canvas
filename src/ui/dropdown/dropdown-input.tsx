import { cn } from "#/utils/utils";
import { formControlInlineInputClassName } from "#/utils/form-control-classes";

interface DropdownInputProps {
  placeholder?: string;
  isDisabled: boolean;
  getInputProps: (props?: object) => object;
}

export function DropdownInput({
  placeholder,
  isDisabled,
  getInputProps,
}: DropdownInputProps) {
  return (
    <input
      {...getInputProps({
        placeholder,
        disabled: isDisabled,
        className: cn(
          formControlInlineInputClassName,
          "px-0 not-italic text-inherit",
        ),
      })}
    />
  );
}
