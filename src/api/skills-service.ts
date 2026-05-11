import { SkillInfo } from "#/types/settings";
import { getAgentServerWorkingDir } from "./agent-server-config";
import { getActiveBackend } from "./backend-registry/active-store";
import { fetchCloudSkills } from "./cloud/skills-service.api";
import { createSkillsClient } from "./typescript-client";

class SkillsService {
  static async getSkills(): Promise<SkillInfo[]> {
    if (getActiveBackend().backend.kind === "cloud") {
      return fetchCloudSkills();
    }

    // Always load public skills on the global Skills settings page so the user
    // sees the available catalog even on a fresh dev environment with no local
    // user/project skills. Conversation creation paths still gate on
    // shouldLoadPublicSkills() to keep new-conversation latency low.
    const response = await createSkillsClient().getSkills({
      load_public: true,
      load_user: true,
      load_project: true,
      load_org: false,
      project_dir: getAgentServerWorkingDir(),
    });

    return (response.skills ?? []) as SkillInfo[];
  }
}

export default SkillsService;
