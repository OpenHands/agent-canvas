import { NavigationLink } from "#/components/shared/navigation-link";
import { cn } from "#/utils/utils";
import SparkleIcon from "#/icons/sparkle.svg?react";
import PuzzleIcon from "#/icons/puzzle.svg?react";
import ServerProcessIcon from "#/icons/server-process.svg?react";

interface ExtensionNavItem {
  to: string;
  label: string;
  icon: React.ReactElement;
  end?: boolean;
}

const EXTENSIONS_NAV_ITEMS: ExtensionNavItem[] = [
  {
    to: "/skills",
    label: "Skills",
    icon: <SparkleIcon width={16} height={16} />,
    end: true,
  },
  {
    to: "/skills/plugins",
    label: "Plugins",
    icon: <PuzzleIcon width={16} height={16} />,
    end: true,
  },
  {
    to: "/mcp",
    label: "MCP Servers",
    icon: <ServerProcessIcon width={16} height={16} />,
    end: true,
  },
];

export function ExtensionsNavigation() {
  return (
    <aside
      data-testid="extensions-navbar-desktop"
      className="hidden md:flex md:w-[260px] md:shrink-0 md:flex-col md:gap-2 md:sticky md:top-8 md:self-start md:pl-[14px]"
    >
      <span className="px-3 text-xs font-semibold uppercase tracking-wider text-[#A3A3A3]">
        Extensions
      </span>
      <div className="flex flex-col gap-0.5 pt-0.5">
        {EXTENSIONS_NAV_ITEMS.map((item) => (
          <NavigationLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={`sidebar-extensions-${item.to}`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md transition-colors text-sm leading-5 truncate px-2 py-2 w-full",
                isActive
                  ? "bg-[#1f1f1f99] text-white font-medium"
                  : "text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99]",
              )
            }
          >
            <span className="shrink-0 flex items-center justify-center">
              {item.icon}
            </span>
            <span className="truncate">{item.label}</span>
          </NavigationLink>
        ))}
      </div>
    </aside>
  );
}
