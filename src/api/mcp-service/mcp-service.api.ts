import { MCPClient } from "@openhands/typescript-client/clients";
import type { MCPTestRequest } from "@openhands/typescript-client";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import {
  getActiveBackend,
  getRegisteredBackends,
} from "../backend-registry/active-store";
import { getCredentialValidationForServer } from "#/utils/mcp-credential-validation";
import type { MCPAuthCredential } from "#/types/mcp-auth";
import type {
  ExtendedMCPTestResponse,
  MCPOAuthStartResponse,
  MCPOAuthStatusResponse,
  MCPServerConfig,
} from "#/types/mcp-server";
import { substituteRedactedMcpCredentials } from "./mcp-redacted-credentials";

const OAUTH_MCP_TEST_TIMEOUT_SECONDS = 120;

type MCPTestServer = {
  transport?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  auth?: MCPAuthCredential;
};

interface ExtendedMCPTestRequest {
  server: MCPTestServer;
  name?: string;
  timeout?: number;
  tool_call?: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

function toMcpServer(server: MCPServerConfig): MCPTestServer {
  if (server.type === "stdio") {
    return {
      transport: "stdio",
      command: server.command!,
      ...(server.args?.length && { args: server.args }),
      ...(server.env &&
        Object.keys(server.env).length > 0 && { env: server.env }),
    };
  }
  return {
    transport: server.type === "sse" ? "sse" : "http",
    url: server.url!,
    ...(server.headers &&
      Object.keys(server.headers).length > 0 && { headers: server.headers }),
    ...(server.auth ? { auth: server.auth } : {}),
  };
}

function getMcpTestTimeout(server: MCPServerConfig): number | undefined {
  if (server.auth?.strategy !== "oauth2") return server.timeout;
  return OAUTH_MCP_TEST_TIMEOUT_SECONDS;
}

async function buildMcpTestRequest(
  server: MCPServerConfig,
): Promise<ExtendedMCPTestRequest> {
  const validation = getCredentialValidationForServer(server);
  const serverSpec = toMcpServer(
    await substituteRedactedMcpCredentials(server),
  );
  const timeout = getMcpTestTimeout(server);
  return {
    server: serverSpec,
    ...(server.name ? { name: server.name } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    ...(validation ? { tool_call: validation.toolCall } : {}),
  };
}

function getMcpProbeOptions(): { host: string; apiKey?: string } {
  const active = getActiveBackend().backend;
  if (active.kind === "local") {
    const { host, apiKey } = getAgentServerClientOptions();
    return { host, ...(apiKey ? { apiKey } : {}) };
  }

  const localBackend = getRegisteredBackends().find(
    (backend) => backend.kind === "local" && backend.host,
  );
  if (localBackend) {
    return {
      host: localBackend.host.replace(/\/+$/, ""),
      ...(localBackend.apiKey ? { apiKey: localBackend.apiKey } : {}),
    };
  }
  throw new Error("OAuth authorization requires a reachable local backend.");
}

function createMcpProbeClient(): MCPClient {
  const { host, apiKey } = getMcpProbeOptions();
  return new MCPClient({
    host,
    ...(apiKey ? { apiKey } : {}),
    timeout: OAUTH_MCP_TEST_TIMEOUT_SECONDS * 1000 + 5000,
  });
}

function oauthStatusToTestResponse(
  status: MCPOAuthStatusResponse,
): ExtendedMCPTestResponse {
  if (status.status === "succeeded") {
    return {
      ok: true,
      tools: status.tools ?? [],
      ...(status.tool_result !== undefined && {
        tool_result: status.tool_result,
      }),
      ...(status.oauth_state !== undefined && {
        oauth_state: status.oauth_state,
      }),
    };
  }
  return {
    ok: false,
    error: status.error || "OAuth authorization did not complete",
    error_kind: status.error_kind || "unknown",
  };
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

class McpService {
  static async testServer(
    server: MCPServerConfig,
  ): Promise<ExtendedMCPTestResponse> {
    // The MCP connectivity-test endpoint lives on the local agent-server. It
    // spawns the configured stdio command / opens an SSE-or-SHTTP connection
    // from that process's environment. Cloud backends don't expose this
    // endpoint to the frontend — the MCP server would actually run inside the
    // cloud sandbox, which isn't reachable from the browser before the user
    // starts a conversation. Calling `getAgentServerClientOptions()` here for
    // a cloud-active session would throw `NoBackendAvailableError("No backend
    // is configured.")` and block the install flow entirely. Short-circuit
    // with a synthetic success so saving proceeds; any real connection
    // failure surfaces inside the conversation runtime instead.
    if (getActiveBackend().backend.kind === "cloud") {
      return { ok: true, tools: [] };
    }
    const validation = getCredentialValidationForServer(server);
    const { host, apiKey } = getAgentServerClientOptions();
    const client = new MCPClient({ host, ...(apiKey ? { apiKey } : {}) });
    try {
      const request = await buildMcpTestRequest(server);
      const result = (await client.testServer(
        request as MCPTestRequest,
      )) as ExtendedMCPTestResponse;
      if (result.ok && validation && result.tool_result) {
        const credentialError = validation.interpret(result.tool_result);
        if (credentialError) {
          return {
            ok: false,
            error: credentialError,
            error_kind: "credentials",
          };
        }
      }
      return result;
    } finally {
      client.close();
    }
  }

  static async startOAuth(
    server: MCPServerConfig,
  ): Promise<MCPOAuthStartResponse> {
    const client = createMcpProbeClient();
    try {
      return await McpService.startOAuthWithClient(client, server);
    } finally {
      client.close();
    }
  }

  static async getOAuthStatus(jobId: string): Promise<MCPOAuthStatusResponse> {
    const client = createMcpProbeClient();
    try {
      return await McpService.getOAuthStatusWithClient(client, jobId);
    } finally {
      client.close();
    }
  }

  static async submitOAuthCallback(
    jobId: string,
    callbackUrl: string,
  ): Promise<MCPOAuthStatusResponse> {
    const client = createMcpProbeClient();
    try {
      return await McpService.submitOAuthCallbackWithClient(
        client,
        jobId,
        callbackUrl,
      );
    } finally {
      client.close();
    }
  }

  static async authorizeOAuth(
    server: MCPServerConfig,
  ): Promise<ExtendedMCPTestResponse> {
    const popup = window.open("about:blank", "_blank");
    const client = createMcpProbeClient();
    try {
      const start = await McpService.startOAuthWithClient(client, server);
      if (!start.ok || !start.job_id || !start.authorization_url) {
        popup?.close();
        return {
          ok: false,
          error: start.error || "Could not start OAuth authorization",
          error_kind: start.error_kind || "unknown",
        };
      }

      let status = await McpService.getOAuthStatusWithClient(
        client,
        start.job_id,
      );
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (status.status === "succeeded" || status.status === "failed") {
          popup?.close();
          return oauthStatusToTestResponse(status);
        }
        if (status.callback_ready) break;
        await sleep(250);
        status = await McpService.getOAuthStatusWithClient(
          client,
          start.job_id,
        );
      }

      if (popup) {
        popup.location.href = start.authorization_url;
      }

      for (
        let attempt = 0;
        attempt < OAUTH_MCP_TEST_TIMEOUT_SECONDS;
        attempt += 1
      ) {
        await sleep(1000);
        status = await McpService.getOAuthStatusWithClient(
          client,
          start.job_id,
        );
        if (status.status === "succeeded" || status.status === "failed") {
          popup?.close();
          return oauthStatusToTestResponse(status);
        }
      }

      return {
        ok: false,
        error: "OAuth authorization timed out",
        error_kind: "timeout",
      };
    } finally {
      client.close();
    }
  }

  private static async startOAuthWithClient(
    client: MCPClient,
    server: MCPServerConfig,
  ): Promise<MCPOAuthStartResponse> {
    const request = await buildMcpTestRequest(server);
    return client.startOAuth(request as MCPTestRequest);
  }

  private static async getOAuthStatusWithClient(
    client: MCPClient,
    jobId: string,
  ): Promise<MCPOAuthStatusResponse> {
    return client.getOAuthStatus(jobId);
  }

  private static async submitOAuthCallbackWithClient(
    client: MCPClient,
    jobId: string,
    callbackUrl: string,
  ): Promise<MCPOAuthStatusResponse> {
    return client.submitOAuthCallback(jobId, { callback_url: callbackUrl });
  }
}

export default McpService;
