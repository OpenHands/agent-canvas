import { RepositoryPage, BranchPage, InstallationPage } from "#/types/git";
import { Provider } from "#/types/settings";
import { GitChange, GitChangeDiff } from "../open-hands.types";
import V1ConversationService from "../conversation-service/v1-conversation-service.api";
import { createRemoteWorkspace } from "../typescript-client";
import { mapAnyGitStatusToV0Status } from "#/utils/git-status-mapper";
import { ProviderHandler } from "../git-providers/provider-handler";

const safeProvider = (value: string): Provider => value as Provider;

class GitService {
  static async searchGitRepositories(
    query: string,
    provider: string,
    limit = 100,
    pageId?: string,
    installationId?: string,
  ): Promise<RepositoryPage> {
    return ProviderHandler.searchRepositories(safeProvider(provider), {
      query: query || undefined,
      installationId,
      pageId,
      limit,
    });
  }

  static async retrieveUserGitRepositories(
    provider: string,
    pageId?: string,
    limit = 30,
    installationId?: string,
  ): Promise<RepositoryPage> {
    return ProviderHandler.searchRepositories(safeProvider(provider), {
      installationId,
      pageId,
      limit,
    });
  }

  static async retrieveInstallationRepositories(
    provider: string,
    installationIndex: number,
    installations: string[],
    pageId?: string,
    limit = 30,
  ): Promise<RepositoryPage> {
    const installationId = installations[installationIndex];
    if (!installationId) return { items: [], next_page_id: null };
    return ProviderHandler.searchRepositories(safeProvider(provider), {
      installationId,
      pageId,
      limit,
    });
  }

  static async getRepositoryBranches(
    repository: string,
    provider: string,
    query: string = "",
    pageId?: string,
    limit = 30,
  ): Promise<BranchPage> {
    return ProviderHandler.getBranches(safeProvider(provider), {
      repository,
      query: query || undefined,
      pageId,
      limit,
    });
  }

  static async searchRepositoryBranches(
    repository: string,
    provider: string,
    query: string,
    pageId?: string,
    limit = 30,
  ): Promise<BranchPage> {
    return ProviderHandler.getBranches(safeProvider(provider), {
      repository,
      query,
      pageId,
      limit,
    });
  }

  static async getUserInstallations(
    provider: string,
    pageId?: string,
    limit = 100,
  ): Promise<InstallationPage> {
    return ProviderHandler.getInstallations(safeProvider(provider), {
      pageId,
      limit,
    });
  }

  static async getGitChanges(conversationId: string): Promise<GitChange[]> {
    const workingDir =
      await V1ConversationService.resolveConversationWorkingDir(conversationId);
    const changes = await createRemoteWorkspace({ workingDir }).gitChanges(
      workingDir,
    );

    return changes.map((change) => ({
      path: change.path,
      status: mapAnyGitStatusToV0Status(
        String(change.status) as Parameters<
          typeof mapAnyGitStatusToV0Status
        >[0],
      ),
    }));
  }

  static async getGitChangeDiff(
    _conversationId: string,
    path: string,
  ): Promise<GitChangeDiff> {
    const diff = await createRemoteWorkspace().gitDiff(path);

    return {
      modified: diff.modified ?? "",
      original: diff.original ?? "",
    };
  }
}

export default GitService;
