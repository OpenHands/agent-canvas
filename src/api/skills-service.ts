import type {
  InstalledSkillInfo,
  InstalledSkillSummary,
  MarketplaceResponse,
  SkillActionResponse,
  ToggleSkillResponse,
} from "@openhands/typescript-client";
import { SkillsClient } from "@openhands/typescript-client/clients";
import { SkillInfo } from "#/types/settings";
import { getAgentServerWorkingDir } from "./agent-server-config";
import { getActiveBackend } from "./backend-registry/active-store";
import { fetchCloudSkills } from "./cloud/skills-service.api";
import { getAgentServerClientOptions } from "./agent-server-client-options";

class SkillsService {
  private static client(): SkillsClient {
    return new SkillsClient(getAgentServerClientOptions());
  }

  static async getSkills(): Promise<SkillInfo[]> {
    if (getActiveBackend().backend.kind === "cloud") {
      return fetchCloudSkills();
    }

    const response = await SkillsService.client().getSkills({
      load_public: true,
      load_user: true,
      load_project: true,
      load_org: false,
      project_dir: getAgentServerWorkingDir(),
    });

    return (response.skills ?? []) as SkillInfo[];
  }

  static async listInstalledSkills(): Promise<InstalledSkillSummary[]> {
    const response = await SkillsService.client().listInstalledSkills();
    return response.skills;
  }

  static async installSkill(source: string): Promise<InstalledSkillInfo> {
    return SkillsService.client().installSkill({ source });
  }

  static async uninstallSkill(name: string): Promise<SkillActionResponse> {
    return SkillsService.client().uninstallSkill(name);
  }

  static async toggleInstalledSkill(
    name: string,
    enabled: boolean,
  ): Promise<ToggleSkillResponse> {
    return SkillsService.client().toggleSkill(name, enabled);
  }

  static async getMarketplace(): Promise<MarketplaceResponse> {
    return SkillsService.client().getMarketplace();
  }
}

export default SkillsService;
