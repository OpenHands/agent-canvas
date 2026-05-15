import { cn } from "#/utils/utils";

export interface LoadingSpinnerProps {
  className?: string;
}

export function LoadingSpinner({ className }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center">
      <div
        className={cn(
          "animate-spin rounded-full border-4 border-[var(--oh-border)] border-t-white",
          className,
        )}
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
