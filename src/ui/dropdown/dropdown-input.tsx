import { cn } from "#/utils/utils";

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
          "flex-1 min-w-0 outline-none bg-transparent text-white not-italic",
          italicPlaceholder &&
            "placeholder:italic placeholder:text-tertiary-alt",
          !italicPlaceholder && "placeholder:text-tertiary-alt",
        ),
      })}
    />
  );
}
