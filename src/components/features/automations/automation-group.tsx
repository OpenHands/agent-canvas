import type { Automation } from "#/types/automation";
import { AutomationCard } from "./automation-card";
import { StatusBadge } from "./status-badge";

interface AutomationGroupProps {
  title: string;
  count: number;
  automations: Automation[];
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
}

export function AutomationGroup({
  title,
  count,
  automations,
  onToggle,
  onDelete,
  onEdit,
}: AutomationGroupProps) {
  if (automations.length === 0) return null;

  return (
    <section>
      <div className="flex items-center">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <StatusBadge count={count} />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {automations.map((automation) => (
          <AutomationCard
            key={automation.id}
            automation={automation}
            onToggle={onToggle}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
}
