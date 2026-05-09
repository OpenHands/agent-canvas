interface BranchBadgeProps {
  branch: string;
}

export function BranchBadge({ branch }: BranchBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-pill-bg px-2.5 py-0.5 text-xs text-content-muted">
      {branch}
    </span>
  );
}
