import { cn } from "#/utils/utils";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function DetailSkeleton() {
  return (
    <div
      className="skeleton-stagger flex flex-col gap-4"
      data-testid="detail-skeleton"
    >
      <SkeletonBlock className="h-5 w-40" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-6 w-48" />
          <div className="h-6 w-16 skeleton-round" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-11 skeleton-round" />
          <SkeletonBlock className="h-8 w-8" />
        </div>
      </div>
      <SkeletonBlock className="h-5 w-96" />
      <SkeletonBlock className="h-36 w-full !rounded-2xl" />
      <SkeletonBlock className="h-72 w-full !rounded-2xl" />
      <SkeletonBlock className="h-32 w-full !rounded-2xl" />
      <SkeletonBlock className="h-40 w-full !rounded-2xl" />
    </div>
  );
}
