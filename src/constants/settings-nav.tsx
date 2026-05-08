import KeyIcon from "#/icons/key.svg?react";
import LightbulbIcon from "#/icons/lightbulb.svg?react";
import LockIcon from "#/icons/lock.svg?react";
import MemoryIcon from "#/icons/memory_icon.svg?react";
import ServerProcessIcon from "#/icons/server-process.svg?react";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import CircuitIcon from "#/icons/u-circuit.svg?react";
import PuzzlePieceIcon from "#/icons/u-puzzle-piece.svg?react";

export interface SettingsNavItem {
  icon: React.ReactElement;
  to: string;
  text: string;
}

export const OSS_NAV_ITEMS: SettingsNavItem[] = [
  {
    icon: <CircuitIcon width={22} height={22} />,
    to: "/settings",
    text: "SETTINGS$NAV_LLM",
  },
  {
    icon: <MemoryIcon width={22} height={22} />,
    to: "/settings/condenser",
    text: "SETTINGS$NAV_CONDENSER",
  },
  {
    icon: <LockIcon width={22} height={22} />,
    to: "/settings/verification",
    text: "SETTINGS$NAV_VERIFICATION",
  },
  {
    icon: <ServerProcessIcon width={22} height={22} />,
    to: "/settings/mcp",
    text: "SETTINGS$NAV_MCP",
  },
  {
    icon: <LightbulbIcon width={22} height={22} />,
    to: "/settings/skills",
    text: "SETTINGS$NAV_SKILLS",
  },
  {
    icon: <PuzzlePieceIcon width={22} height={22} />,
    to: "/settings/integrations",
    text: "SETTINGS$NAV_INTEGRATIONS",
  },
  {
    icon: <SettingsGearIcon width={22} height={22} />,
    to: "/settings/app",
    text: "SETTINGS$NAV_APPLICATION",
  },
  {
    icon: <KeyIcon width={22} height={22} />,
    to: "/settings/secrets",
    text: "SETTINGS$NAV_SECRETS",
  },
];
