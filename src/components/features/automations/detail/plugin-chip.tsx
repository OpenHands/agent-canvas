interface PluginChipProps {
  name: string;
}

export function PluginChip({ name }: PluginChipProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-600 bg-neutral-700/30 px-3.5 py-1.5 text-sm text-neutral-200">
      {name}
    </span>
  );
}
