interface ConversationCardSkeletonProps {
  compact?: boolean;
}

export function ConversationCardSkeleton({
  compact = false,
}: ConversationCardSkeletonProps) {
  if (compact) {
    return (
      <div
        data-testid="conversation-card-skeleton-compact"
        className="flex items-center justify-center px-2 py-2"
      >
        <div className="skeleton-round h-2 w-2" />
      </div>
    );
  }

  return (
    <div
      data-testid="conversation-card-skeleton"
      className="relative h-auto w-full px-3 py-2 border-b border-[var(--oh-border-subtle)]"
    >
      <div className="flex items-center w-full min-w-0 h-6">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            data-testid="conversation-card-skeleton-status-dot"
            className="skeleton-round h-2.5 w-2.5 shrink-0"
          />
          <div
            data-testid="conversation-card-skeleton-title"
            className="skeleton h-3 w-2/3 rounded"
          />
        </div>
        <div className="ml-auto pl-2 shrink-0">
          <div
            data-testid="conversation-card-skeleton-timestamp"
            className="skeleton h-2 w-8 rounded"
          />
        </div>
      </div>
    </div>
  );
}
