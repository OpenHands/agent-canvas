interface MetadataChipProps {
  icon: React.ReactNode;
  label: string;
}

export function MetadataChip({ icon, label }: MetadataChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--oh-border)] px-3 py-1 text-xs text-muted">
      {icon}
      {label}
    </span>
  );
}
