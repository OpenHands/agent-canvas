import { forwardRef } from "react";
import { cn } from "#/utils/utils";

interface BrandButtonProps {
  testId?: string;
  name?: string;
  variant: "primary" | "secondary" | "danger" | "ghost-danger";
  type: React.ButtonHTMLAttributes<HTMLButtonElement>["type"];
  isDisabled?: boolean;
  className?: string;
  onClick?: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  startContent?: React.ReactNode;
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
      className={cn(
        "w-fit p-2 text-sm rounded-sm disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 cursor-pointer",
        variant === "primary" && "bg-primary text-[#0D0F11]",
        variant === "secondary" && "border border-primary text-primary",
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
