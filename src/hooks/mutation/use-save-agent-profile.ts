import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentProfilesService, {
  type AgentProfileSaveInput,
} from "#/api/agent-profiles-service/agent-profiles-service.api";
import { AGENT_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";

/**
 * Default an openhands-kind profile's `skill_refs` to `null` (all
 * server-discovered skills) when the caller hasn't set it explicitly.
 *
 * `OpenHandsAgentProfile.skill_refs` defaults to `[]` (none) server-side
 * when omitted from the save payload — so a brand-new profile (onboarding's
 * seed, or "Add Agent Profile" in Settings, neither of which exposes a
 * skill_refs control) silently gets zero public/user/project skills, and a
 * profile-launched conversation's agent can't activate any of them. `null`
 * matches what users actually expect: a new agent has access to their
 * skills unless they've deliberately scoped it down.
 *
 * The pinned `@openhands/typescript-client` version doesn't type
 * `skill_refs` on `AgentProfileSaveInput` yet (SDK/wire drift — the field
 * exists server-side), so this reaches it via an untyped merge; `in` checks
 * the runtime object, since an edit's `stored` spread (mergeAgentProfileSaveInput)
 * can carry it at runtime despite the missing type.
 */
function withDefaultSkillRefs(
  profile: AgentProfileSaveInput,
): AgentProfileSaveInput {
  if (profile.agent_kind !== "openhands") return profile;
  if ("skill_refs" in profile) return profile;
  return { ...profile, skill_refs: null } as AgentProfileSaveInput;
}

export function useSaveAgentProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      profile,
    }: {
      name: string;
      profile: AgentProfileSaveInput;
    }) => AgentProfilesService.saveProfile(name, withDefaultSkillRefs(profile)),
    onSuccess: async () => {
      // Prefix match invalidates every backend/org-suffixed list key.
      await queryClient.invalidateQueries({
        queryKey: AGENT_PROFILES_QUERY_KEYS.all,
      });
    },
    // Consumers handle errors with try-catch + targeted toasts (409/422).
    meta: { disableToast: true },
  });
}
