import { DEFAULT_WORKING_DIR } from "#/api/agent-server-config";

export function getGitPath(
  selectedRepository: string | null | undefined,
  workingDir?: string | null,
  localGitDetectedRepo?: string | null,
): string {
  // When a repository is selected, derive the path from selectedRepository.
  // We prioritize selectedRepository over workingDir because workingDir is
  // updated asynchronously by the agent after cloning and may be stale
  // during repository switches, while selectedRepository is set immediately
  // when the user selects a repository.
  if (selectedRepository) {
    const parts = selectedRepository.split("/");
    const repoName = parts[parts.length - 1];
    return `${DEFAULT_WORKING_DIR}/${repoName}`;
  }

  // Fall back to a repo detected via local git probe. This handles the case
  // where the agent autonomously clones a repo and git info is detected
  // locally but selected_repository hasn't been set via the UI yet.
  if (localGitDetectedRepo) {
    const parts = localGitDetectedRepo.split("/");
    const repoName = parts[parts.length - 1];
    return `${DEFAULT_WORKING_DIR}/${repoName}`;
  }

  const normalizedWorkingDir = workingDir?.trim();
  if (normalizedWorkingDir) {
    return normalizedWorkingDir;
  }

  return DEFAULT_WORKING_DIR;
}
