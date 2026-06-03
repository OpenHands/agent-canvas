import {
  getAgentServerBaseUrl,
  getAgentServerSessionApiKey,
} from "../agent-server-config";
import type { Backend } from "./types";

/**
 * Stable id for the default local backend that is auto-seeded into the
 * registry when the launcher provides both a backend host and API key.
 * After seeding, this backend is a normal registered entry — the user can
 * rename it, edit its host/api key, or remove it like any other backend.
 */
export const DEFAULT_LOCAL_BACKEND_ID = "default-local";

export const DEFAULT_LOCAL_BACKEND_NAME = "Local";

/**
 * Construct the default local backend from environment/runtime config.
 * Returns null unless both a backend location and API key are available.
 *
 * Used as the seed entry written to `openhands-backends` on first load;
 * if it returns null, onboarding is responsible for collecting backend
 * connection details from the user.
 */
export function makeDefaultLocalBackend(): Backend | null {
  const host = getAgentServerBaseUrl();
  const apiKey = getAgentServerSessionApiKey();

  if (!host || !apiKey) return null;

  return {
    id: DEFAULT_LOCAL_BACKEND_ID,
    name: DEFAULT_LOCAL_BACKEND_NAME,
    host,
    apiKey,
    kind: "local",
  };
}
