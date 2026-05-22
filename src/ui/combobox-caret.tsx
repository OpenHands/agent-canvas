import { cn } from "#/utils/utils";

export function ComboboxCaretIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      fill="none"
      focusable="false"
      height="1em"
      role="presentation"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      width="1em"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Matches HeroUI Autocomplete selectorButton styling. */
export const comboboxCaretButtonClassName =
  "inline-flex items-center justify-center shrink-0 rounded-none bg-transparent px-1 min-w-0 w-auto h-auto text-medium cursor-pointer outline-none transition-transform duration-150 ease motion-reduce:transition-none text-current";

interface ComboboxCaretButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isOpen?: boolean;
}

export function ComboboxCaretButton({
  isOpen,
  className,
  disabled,
  children,
  ...props
}: ComboboxCaretButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        comboboxCaretButtonClassName,
        isOpen && "rotate-180",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
      {...props}
    >
      {children ?? <ComboboxCaretIcon />}
    </button>
  );
}

/** Inline caret for buttons where only the icon rotates, not the whole control. */
export function ComboboxCaretInline({
  isOpen,
  className,
}: {
  isOpen?: boolean;
  className?: string;
}) {
  return (
    <ComboboxCaretIcon
      className={cn(
        "shrink-0 transition-transform duration-150 ease motion-reduce:transition-none",
        isOpen && "rotate-180",
        className,
      )}
    />
  );
}
