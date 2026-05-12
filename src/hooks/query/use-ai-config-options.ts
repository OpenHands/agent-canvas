import { useQuery } from "@tanstack/react-query";

export const useAIConfigOptions = () =>
  useQuery({
    queryKey: ["ai-config-options"],
    queryFn: () => ["llm", "pattern", "policy_rail"],
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 15,
  });
