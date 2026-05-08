interface ConfigFieldProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

export function ConfigField({ icon, label, children }: ConfigFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="size-3.5 text-content-muted">{icon}</span>
        <span className="text-xs font-medium text-content-muted">{label}</span>
      </div>
      <div className="text-sm text-content">{children}</div>
    </div>
  );
}
