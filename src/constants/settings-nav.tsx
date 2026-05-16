import KeyIcon from "#/icons/key.svg?react";
import LockIcon from "#/icons/lock.svg?react";
import MemoryIcon from "#/icons/memory_icon.svg?react";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import CircuitIcon from "#/icons/u-circuit.svg?react";

export interface SettingsNavItem {
  icon: React.ReactElement;
  to: string;
  text: string;
  /** Short grey subline under the page title (`settings.tsx`). */
  subtitle: string;
}

export const OSS_NAV_ITEMS: SettingsNavItem[] = [
  {
    icon: <CircuitIcon width={16} height={16} />,
    to: "/settings",
    text: "SETTINGS$NAV_LLM",
    subtitle: "SETTINGS$PAGE_LLM_SUBLINE",
  },
  {
    icon: <MemoryIcon width={16} height={16} />,
    to: "/settings/condenser",
    text: "SETTINGS$NAV_CONDENSER",
    subtitle: "SETTINGS$PAGE_CONDENSER_SUBLINE",
  },
  {
    icon: <LockIcon width={16} height={16} />,
    to: "/settings/verification",
    text: "SETTINGS$NAV_VERIFICATION",
    subtitle: "SETTINGS$PAGE_VERIFICATION_SUBLINE",
  },
  {
    icon: <SettingsGearIcon width={16} height={16} />,
    to: "/settings/app",
    text: "SETTINGS$NAV_APPLICATION",
    subtitle: "SETTINGS$PAGE_APPLICATION_SUBLINE",
  },
  {
    icon: <KeyIcon width={16} height={16} />,
    to: "/settings/secrets",
    text: "SETTINGS$NAV_SECRETS",
    subtitle: "SETTINGS$PAGE_SECRETS_SUBLINE",
  },
];
