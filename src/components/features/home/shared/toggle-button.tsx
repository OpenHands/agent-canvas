import {
  ComboboxCaretIcon,
  comboboxCaretButtonClassName,
} from "#/ui/combobox-caret";
import { cn } from "#/utils/utils";

interface ToggleButtonProps {
  isOpen: boolean;
  disabled: boolean;
  getToggleButtonProps: (
    props?: Record<string, unknown>,
  ) => Record<string, unknown>;
  iconClassName?: string;
}

export function ToggleButton({
  isOpen,
  disabled,
  getToggleButtonProps,
  iconClassName,
}: ToggleButtonProps) {
  return (
    <button
      {...getToggleButtonProps({
        disabled,
        className: cn(
          comboboxCaretButtonClassName,
          "text-[#fff]",
          isOpen && "rotate-180",
          disabled && "cursor-not-allowed opacity-60",
        ),
      })}
      type="button"
      aria-label="Toggle menu"
    >
      <ComboboxCaretIcon className={iconClassName} />
    </button>
  );
}
