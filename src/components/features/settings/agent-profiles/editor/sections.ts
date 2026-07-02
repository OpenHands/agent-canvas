import { I18nKey } from "#/i18n/declaration";
import type { AgentKind } from "./use-agent-profile-form";

export type SectionId =
  | "overview"
  | "general"
  | "model"
  | "tools-mcp"
  | "condenser"
  | "provider-model"
  | "launch"
  | "mcp"
  | "authentication";

export interface SectionDef {
  id: SectionId;
  labelKey: I18nKey;
  /** Which agent kinds show this section (kind-aware nav). */
  kinds: AgentKind[];
}

/**
 * The ordered section list for the master-detail editor. The nav renders only
 * the entries whose `kinds` include the profile's kind, so the OpenHands/ACP
 * asymmetry surfaces as a shorter list rather than greyed-out pages.
 */
const SECTIONS: SectionDef[] = [
  {
    id: "overview",
    labelKey: I18nKey.SETTINGS$AGENT_SECTION_OVERVIEW,
    kinds: ["openhands", "acp"],
  },
  {
    id: "general",
    labelKey: I18nKey.SETTINGS$AGENT_SECTION_GENERAL,
    kinds: ["openhands", "acp"],
  },
  // OpenHands
  {
    id: "model",
    labelKey: I18nKey.SETTINGS$AGENT_SECTION_MODEL,
    kinds: ["openhands"],
  },
  {
    id: "tools-mcp",
    labelKey: I18nKey.SETTINGS$AGENT_SECTION_MCP,
    kinds: ["openhands"],
  },
  {
    id: "condenser",
    labelKey: I18nKey.SETTINGS$NAV_CONDENSER,
    kinds: ["openhands"],
  },
  // ACP
  {
    id: "provider-model",
    labelKey: I18nKey.SETTINGS$AGENT_SECTION_PROVIDER_MODEL,
    kinds: ["acp"],
  },
  {
    id: "launch",
    labelKey: I18nKey.SETTINGS$AGENT_SECTION_LAUNCH,
    kinds: ["acp"],
  },
  {
    id: "mcp",
    labelKey: I18nKey.SETTINGS$AGENT_SECTION_MCP,
    kinds: ["acp"],
  },
  {
    id: "authentication",
    labelKey: I18nKey.SETTINGS$AGENT_SECTION_AUTHENTICATION,
    kinds: ["acp"],
  },
];

export function getSectionsForKind(kind: AgentKind): SectionDef[] {
  return SECTIONS.filter((s) => s.kinds.includes(kind));
}
