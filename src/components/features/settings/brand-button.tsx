import { forwardRef } from "react";
import { cn } from "#/utils/utils";

interface BrandButtonProps {
  testId?: string;
  name?: string;
  variant: "primary" | "secondary" | "tertiary" | "danger" | "ghost-danger";
  type: React.ButtonHTMLAttributes<HTMLButtonElement>["type"];
  isDisabled?: boolean;
  className?: string;
  onClick?: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  startContent?: React.ReactNode;
  /** Accessible label for icon-only buttons */
  ariaLabel?: string;
  /** Indicates busy/loading state for screen readers */
  "aria-busy"?: boolean;
}

export const BrandButton = forwardRef<
  HTMLButtonElement,
  React.PropsWithChildren<BrandButtonProps>
>(function BrandButton(
  {
    testId,
    name,
    children,
    variant,
    type,
    isDisabled,
    className,
    onClick,
    startContent,
    ariaLabel,
    "aria-busy": ariaBusy,
  },
  ref,
) {
  return (
    <button
      ref={ref}
      name={name}
      data-testid={testId}
      disabled={isDisabled}
      // The type is already passed as a prop to the button component

      type={type}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      className={cn(
        "w-fit p-2 text-sm rounded-sm cursor-pointer",
        // Apply disabled appearance via conditional class so it works
        // regardless of whether the :disabled pseudo-class is available
        // (e.g. Tailwind v4 + postcss-prefix-selector in dev mode).
        isDisabled
          ? "opacity-30 cursor-not-allowed pointer-events-none"
          : "disabled:opacity-30 disabled:cursor-not-allowed",
        variant === "primary" &&
          "bg-primary text-[var(--oh-color-base)] hover:opacity-80",
        variant === "secondary" &&
          "border border-[var(--oh-border)] text-white hover:bg-surface-raised",
        variant === "tertiary" &&
          "bg-[var(--oh-interactive-hover)] text-white hover:opacity-80",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        variant === "ghost-danger" &&
          "bg-transparent text-red-600 underline hover:text-red-700 hover:no-underline font-medium",
        startContent && "flex items-center justify-center gap-2",
        className,
      )}
    >
      {startContent}
      {children}
    </button>
  );
});
