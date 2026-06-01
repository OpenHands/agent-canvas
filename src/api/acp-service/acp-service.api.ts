import { AcpClient } from "@openhands/typescript-client/clients";
import type { ACPAuthStatusResponse } from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";

/**
 * Canvas wrapper over the agent-server ACP routes (``/api/acp``), mirroring the
 * other ``*Service`` classes: it owns construction of the typed
 * {@link AcpClient} from the active backend's client options, so callers never
 * touch the agent-server URL / session key directly (and the
 * no-direct-agent-server-calls guard stays satisfied).
 */
class AcpService {
  /**
   * Probe whether ``server``'s ACP CLI is already authenticated on the active
   * agent-server — by a subscription login or a pre-set API key. Drives the ACP
   * handshake server-side and sends no prompt, so it spends no model tokens.
   * See ``GET /api/acp/auth-status``.
   */
  static async getAuthStatus(server: string): Promise<ACPAuthStatusResponse> {
    return new AcpClient(getAgentServerClientOptions()).getAuthStatus(server);
  }
}

export default AcpService;
