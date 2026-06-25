import { isAllowedCheckArtifactUrl } from "../../../src/utils/check-result";

export const CHECKS_MEDIA_DIR_ENV = "CHECKS_MEDIA_DIR";
export const CHECKS_MEDIA_BASE_URL_ENV = "CHECKS_MEDIA_BASE_URL";

export interface ChecksMediaPublisher {
  /** Filesystem directory already wired to a durable media branch/path. */
  outputDir: string;
  /** Public raw URL prefix that serves files copied into outputDir. */
  baseUrl: string;
}

function trimmed(value: string | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildChecksMediaUrl(
  publisher: ChecksMediaPublisher,
  fileName: string,
): string {
  return `${publisher.baseUrl}/${encodeURIComponent(fileName)}`;
}

/**
 * Optional durable-media publisher for verified runs.
 *
 * A runner that checks out/mounts a media branch can set both env vars; the
 * reporter copies video/trace files to CHECKS_MEDIA_DIR and writes
 * CHECKS_MEDIA_BASE_URL/<file> into `.checks/result.json`. If either value is
 * missing or the URL prefix is outside the reader's allowlist, the reporter
 * falls back to worktree-relative `.checks/*` artifacts.
 */
export function loadChecksMediaPublisher(
  env: NodeJS.ProcessEnv = process.env,
): ChecksMediaPublisher | null {
  const outputDir = trimmed(env[CHECKS_MEDIA_DIR_ENV]);
  const baseUrl = trimmed(env[CHECKS_MEDIA_BASE_URL_ENV]);
  if (!outputDir || !baseUrl) return null;

  const normalizedBaseUrl = stripTrailingSlash(baseUrl);
  if (!isAllowedCheckArtifactUrl(`${normalizedBaseUrl}/probe.webm`)) {
    return null;
  }

  return { outputDir, baseUrl: normalizedBaseUrl };
}
