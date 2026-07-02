import type { ReactNode } from "react";
import { Typography } from "#/ui/typography";

interface SectionShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** Consistent header (title + one-line description) for an editor detail pane. */
export function SectionShell({
  title,
  description,
  children,
}: SectionShellProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Typography.Text className="text-base font-medium text-white">
          {title}
        </Typography.Text>
        {description && (
          <Typography.Text className="text-xs text-[#A3A3A3]">
            {description}
          </Typography.Text>
        )}
      </div>
      {children}
    </div>
  );
}
