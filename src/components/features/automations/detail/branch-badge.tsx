interface BranchBadgeProps {
  branch: string;
}

export function BranchBadge({ branch }: BranchBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-600 bg-neutral-700/50 px-2.5 py-0.5 text-xs text-neutral-400">
      {branch}
    </span>
  );
}
