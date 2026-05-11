import { RepositoryPage, BranchPage, InstallationPage } from "#/types/git";
import { Provider } from "#/types/settings";
import { GitChange, GitChangeDiff } from "../open-hands.types";
import AgentServerConversationService from "../conversation-service/agent-server-conversation-service.api";
import { createRemoteWorkspace } from "../typescript-client";
import { mapAnyGitStatusToClientStatus } from "#/utils/git-status-mapper";
import { ProviderHandler } from "../git-providers/provider-handler";
import { getActiveBackend } from "../backend-registry/active-store";
import {
  getCloudInstallations,
  getCloudRepositoryBranches,
  searchCloudRepositories,
} from "../cloud/git-service.api";

const safeProvider = (value: string): Provider => value as Provider;

const isCloudActive = () => getActiveBackend().backend.kind === "cloud";

class GitService {
  static async searchGitRepositories(
    query: string,
    provider: string,
    limit = 100,
    pageId?: string,
    installationId?: string,
  ): Promise<RepositoryPage> {
    if (isCloudActive()) {
      return searchCloudRepositories({
        provider: safeProvider(provider),
        query: query || undefined,
        limit,
        pageId,
        installationId,
      });
    }
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
    if (isCloudActive()) {
      return searchCloudRepositories({
        provider: safeProvider(provider),
        limit,
        pageId,
        installationId,
      });
    }
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
    if (isCloudActive()) {
      return searchCloudRepositories({
        provider: safeProvider(provider),
        installationId,
        limit,
        pageId,
      });
    }
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
    if (isCloudActive()) {
      return getCloudRepositoryBranches({
        provider: safeProvider(provider),
        repository,
        query: query || undefined,
        pageId,
        limit,
      });
    }
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
    if (isCloudActive()) {
      return getCloudRepositoryBranches({
        provider: safeProvider(provider),
        repository,
        query,
        pageId,
        limit,
      });
    }
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
    if (isCloudActive()) {
      return getCloudInstallations({
        provider: safeProvider(provider),
        pageId,
        limit,
      });
    }
    return ProviderHandler.getInstallations(safeProvider(provider), {
      pageId,
      limit,
    });
  }

  static async getGitChanges(conversationId: string): Promise<GitChange[]> {
    const workingDir =
      await AgentServerConversationService.resolveConversationWorkingDir(
        conversationId,
      );
    const changes = await createRemoteWorkspace({ workingDir }).gitChanges(
      workingDir,
      { ref: "HEAD" },
    );

    return changes.map((change) => ({
      path: change.path,
      status: mapAnyGitStatusToClientStatus(
        String(change.status) as Parameters<
          typeof mapAnyGitStatusToClientStatus
        >[0],
      ),
    }));
  }

  static async getGitChangeDiff(
    _conversationId: string,
    path: string,
  ): Promise<GitChangeDiff> {
    const diff = await createRemoteWorkspace().gitDiff(path, { ref: "HEAD" });

    return {
      modified: diff.modified ?? "",
      original: diff.original ?? "",
    };
  }
}

export default GitService;
