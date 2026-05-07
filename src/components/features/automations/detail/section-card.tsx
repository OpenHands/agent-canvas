interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

export function SectionCard({ icon, title, children }: SectionCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-700 bg-neutral-800">
      <div className="flex items-center gap-2 border-b border-neutral-700 px-5 pb-3 pt-4">
        <span className="size-4 text-neutral-400">{icon}</span>
        <h3 className="text-sm font-medium text-neutral-200">{title}</h3>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}
