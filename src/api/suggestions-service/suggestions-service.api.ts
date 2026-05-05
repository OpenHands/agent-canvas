import { SuggestedTask } from "#/utils/types";
import { ProviderHandler } from "../git-providers/provider-handler";

export class SuggestionsService {
  /**
   * Aggregate suggested tasks across every configured git provider.
   *
   * Mirrors the OSS /api/v1/git/suggested-tasks/search shape but resolves
   * tasks client-side because the agent-server runtime has no integrations
   * router.
   */
  static async getSuggestedTasks(
    pageId?: string,
    limit: number = 30,
  ): Promise<SuggestedTask[]> {
    const page = await ProviderHandler.getSuggestedTasks(pageId, limit);
    return page.items;
  }
}
