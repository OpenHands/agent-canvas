interface ConfigFieldProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

export function ConfigField({ icon, label, children }: ConfigFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="size-3.5 text-neutral-400">{icon}</span>
        <span className="text-xs font-medium text-neutral-400">{label}</span>
      </div>
      <div className="text-sm text-neutral-200">{children}</div>
    </div>
  );
}
