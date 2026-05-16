export function AutomationCardSkeleton() {
  return (
    <div
      data-testid="automation-card-skeleton"
      className="rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-5"
    >
      <div className="skeleton-stagger flex flex-col">
        <div className="flex items-start justify-between">
          <div className="h-5 w-40 skeleton" />
          <div className="h-5 w-10 skeleton-round" />
        </div>
        <div className="mt-2 h-4 w-72 skeleton" />
        <div className="mt-4 flex gap-2">
          <div className="h-7 w-32 skeleton-round" />
          <div className="h-7 w-28 skeleton-round" />
          <div className="h-7 w-24 skeleton-round" />
        </div>
      </div>
    </div>
  );
}
