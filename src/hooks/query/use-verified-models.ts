import { LLMMetadataClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { callCloudProxy } from "#/api/cloud/proxy";

export const VERIFIED_MODELS_QUERY_KEY = ["config", "verified-models"] as const;
export const VERIFIED_MODELS_STALE_TIME = 1000 * 60 * 5;
export const VERIFIED_MODELS_GC_TIME = 1000 * 60 * 15;

export async function fetchVerifiedModelsByProvider(): Promise<
  Record<string, string[]>
> {
  const active = getActiveBackend();
  if (active.backend.kind === "cloud") {
    const result = await callCloudProxy<Record<string, string[]> | null>({
      backend: active.backend,
      method: "GET",
      path: "/api/llm/models/verified",
    });
    return result ?? {};
  }
  const client = new LLMMetadataClient(getAgentServerClientOptions());
  return (await client.getVerifiedModels()) ?? {};
}
