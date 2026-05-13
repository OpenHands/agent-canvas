import KeyIcon from "#/icons/key.svg?react";
import LockIcon from "#/icons/lock.svg?react";
import MemoryIcon from "#/icons/memory_icon.svg?react";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import CircuitIcon from "#/icons/u-circuit.svg?react";

export interface SettingsNavItem {
  icon: React.ReactElement;
  to: string;
  text: string;
  // When true, this item is greyed out (and its route redirects to
  // ``/settings/agent``) while the active agent is ACP. The ACP sub-agent
  // manages its own LLM / condenser / MCP, so these OpenHands-side
  // surfaces have nothing useful to configure. Drives both the navigation
  // disable in ``use-settings-nav-items.ts`` and the loader redirect in
  // ``routes/settings.tsx`` from a single source.
  disabledByAcp?: boolean;
}

export const OSS_NAV_ITEMS: SettingsNavItem[] = [
  {
    icon: <CircuitIcon width={22} height={22} />,
    to: "/settings/agent",
    text: "SETTINGS$NAV_AGENT",
  },
  {
    icon: <CircuitIcon width={22} height={22} />,
    to: "/settings",
    text: "SETTINGS$NAV_LLM",
    disabledByAcp: true,
  },
  {
    icon: <MemoryIcon width={22} height={22} />,
    to: "/settings/condenser",
    text: "SETTINGS$NAV_CONDENSER",
    disabledByAcp: true,
  },
  {
    icon: <LockIcon width={22} height={22} />,
    to: "/settings/verification",
    text: "SETTINGS$NAV_VERIFICATION",
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
