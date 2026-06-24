import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AgentProfile,
  AgentProfileSaveInput,
  ACPServerKind,
  ProfileVerificationSettings,
} from "@openhands/typescript-client";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useSettings } from "#/hooks/query/use-settings";
import { useSaveAgentProfile } from "#/hooks/mutation/use-save-agent-profile";
import { useRenameAgentProfile } from "#/hooks/mutation/use-rename-agent-profile";
import { useAcpCredentialForm } from "#/hooks/use-acp-credential-form";
import { isProfileNameValid } from "#/utils/derive-profile-name";
import { isSdkHttpStatusError } from "#/api/agent-server-compatibility";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import {
  ACP_PROVIDERS,
  ACP_CUSTOM_PRESET_KEY,
  getAcpProvider,
  getAcpPreferredDefaultModel,
} from "#/constants/acp-providers";
import { parseCommand, formatCommand } from "#/utils/acp-command";

export type AgentKind = "openhands" | "acp";

export const ACP_CUSTOM_MODEL_KEY = "__custom_model__";

// Mirrors the SDK ProfileVerificationSettings defaults so an unchanged create
// matches what the server would seed.
const DEFAULT_VERIFICATION: ProfileVerificationSettings = {
  critic_enabled: false,
  critic_mode: "finish_and_message",
  enable_iterative_refinement: false,
  critic_threshold: 0.6,
  max_refinement_iterations: 3,
  critic_server_url: null,
  critic_model_name: null,
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function isKnownAcpModel(
  provider: ReturnType<typeof getAcpProvider>,
  model: string,
): boolean {
  return (
    provider?.available_models?.some(({ id }) => id === model.trim()) ?? false
  );
}

/** The profile `condenser` is a flat config object — the same fields the global
 * Condenser page edits (enabled / max_size / keep_first / max_tokens /
 * condenser_kind / minimum_progress / hard_context_reset_*). The editor surfaces
 * the common knobs and round-trips the rest untouched, so nothing is lost. */
export type CondenserConfig = Record<string, unknown>;

const DEFAULT_CONDENSER: CondenserConfig = {
  enabled: true,
  condenser_kind: "llm_summarizing",
  max_size: 240,
  keep_first: 2,
  max_tokens: null,
  minimum_progress: 0.1,
  hard_context_reset_max_retries: 5,
  hard_context_reset_context_scaling: 0.8,
};

function toCondenserConfig(condenser: unknown): CondenserConfig {
  return condenser && typeof condenser === "object"
    ? { ...(condenser as CondenserConfig) }
    : { ...DEFAULT_CONDENSER };
}

/** Round-tripped OpenHands fields the editor preserves but does not surface as
 * first-class controls (`agent`/`skills`/`condenser`). Kept verbatim so an edit
 * never resets them; omitted on create so the server seeds its defaults. The
 * Memory section overrides only `condenser.max_size`. */
interface OpenHandsExtras {
  agent?: string;
  skills?: unknown[];
}

export interface UseAgentProfileFormArgs {
  mode: "create" | "edit";
  profile: AgentProfile | null;
  /** Kind chosen in the create modal; ignored in edit mode (kind is fixed). */
  createKind: AgentKind;
  existingNames: string[];
  onSaved: () => void;
}

/**
 * Owns every piece of agent-profile editor state plus the save flow, so the
 * master-detail shell and its section components stay presentational. Agent
 * kind is fixed for a profile's life (chosen up front, never switched here).
 */
export function useAgentProfileForm({
  mode,
  profile,
  createKind,
  existingNames,
  onSaved,
}: UseAgentProfileFormArgs) {
  const { t } = useTranslation("openhands");
  const { data: llmProfilesData } = useLlmProfiles();
  const { data: settings } = useSettings();
  const saveProfile = useSaveAgentProfile();
  const renameProfile = useRenameAgentProfile();

  const llmProfiles = llmProfilesData?.profiles ?? [];
  const mcpServerNames = useMemo(() => {
    const mcpConfig = settings?.agent_settings?.mcp_config as
      | { mcpServers?: Record<string, unknown> }
      | undefined;
    return Object.keys(mcpConfig?.mcpServers ?? {});
  }, [settings?.agent_settings?.mcp_config]);

  // Kind is fixed: from the loaded profile on edit, from the create modal on new.
  const agentKind: AgentKind =
    mode === "edit" && profile ? profile.agent_kind : createKind;
  const isAcp = agentKind === "acp";

  // --- shared ---
  const [name, setName] = useState(profile?.name ?? "");
  const [mcpServerRefs, setMcpServerRefs] = useState<string[] | null>(
    profile?.mcp_server_refs ?? null,
  );

  // --- OpenHands ---
  const openhands = profile?.agent_kind === "openhands" ? profile : null;
  const [llmProfileRef, setLlmProfileRef] = useState(
    openhands?.llm_profile_ref ?? llmProfilesData?.active_profile ?? "",
  );
  const [enableSubAgents, setEnableSubAgents] = useState(
    openhands?.enable_sub_agents ?? false,
  );
  // The system-prompt suffix is not editable in the UI for now, but we still
  // round-trip the stored value on save so an edit never drops it.
  const systemSuffix = openhands?.system_message_suffix ?? "";
  const [toolConcurrency, setToolConcurrency] = useState(
    String(openhands?.tool_concurrency_limit ?? 1),
  );
  // Critic/verification is configured globally (the Critic hub page, #1456), so
  // the editor no longer edits it per-profile — but we still round-trip the
  // stored value on save so an edit never resets it.
  const verification: ProfileVerificationSettings =
    openhands?.verification ?? DEFAULT_VERIFICATION;
  const openHandsExtrasRef = useRef<OpenHandsExtras>(
    openhands ? { agent: openhands.agent, skills: openhands.skills } : {},
  );
  // Whether the loaded profile already carried a condenser. Combined with the
  // touched flag below, this gates whether `condenser` is sent on save — so we
  // never stamp the frontend default onto a create (or an edit of a profile
  // that had none), letting the server seed its own default instead.
  const hadInitialCondenser =
    !!openhands?.condenser && typeof openhands.condenser === "object";
  const [condenser, setCondenser] = useState<CondenserConfig>(
    toCondenserConfig(openhands?.condenser),
  );
  const [condenserTouched, setCondenserTouched] = useState(false);
  const patchCondenser = (partial: CondenserConfig) => {
    setCondenserTouched(true);
    setCondenser((prev) => ({ ...prev, ...partial }));
  };

  // --- ACP ---
  const acp = profile?.agent_kind === "acp" ? profile : null;
  const initialAcpServer = acp?.acp_server ?? ACP_PROVIDERS[0]?.key ?? "custom";
  const initialCommand = (() => {
    if (acp) {
      const provider = getAcpProvider(acp.acp_server);
      const base = acp.acp_command
        ? parseCommand(acp.acp_command)
        : (provider?.default_command ?? []);
      const tokens = [...base, ...toStringArray(acp.acp_args)];
      return tokens.length ? formatCommand(tokens) : "";
    }
    const preferred = getAcpProvider(initialAcpServer);
    return preferred ? formatCommand(preferred.default_command) : "";
  })();
  const [commandText, setCommandText] = useState(initialCommand);
  const [acpModel, setAcpModel] = useState(
    acp?.acp_model ?? getAcpPreferredDefaultModel(initialAcpServer) ?? "",
  );
  const [isCustomAcpModel, setIsCustomAcpModel] = useState(
    !!acp?.acp_model &&
      !isKnownAcpModel(getAcpProvider(acp.acp_server), acp.acp_model),
  );
  const [sessionMode, setSessionMode] = useState(acp?.acp_session_mode ?? "");
  const [promptTimeout, setPromptTimeout] = useState(
    String(acp?.acp_prompt_timeout ?? 1800),
  );
  // The selected ACP provider preset (a registry key or the "custom" sentinel).
  // Explicit state, NOT derived from the command text, so editing the command
  // (e.g. adding a flag) can't silently flip the preset to "custom" and drop
  // the provider's credentials / model list.
  const [acpServerSel, setAcpServerSel] = useState<string>(initialAcpServer);

  const selectedPreset = isAcp ? acpServerSel : ACP_CUSTOM_PRESET_KEY;
  const selectedProvider = getAcpProvider(selectedPreset);
  const modelSuggestions = selectedProvider?.available_models ?? [];
  const hasModelSuggestions = modelSuggestions.length > 0;
  const selectedModelIsSuggestion = isKnownAcpModel(selectedProvider, acpModel);
  const selectedModelKey =
    isCustomAcpModel || !selectedModelIsSuggestion
      ? ACP_CUSTOM_MODEL_KEY
      : acpModel;

  // ACP creds live alongside the agent spec; the editor owns the form and a
  // single Save persists both. Called unconditionally (null for non-ACP/custom)
  // to keep hook order stable. The hook resets typed values on provider change.
  const acpCredentialForm = useAcpCredentialForm(
    isAcp && selectedPreset !== ACP_CUSTOM_PRESET_KEY ? selectedPreset : null,
  );

  const commandTokens = parseCommand(commandText);
  const isAcpInvalid = isAcp && commandTokens.length === 0;
  const isNameValid = useMemo(() => {
    if (!isProfileNameValid(name, { isRequired: true })) return false;
    const clash = existingNames.includes(name) && name !== profile?.name;
    return !clash;
  }, [name, existingNames, profile?.name]);
  const isLlmRefValid = isAcp || llmProfileRef.trim().length > 0;
  const canSave = isNameValid && isLlmRefValid && !isAcpInvalid;

  const handlePresetChange = (preset: string) => {
    setAcpServerSel(preset);
    const provider = getAcpProvider(preset);
    if (provider) {
      setCommandText(formatCommand(provider.default_command));
      setAcpModel(getAcpPreferredDefaultModel(preset) ?? "");
      setIsCustomAcpModel(false);
    } else if (preset === ACP_CUSTOM_PRESET_KEY) {
      setCommandText("");
      setAcpModel("");
      setIsCustomAcpModel(true);
    }
  };

  const handleModelChange = (modelKey: string) => {
    if (modelKey === ACP_CUSTOM_MODEL_KEY) {
      setIsCustomAcpModel(true);
      setAcpModel("");
    } else {
      setIsCustomAcpModel(false);
      setAcpModel(modelKey);
    }
  };

  const buildPayload = (): AgentProfileSaveInput => {
    if (isAcp) {
      const useDefault =
        !!selectedProvider &&
        commandTokens.join(" ") === selectedProvider.default_command.join(" ");
      const isCustom = selectedPreset === ACP_CUSTOM_PRESET_KEY;
      const acpServer = (isCustom ? "custom" : selectedPreset) as ACPServerKind;
      // Built-in provider on its default command → leave command/args null so
      // the backend resolves them from the registry. Otherwise split the typed
      // command into executable + args.
      const explicit = isCustom || !useDefault;
      const timeout = Number(promptTimeout);
      return {
        agent_kind: "acp",
        acp_server: acpServer,
        acp_model: acpModel.trim() || null,
        acp_session_mode: sessionMode.trim() ? sessionMode.trim() : null,
        acp_prompt_timeout:
          Number.isFinite(timeout) && timeout > 0 ? timeout : 1800,
        acp_command: explicit ? (commandTokens[0] ?? null) : null,
        acp_args: explicit ? commandTokens.slice(1) : null,
        mcp_server_refs: mcpServerRefs,
      };
    }

    const concurrency = Number(toolConcurrency);
    const extras = openHandsExtrasRef.current;
    return {
      agent_kind: "openhands",
      llm_profile_ref: llmProfileRef,
      mcp_server_refs: mcpServerRefs,
      enable_sub_agents: enableSubAgents,
      system_message_suffix: systemSuffix.trim() ? systemSuffix : null,
      tool_concurrency_limit:
        Number.isFinite(concurrency) && concurrency >= 1
          ? Math.floor(concurrency)
          : 1,
      // Send the flat condenser config only when the loaded profile already had
      // one or the user touched it; otherwise omit it so the server seeds its
      // own default rather than pinning the frontend's DEFAULT_CONDENSER.
      ...(hadInitialCondenser || condenserTouched ? { condenser } : {}),
      // On edit, round-trip the loaded verification block; on create only send
      // it once the user enables the critic, otherwise let the server seed its
      // own default (avoids pinning a possibly-stale default critic_mode).
      ...(mode === "edit" || verification.critic_enabled
        ? { verification }
        : {}),
      ...(mode === "edit" && extras.agent !== undefined
        ? { agent: extras.agent, skills: extras.skills ?? [] }
        : {}),
    };
  };

  // 409 means different things per operation (save = profile-count limit,
  // rename = name collision), so each call site passes its own conflict copy.
  const showSaveError = (error: unknown, conflictKey: I18nKey) => {
    displayErrorToast(
      isSdkHttpStatusError(error, 409)
        ? t(conflictKey)
        : error instanceof Error
          ? error.message
          : t(I18nKey.ERROR$GENERIC),
    );
  };

  const handleSave = async () => {
    if (!canSave) return;
    const trimmedName = name.trim();

    // Persist ACP credentials first so they exist when the spec is applied.
    if (acpCredentialForm.isDirty) {
      try {
        const ok = await acpCredentialForm.save({ silent: true });
        if (!ok) return;
        acpCredentialForm.reset();
      } catch (error) {
        displayErrorToast(
          error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC),
        );
        return;
      }
    }

    // Save the body first (under its current name), then rename — so a
    // validation failure can't leave a half-applied edit (renamed but with the
    // old body). The stable id is preserved by both the overwrite and the
    // rename. A 409 here is the profile-count limit; an overwrite of a namesake
    // never conflicts on name.
    const saveName = mode === "edit" && profile ? profile.name : trimmedName;
    try {
      await saveProfile.mutateAsync({
        name: saveName,
        profile: buildPayload(),
      });
    } catch (error) {
      showSaveError(error, I18nKey.SETTINGS$AGENT_PROFILE_LIMIT_REACHED);
      return;
    }

    // Rename last; a 409 here is specifically a name collision.
    if (mode === "edit" && profile && profile.name !== trimmedName) {
      try {
        await renameProfile.mutateAsync({
          name: profile.name,
          newName: trimmedName,
        });
      } catch (error) {
        showSaveError(error, I18nKey.SETTINGS$AGENT_PROFILE_NAME_EXISTS);
        return;
      }
    }

    displaySuccessToast(
      mode === "create"
        ? t(I18nKey.SETTINGS$PROFILE_CREATED, { name: trimmedName })
        : t(I18nKey.SETTINGS$PROFILE_UPDATED, { name: trimmedName }),
    );
    onSaved();
  };

  const isSaving = saveProfile.isPending || renameProfile.isPending;

  return {
    mode,
    t,
    // identity / kind
    name,
    setName,
    agentKind,
    isAcp,
    // catalogs
    llmProfiles,
    mcpServerNames,
    // shared
    mcpServerRefs,
    setMcpServerRefs,
    // OpenHands
    llmProfileRef,
    setLlmProfileRef,
    enableSubAgents,
    setEnableSubAgents,
    toolConcurrency,
    setToolConcurrency,
    condenser,
    patchCondenser,
    // ACP
    commandText,
    setCommandText,
    acpModel,
    setAcpModel,
    sessionMode,
    setSessionMode,
    promptTimeout,
    setPromptTimeout,
    selectedPreset,
    selectedProvider,
    modelSuggestions,
    hasModelSuggestions,
    selectedModelKey,
    handlePresetChange,
    handleModelChange,
    acpCredentialForm,
    // validation
    isNameValid,
    isLlmRefValid,
    isAcpInvalid,
    canSave,
    // save
    handleSave,
    isSaving,
  };
}

export type AgentProfileForm = ReturnType<typeof useAgentProfileForm>;
