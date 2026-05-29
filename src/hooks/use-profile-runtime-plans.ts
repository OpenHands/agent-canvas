import { useMemo } from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useSettings } from "#/hooks/query/use-settings";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useModelStore } from "#/stores/model-store";
import { getAcpProvider } from "#/constants/acp-providers";
import type { ProfileInfo } from "#/api/profiles-service/profiles-service.api";
import {
  deriveProfileRuntimePlan,
  normalizeLlmProfile,
  type ConversationRuntimeContext,
  type ProfileRuntimePlan,
} from "#/utils/agent-profiles/runtime-plan";

export interface ProfileWithPlan {
  profile: ProfileInfo;
  plan: ProfileRuntimePlan;
}

export interface ProfileRuntimePlans {
  /** Saved AgentProfiles paired with their runtime-compatibility verdict. */
  profiles: ProfileWithPlan[];
  /** Name of the profile currently driving the conversation, if known. */
  activeProfileName: string | null;
  /** True when the conversation/home context runs an ACP agent. */
  isAcpContext: boolean;
}

/**
 * Resolve the active profile name the same way the chip label does:
 *   1. Optimistic (just-clicked) value — instant feedback before the refetch.
 *   2. Profile whose model matches the running ``llm_model`` — cold loads.
 *   3. The user-level ``active_profile`` — home page / before any messages.
 */
function resolveActiveProfileName(
  profiles: ProfileInfo[],
  conversationModel: string | null,
  userActiveProfile: string | null,
  optimistic: string | undefined,
): string | null {
  if (optimistic) return optimistic;
  if (conversationModel) {
    return profiles.find((p) => p.model === conversationModel)?.name ?? null;
  }
  return userActiveProfile;
}

/**
 * Pairs each saved AgentProfile with a {@link ProfileRuntimePlan} for the
 * conversation as it is actually running (agent-canvas#669). Surfaces consume
 * this so the in-conversation picker can switch compatible profiles live and
 * show incompatible ones disabled with a reason — never applying a profile
 * partially.
 *
 * Today profiles persist as LLM-only OpenHands profiles, so the practical
 * verdicts are: in an OpenHands conversation every profile is ``current`` or a
 * live ``switch-live`` LLM swap; in an ACP conversation they are ``disabled``
 * (``different-agent-kind`` → "Requires a new conversation"). The ACP→ACP
 * branch of the matrix activates once the backend persists ACP profiles.
 */
export function useProfileRuntimePlans(): ProfileRuntimePlans {
  const { backend } = useActiveBackend();
  // Profiles are a local-backend concept; don't fire /api/profiles on cloud.
  const { data: profilesData } = useLlmProfiles({
    enabled: backend.kind !== "cloud",
  });
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const { conversationId } = useOptionalConversationId();
  const optimisticActiveProfile = useModelStore((s) =>
    conversationId ? s.activeProfileByConversation[conversationId] : undefined,
  );

  const profiles = useMemo(
    () => profilesData?.profiles ?? [],
    [profilesData?.profiles],
  );
  const conversationModel = conversation?.llm_model ?? null;

  const isAcpContext =
    conversation?.agent_kind === "acp" ||
    (!conversation && settings?.agent_settings?.agent_kind === "acp");

  const activeProfileName = resolveActiveProfileName(
    profiles,
    conversationModel,
    profilesData?.active_profile ?? null,
    optimisticActiveProfile,
  );

  const context = useMemo<ConversationRuntimeContext>(() => {
    if (isAcpContext) {
      const acpServer = conversation?.acp_server
        ? conversation.acp_server
        : typeof settings?.agent_settings?.acp_server === "string"
          ? settings.agent_settings.acp_server
          : null;
      const provider = getAcpProvider(acpServer);
      return {
        kind: "acp",
        acpServer,
        acpModel: conversationModel,
        // Built-in providers expose a model picker → a runtime model switch.
        providerSupportsRuntimeSwitch:
          backend.kind !== "cloud" &&
          (provider?.available_models?.length ?? 0) > 0,
        // `useSwitchAcpModel` handles both selection paths: on the home page it
        // persists the choice as the agent-settings default (always valid), and
        // inside a conversation it does a live `session/set_model` (surfacing
        // the pre-first-message 409 as a toast). Neither path needs us to
        // pre-disable here, so the picker treats the context as switchable; the
        // `session-not-initialized` reason stays reserved for when the backend
        // exposes that state explicitly.
        sessionInitialized: true,
      };
    }
    return {
      kind: "openhands",
      // baseUrl is left null: AppConversation doesn't surface the running
      // conversation's base_url, and the active profile is identified by name
      // (isActive) rather than by base_url equality, so this never produces a
      // spurious disable.
      llm: {
        model: conversationModel ?? settings?.llm_model ?? null,
        baseUrl: null,
      },
    };
  }, [
    isAcpContext,
    conversation?.acp_server,
    conversationModel,
    settings?.agent_settings?.acp_server,
    settings?.llm_model,
    backend.kind,
  ]);

  const withPlans = useMemo<ProfileWithPlan[]>(
    () =>
      profiles.map((profile) => {
        const normalized = normalizeLlmProfile(profile);
        return {
          profile,
          plan: deriveProfileRuntimePlan({
            profile: normalized,
            context,
            // Mark "current" only when the profile's kind matches the running
            // context AND it's the active profile. The kind guard prevents a
            // same-named cross-kind profile (e.g. an OpenHands profile in an
            // ACP conversation) from being mislabeled current; within-kind
            // config equality in deriveProfileRuntimePlan also resolves
            // "current" on cold loads where active_profile isn't known.
            isActive:
              normalized.kind === context.kind &&
              profile.name === activeProfileName,
          }),
        };
      }),
    [profiles, context, activeProfileName],
  );

  return { profiles: withPlans, activeProfileName, isAcpContext };
}
