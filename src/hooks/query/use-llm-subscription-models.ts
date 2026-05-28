import { useQuery } from "@tanstack/react-query";
import LLMSubscriptionService from "#/api/llm-subscription-service";
import { OPENAI_SUBSCRIPTION_MODELS } from "#/constants/llm-subscription";
import { LLM_SUBSCRIPTION_QUERY_KEYS } from "#/hooks/query/query-keys";

export function useOpenAISubscriptionModels({
  enabled = true,
}: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: LLM_SUBSCRIPTION_QUERY_KEYS.openaiModels,
    queryFn: LLMSubscriptionService.getOpenAIModels,
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
    // Fall back to the hardcoded list when the endpoint is unavailable
    placeholderData: [...OPENAI_SUBSCRIPTION_MODELS],
    meta: {
      disableToast: true,
    },
  });
}
