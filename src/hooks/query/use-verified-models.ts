import { useQuery } from "@tanstack/react-query";
import { LLMMetadataClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "#/api/agent-server-client-options";

export const VERIFIED_MODELS_QUERY_KEY = ["config", "verified-models"] as const;
export const VERIFIED_MODELS_STALE_TIME = 1000 * 60 * 5;
export const VERIFIED_MODELS_GC_TIME = 1000 * 60 * 15;

export async function fetchVerifiedModelsByProvider(): Promise<
  Record<string, string[]>
> {
  const client = new LLMMetadataClient(getAgentServerClientOptions());
  return (await client.getVerifiedModels()) ?? {};
}

export const useVerifiedModelsByProvider = () =>
  useQuery({
    queryKey: VERIFIED_MODELS_QUERY_KEY,
    queryFn: fetchVerifiedModelsByProvider,
    staleTime: VERIFIED_MODELS_STALE_TIME,
    gcTime: VERIFIED_MODELS_GC_TIME,
  });
