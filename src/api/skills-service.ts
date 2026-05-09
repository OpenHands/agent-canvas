import { SkillInfo } from "#/types/settings";
import {
  getAgentServerWorkingDir,
  shouldLoadPublicSkills,
} from "./agent-server-config";
import { getActiveBackend } from "./backend-registry/active-store";
import { fetchCloudSkills } from "./cloud/skills-service.api";
import { createSkillsClient } from "./typescript-client";

class SkillsService {
  static async getSkills(): Promise<SkillInfo[]> {
    if (getActiveBackend().backend.kind === "cloud") {
      return fetchCloudSkills();
    }

    const response = await createSkillsClient().getSkills({
      load_public: shouldLoadPublicSkills(),
      load_user: true,
      load_project: true,
      load_org: false,
      project_dir: getAgentServerWorkingDir(),
    });

    return (response.skills ?? []) as SkillInfo[];
  }
}

export default SkillsService;
