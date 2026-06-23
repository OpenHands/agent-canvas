import { AppWindow, Boxes, Server } from "lucide-react";
import KeyIcon from "#/icons/key.svg?react";
import CircuitIcon from "#/icons/u-circuit.svg?react";
import RobotIcon from "#/icons/u-robot.svg?react";
import SkillsIcon from "#/icons/skills.svg?react";

export interface SettingsNavItem {
  icon: React.ReactElement;
  to: string;
  text: string;
  /** Short grey subline under the page title (`settings.tsx`). */
  subtitle: string;
}

// Settings shrank to genuinely cross-cutting items (#1456); everything
// agent-related moved to the Agents hub (`AGENTS_HUB_NAV_ITEMS`).
export const OSS_NAV_ITEMS: SettingsNavItem[] = [
  {
    icon: <AppWindow className="size-4" strokeWidth={2} aria-hidden />,
    to: "/settings/app",
    text: "SETTINGS$NAV_APPLICATION",
    subtitle: "SETTINGS$PAGE_APPLICATION_SUBLINE",
  },
];

// The Agents hub: the profile library (compose) + the building blocks
// (defined once, referenced by profiles). See #1456.
export const AGENTS_HUB_NAV_ITEMS: SettingsNavItem[] = [
  {
    icon: <RobotIcon width={16} height={16} />,
    to: "/agents/profiles",
    text: "SETTINGS$NAV_AGENT_PROFILES",
    subtitle: "SETTINGS$PAGE_AGENT_PROFILES_SUBLINE",
  },
  {
    icon: <CircuitIcon width={16} height={16} />,
    to: "/agents/llm",
    text: "SETTINGS$NAV_LLM",
    subtitle: "SETTINGS$PAGE_LLM_SUBLINE",
  },
  {
    icon: <Server className="size-4" strokeWidth={2} aria-hidden />,
    to: "/agents/mcp",
    text: "SETTINGS$NAV_MCP",
    subtitle: "MCP$PAGE_DESCRIPTION",
  },
  {
    icon: <SkillsIcon width={16} height={16} />,
    to: "/agents/skills",
    text: "SETTINGS$NAV_SKILLS",
    subtitle: "SETTINGS$SKILLS_TITLE",
  },
  {
    icon: <Boxes className="size-4" strokeWidth={2} aria-hidden />,
    to: "/agents/plugins",
    text: "SETTINGS$PLUGINS_TITLE",
    subtitle: "SETTINGS$PLUGINS_DESCRIPTION",
  },
  {
    icon: <KeyIcon width={16} height={16} />,
    to: "/agents/secrets",
    text: "SETTINGS$NAV_SECRETS",
    subtitle: "SETTINGS$PAGE_SECRETS_SUBLINE",
  },
];
