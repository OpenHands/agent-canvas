import { cn } from "#/utils/utils";
import { extensionModuleCardPillClassName } from "#/utils/extension-module-card-classes";

interface CloudOrgLabelPillProps {
  children: string;
  className?: string;
}

export function CloudOrgLabelPill({
  children,
  className,
}: CloudOrgLabelPillProps) {
  return (
    <span
      data-testid="cloud-org-label-pill"
      className={cn(extensionModuleCardPillClassName, "text-white", className)}
    >
      {children}
    </span>
  );
}
