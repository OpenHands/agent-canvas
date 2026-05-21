import { SkillsClient } from "@openhands/typescript-client/clients";
import { SkillInfo } from "#/types/settings";
import { getAgentServerWorkingDir } from "./agent-server-config";
import { getActiveBackend } from "./backend-registry/active-store";
import { fetchCloudSkills } from "./cloud/skills-service.api";
import { getAgentServerClientOptions } from "./agent-server-client-options";

/**
 * SDK ``Skill`` wire shape (a subset of the fields on
 * ``openhands.sdk.skills.skill.Skill``). The agent-server accepts this under
 * ``agent.agent_context.skills`` to seed a conversation with explicit skills.
 * It is intentionally not the same as ``SkillInfo`` — ``SkillInfo`` is the
 * flattened catalog shape returned by the skills endpoint.
 */
type SkillWire = {
  name: string;
  content: string;
  source: string | null;
  description: string | null;
  is_agentskills_format: boolean;
  disable_model_invocation: boolean;
  trigger?:
    | { type: "keyword"; keywords: string[] }
    | { type: "task"; triggers: string[] };
};

/**
 * Reverse the agent-server's ``Skill.to_skill_info()``: rebuild a ``Skill``
 * payload from the flattened ``SkillInfo`` returned by the skills endpoint.
 *
 * ``SkillInfo`` collapses the trigger into a plain ``triggers`` string list,
 * dropping the ``KeywordTrigger`` vs ``TaskTrigger`` distinction, so we
 * reconstruct it the way the SDK's own loaders do: AgentSkills-format skills
 * with triggers use a ``TaskTrigger``, legacy/knowledge skills use a
 * ``KeywordTrigger``, and skills without triggers stay always-active
 * (``trigger: None`` → injected as repo context).
 */
function skillInfoToSkill(info: SkillInfo): SkillWire {
  const triggers = info.triggers ?? [];
  const trigger =
    triggers.length === 0
      ? undefined
      : info.is_agentskills_format
        ? ({ type: "task", triggers } as const)
        : ({ type: "keyword", keywords: triggers } as const);

  return {
    name: info.name,
    content: info.content ?? "",
    source: info.source ?? null,
    description: info.description ?? null,
    is_agentskills_format: info.is_agentskills_format ?? false,
    disable_model_invocation: info.disable_model_invocation ?? false,
    ...(trigger ? { trigger } : {}),
  };
}

class SkillsService {
  /**
   * @param projectDir Workspace root to load project skills from. Defaults to
   *   the configured global workspace dir. Conversation-scoped callers pass the
   *   conversation's own workspace so the catalog (and the slash-command menu)
   *   matches the project skills actually loaded into that conversation.
   */
  static async getSkills(projectDir?: string): Promise<SkillInfo[]> {
    if (getActiveBackend().backend.kind === "cloud") {
      return fetchCloudSkills();
    }

    // Always load public skills on the global Skills settings page so the user
    // sees the available catalog even on a fresh dev environment with no local
    // user/project skills. Conversation creation paths still gate on
    // shouldLoadPublicSkills() to keep new-conversation latency low.
    const response = await new SkillsClient(
      getAgentServerClientOptions(),
    ).getSkills({
      load_public: true,
      load_user: true,
      load_project: true,
      load_org: false,
      project_dir: projectDir ?? getAgentServerWorkingDir(),
    });

    return (response.skills ?? []) as SkillInfo[];
  }

  /**
   * Load project skills (``.agents/skills/`` in the workspace) as ``Skill``
   * wire objects to inject into a new conversation's ``agent_context``.
   *
   * Project skills are visible on the Skills settings page but are *not*
   * auto-loaded into conversations: an ``AgentContext`` only auto-loads user
   * and public skills (``load_user_skills`` / ``load_public_skills``), and
   * agent-server 1.23.0 exposes no wire field to request project skills for a
   * conversation (``AgentContext._load_auto_skills`` hardcodes
   * ``include_project=False``). Loading them here and seeding
   * ``agent_context.skills`` is the only way to honor repo skills against the
   * pinned SDK — see ``createAgentFromSettings``.
   *
   * Returns ``[]`` for cloud backends (project skills don't apply there) and
   * on any load failure, so a skills hiccup never blocks starting a
   * conversation.
   */
  static async getProjectSkills(projectDir?: string): Promise<SkillWire[]> {
    if (getActiveBackend().backend.kind === "cloud") {
      return [];
    }

    try {
      const response = await new SkillsClient(
        getAgentServerClientOptions(),
      ).getSkills({
        load_public: false,
        load_user: false,
        load_project: true,
        load_org: false,
        project_dir: projectDir ?? getAgentServerWorkingDir(),
      });

      return ((response.skills ?? []) as SkillInfo[]).map(skillInfoToSkill);
    } catch (error) {
      console.warn("Failed to load project skills for conversation:", error);
      return [];
    }
  }
}

export default SkillsService;
