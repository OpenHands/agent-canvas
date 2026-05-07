import {
  getAgentServerBaseUrl,
  getAgentServerSessionApiKey,
} from "../agent-server-config";
import { BUNDLED_BACKEND_ID, type Backend } from "./types";

export const BUNDLED_BACKEND_NAME = "Local";

export function getBundledBackend(): Backend {
  return {
    id: BUNDLED_BACKEND_ID,
    name: BUNDLED_BACKEND_NAME,
    host: getAgentServerBaseUrl(),
    apiKey: getAgentServerSessionApiKey() ?? "",
    kind: "local",
  };
}
