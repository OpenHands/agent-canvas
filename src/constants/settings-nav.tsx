import KeyIcon from "#/icons/key.svg?react";
import LockIcon from "#/icons/lock.svg?react";
import MemoryIcon from "#/icons/memory_icon.svg?react";
import ServerProcessIcon from "#/icons/server-process.svg?react";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import CircuitIcon from "#/icons/u-circuit.svg?react";

export interface SettingsNavItem {
  icon: React.ReactElement;
  to: string;
  text: string;
}

export const OSS_NAV_ITEMS: SettingsNavItem[] = [
  {
    icon: <CircuitIcon width={16} height={16} />,
    to: "/settings",
    text: "SETTINGS$NAV_LLM",
  },
  {
    icon: <MemoryIcon width={16} height={16} />,
    to: "/settings/condenser",
    text: "SETTINGS$NAV_CONDENSER",
  },
  {
    icon: <LockIcon width={16} height={16} />,
    to: "/settings/verification",
    text: "SETTINGS$NAV_VERIFICATION",
  },
  {
    icon: <ServerProcessIcon width={16} height={16} />,
    to: "/settings/mcp",
    text: "SETTINGS$NAV_MCP",
  },
  {
    icon: <SettingsGearIcon width={16} height={16} />,
    to: "/settings/app",
    text: "SETTINGS$NAV_APPLICATION",
  },
  {
    icon: <KeyIcon width={16} height={16} />,
    to: "/settings/secrets",
    text: "SETTINGS$NAV_SECRETS",
  },
];
