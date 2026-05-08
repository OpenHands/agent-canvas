interface StatusBadgeProps {
  count: number;
}

export function StatusBadge({ count }: StatusBadgeProps) {
  return (
    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-border px-2 py-0.5 text-xs text-white">
      {count}
    </span>
  );
}
