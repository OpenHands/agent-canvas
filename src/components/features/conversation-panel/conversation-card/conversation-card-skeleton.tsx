import React from "react";

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
      className="relative h-auto w-full px-3 py-2 border-b border-[#1f2228]"
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2 w-full">
          <div className="skeleton-round h-1.5 w-1.5" />
          <div className="skeleton h-3 w-2/3 rounded" />
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <div className="skeleton h-2 w-1/2 rounded" />
        <div className="flex justify-between">
          <div className="skeleton h-2 w-1/4 rounded" />
          <div className="skeleton h-2 w-8 rounded" />
        </div>
      </div>
    </div>
  );
}
