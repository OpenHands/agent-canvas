export function AutomationCardSkeleton() {
  return (
    <div
      data-testid="automation-card-skeleton"
      className="rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-5"
    >
      <div className="flex items-start justify-between">
        <div className="h-5 w-40 animate-pulse rounded bg-surface-raised" />
        <div className="h-5 w-10 animate-pulse rounded-full bg-surface-raised" />
      </div>
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-surface-raised" />
      <div className="mt-4 flex gap-2">
        <div className="h-7 w-32 animate-pulse rounded-full bg-surface-raised" />
        <div className="h-7 w-28 animate-pulse rounded-full bg-surface-raised" />
        <div className="h-7 w-24 animate-pulse rounded-full bg-surface-raised" />
      </div>
    </div>
  );
}
