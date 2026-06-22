import React, { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AgentProfile,
  AgentProfileSaveInput,
  ACPServerKind,
  ProfileVerificationSettings,
} from "@openhands/typescript-client";
import { BrandButton } from "#/components/features/settings/brand-button";
import { BackNavButton } from "#/components/shared/buttons/back-nav-button";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { AcpCredentialsSection } from "#/components/features/settings/acp-credentials-section";
import { ProfileNameInput } from "#/components/features/settings/llm-profiles/profile-name-input";
import { Typography } from "#/ui/typography";
import { McpServerRefsSelect } from "./mcp-server-refs-select";
import { AgentProfileVerificationFields } from "./agent-profile-verification-fields";
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
  type ACPProviderConfig,
} from "#/constants/acp-providers";
import { parseCommand, formatCommand } from "#/utils/acp-command";

type AgentKind = "openhands" | "acp";

const ACP_CUSTOM_MODEL_KEY = "__custom_model__";

const DEFAULT_VERIFICATION: ProfileVerificationSettings = {
  critic_enabled: false,
  critic_mode: "all_actions",
  enable_iterative_refinement: false,
  critic_threshold: 0.5,
  max_refinement_iterations: 3,
  critic_server_url: null,
  critic_model_name: null,
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function detectPreset(
  commandText: string,
  providers: ACPProviderConfig[],
): string {
  const normalized = parseCommand(commandText).join(" ");
  for (const provider of providers) {
    if (normalized === provider.default_command.join(" ")) return provider.key;
  }
  return ACP_CUSTOM_PRESET_KEY;
}

function isKnownAcpModel(
  provider: ACPProviderConfig | undefined,
  model: string,
): boolean {
  return (
    provider?.available_models?.some(({ id }) => id === model.trim()) ?? false
  );
}

/** Round-tripped OpenHands fields the editor preserves but does not surface as
 * first-class controls (`agent`/`skills`/`condenser`). Kept verbatim so an edit
 * never resets them; omitted on create so the server seeds its defaults. */
interface OpenHandsExtras {
  agent?: string;
  skills?: unknown[];
  condenser?: unknown;
}

interface AgentProfileEditorProps {
  mode: "create" | "edit";
  /** Full profile to edit (already fetched). Null in create mode. */
  profile: AgentProfile | null;
  /** Existing names for duplicate validation. */
  existingNames: string[];
  onCancel: () => void;
  onSaved: () => void;
}

export function AgentProfileEditor({
  mode,
  profile,
  existingNames,
  onCancel,
  onSaved,
}: AgentProfileEditorProps) {
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

  // --- shared ---
  const [name, setName] = useState(profile?.name ?? "");
  const [agentKind, setAgentKind] = useState<AgentKind>(
    profile?.agent_kind ?? "openhands",
  );
  const [mcpServerRefs, setMcpServerRefs] = useState<string[] | null>(
    profile?.mcp_server_refs ?? null,
  );

  // --- OpenHands ---
  const openhands = profile?.agent_kind === "openhands" ? profile : null;
  const [llmProfileRef, setLlmProfileRef] = useState(
    openhands?.llm_profile_ref ?? llmProfilesData?.active_profile ?? "",
  );
  const [enableSubAgents, setEnableSubAgents] = useState(
    openhands?.enable_sub_agents ?? true,
  );
  const [systemSuffix, setSystemSuffix] = useState(
    openhands?.system_message_suffix ?? "",
  );
  const [toolConcurrency, setToolConcurrency] = useState(
    String(openhands?.tool_concurrency_limit ?? 1),
  );
  const [verification, setVerification] = useState<ProfileVerificationSettings>(
    openhands?.verification ?? DEFAULT_VERIFICATION,
  );
  const openHandsExtrasRef = useRef<OpenHandsExtras>(
    openhands
      ? {
          agent: openhands.agent,
          skills: openhands.skills,
          condenser: openhands.condenser,
        }
      : {},
  );

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
    String(acp?.acp_prompt_timeout ?? 300),
  );

  const isAcp = agentKind === "acp";
  const selectedPreset = isAcp
    ? detectPreset(commandText, ACP_PROVIDERS)
    : ACP_CUSTOM_PRESET_KEY;
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

  const handleKindChange = (kind: AgentKind) => {
    setAgentKind(kind);
    if (kind === "acp" && !commandText) {
      const preferred = ACP_PROVIDERS[0];
      if (preferred) {
        setCommandText(formatCommand(preferred.default_command));
        setAcpModel(getAcpPreferredDefaultModel(preferred.key) ?? "");
        setIsCustomAcpModel(false);
      }
    }
    if (kind === "openhands" && !llmProfileRef) {
      setLlmProfileRef(llmProfilesData?.active_profile ?? "");
    }
  };

  const handlePresetChange = (preset: string) => {
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
          Number.isFinite(timeout) && timeout > 0 ? timeout : 300,
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
      // On edit, round-trip the loaded verification block; on create only send
      // it once the user enables the critic, otherwise let the server seed its
      // own default (avoids pinning a possibly-stale default critic_mode).
      ...(mode === "edit" || verification.critic_enabled
        ? { verification }
        : {}),
      ...(mode === "edit" && extras.agent !== undefined
        ? {
            agent: extras.agent,
            skills: extras.skills ?? [],
            condenser: extras.condenser,
          }
        : {}),
    };
  };

  const reportSaveError = (error: unknown) => {
    if (isSdkHttpStatusError(error, 409)) {
      displayErrorToast(
        mode === "edit" && name !== profile?.name
          ? t(I18nKey.SETTINGS$AGENT_PROFILE_NAME_EXISTS)
          : t(I18nKey.SETTINGS$AGENT_PROFILE_LIMIT_REACHED),
      );
    } else {
      // 422 (validation) and everything else: surface the server message.
      displayErrorToast(
        error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC),
      );
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    const trimmedName = name.trim();

    try {
      // Persist ACP credentials first so they exist when the spec is applied.
      if (acpCredentialForm.isDirty) {
        const ok = await acpCredentialForm.save({ silent: true });
        if (!ok) return;
        acpCredentialForm.reset();
      }

      // Save the body first (under its current name), then rename — so a
      // validation failure can't leave a half-applied edit (renamed but with
      // the old body). The stable id is preserved by both the overwrite and
      // the rename.
      const saveName = mode === "edit" && profile ? profile.name : trimmedName;
      await saveProfile.mutateAsync({
        name: saveName,
        profile: buildPayload(),
      });

      if (mode === "edit" && profile && profile.name !== trimmedName) {
        await renameProfile.mutateAsync({
          name: profile.name,
          newName: trimmedName,
        });
      }

      displaySuccessToast(
        mode === "create"
          ? t(I18nKey.SETTINGS$PROFILE_CREATED, { name: trimmedName })
          : t(I18nKey.SETTINGS$PROFILE_UPDATED, { name: trimmedName }),
      );
      onSaved();
    } catch (error) {
      reportSaveError(error);
    }
  };

  const isSaving = saveProfile.isPending || renameProfile.isPending;

  return (
    <div className="flex flex-col gap-6 pb-8 max-w-2xl">
      <div className="flex flex-col gap-2">
        <BackNavButton testId="back-to-agent-profiles" onClick={onCancel}>
          {t(I18nKey.BUTTON$BACK)}
        </BackNavButton>
        <Typography.H2 testId="agent-profile-editor-title">
          {mode === "create"
            ? t(I18nKey.SETTINGS$ADD_AGENT_PROFILE)
            : t(I18nKey.SETTINGS$EDIT_AGENT_PROFILE)}
        </Typography.H2>
      </div>

      <ProfileNameInput
        testId="agent-profile-name-input"
        value={name}
        onChange={setName}
        isRequired
      />

      <SettingsDropdownInput
        testId="agent-profile-kind-selector"
        name="agent-profile-kind"
        label={t(I18nKey.SETTINGS$NAV_AGENT)}
        items={[
          { key: "openhands", label: t(I18nKey.SETTINGS$AGENT_TYPE_OPENHANDS) },
          { key: "acp", label: t(I18nKey.SETTINGS$AGENT_TYPE_ACP) },
        ]}
        selectedKey={agentKind}
        isClearable={false}
        onSelectionChange={(key) => {
          if (key) handleKindChange(key as AgentKind);
        }}
      />

      {!isAcp && (
        <>
          <SettingsDropdownInput
            testId="agent-profile-llm-ref"
            name="llm-profile-ref"
            label={t(I18nKey.SETTINGS$AGENT_PROFILE_LLM_REF_LABEL)}
            items={llmProfiles.map((p) => ({ key: p.name, label: p.name }))}
            selectedKey={llmProfileRef || undefined}
            placeholder={t(I18nKey.SETTINGS$AGENT_PROFILE_LLM_REF_REQUIRED)}
            isClearable={false}
            required
            onSelectionChange={(key) => {
              if (key) setLlmProfileRef(String(key));
            }}
          />

          <McpServerRefsSelect
            availableServers={mcpServerNames}
            value={mcpServerRefs}
            onChange={setMcpServerRefs}
          />

          <SettingsInput
            testId="agent-profile-system-suffix"
            label={t(I18nKey.SETTINGS$AGENT_PROFILE_SYSTEM_SUFFIX_LABEL)}
            type="text"
            className="w-full"
            showOptionalTag
            value={systemSuffix}
            onChange={setSystemSuffix}
          />

          <SettingsSwitch
            testId="agent-profile-sub-agents"
            isToggled={enableSubAgents}
            onToggle={setEnableSubAgents}
          >
            {t(I18nKey.SCHEMA$ENABLE_SUB_AGENTS$LABEL)}
          </SettingsSwitch>

          <SettingsInput
            testId="agent-profile-tool-concurrency"
            label={t(I18nKey.SETTINGS$AGENT_PROFILE_TOOL_CONCURRENCY_LABEL)}
            type="number"
            min={1}
            step={1}
            className="w-full"
            value={toolConcurrency}
            onChange={setToolConcurrency}
          />

          <hr className="border-[#3D4046]" />
          <AgentProfileVerificationFields
            value={verification}
            onChange={setVerification}
          />
        </>
      )}

      {isAcp && (
        <>
          <SettingsDropdownInput
            testId="agent-profile-preset-selector"
            name="agent-profile-preset"
            label={t(I18nKey.SETTINGS$AGENT_PRESET)}
            items={[
              ...ACP_PROVIDERS.map((provider) => ({
                key: provider.key,
                label: provider.display_name,
              })),
              {
                key: ACP_CUSTOM_PRESET_KEY,
                label: t(I18nKey.SETTINGS$AGENT_PRESET_CUSTOM),
              },
            ]}
            selectedKey={selectedPreset}
            isClearable={false}
            onSelectionChange={(key) => {
              if (key) handlePresetChange(String(key));
            }}
          />

          <div className="flex flex-col gap-2.5">
            <Typography.Text className="text-sm">
              {t(I18nKey.SETTINGS$AGENT_COMMAND)}
            </Typography.Text>
            <textarea
              data-testid="agent-profile-command-input"
              className="bg-tertiary border border-[#717888] rounded-sm p-2 text-sm font-mono text-white placeholder:text-[#717888] min-h-[60px] resize-y focus:outline-none focus:border-white"
              value={commandText}
              placeholder={formatCommand(
                ACP_PROVIDERS[0]?.default_command ?? [],
              )}
              onChange={(e) => setCommandText(e.target.value)}
            />
            <Typography.Text className="text-xs text-[#717888]">
              {t(I18nKey.SETTINGS$AGENT_COMMAND_HINT)}
            </Typography.Text>
          </div>

          <div className="flex flex-col gap-1.5">
            {hasModelSuggestions && (
              <SettingsDropdownInput
                testId="agent-profile-model-selector"
                name="agent-profile-model"
                label={t(I18nKey.SETTINGS$AGENT_MODEL)}
                items={[
                  ...modelSuggestions.map((m) => ({
                    key: m.id,
                    label: m.label,
                  })),
                  {
                    key: ACP_CUSTOM_MODEL_KEY,
                    label: t(I18nKey.SETTINGS$AGENT_PRESET_CUSTOM),
                  },
                ]}
                selectedKey={selectedModelKey}
                isClearable={false}
                onSelectionChange={(key) => {
                  if (!key) return;
                  const modelKey = String(key);
                  if (modelKey === ACP_CUSTOM_MODEL_KEY) {
                    setIsCustomAcpModel(true);
                    setAcpModel("");
                  } else {
                    setIsCustomAcpModel(false);
                    setAcpModel(modelKey);
                  }
                }}
              />
            )}
            {selectedModelKey === ACP_CUSTOM_MODEL_KEY && (
              <SettingsInput
                testId="agent-profile-model-input"
                label={
                  hasModelSuggestions
                    ? t(I18nKey.SETTINGS$AGENT_CUSTOM_MODEL)
                    : t(I18nKey.SETTINGS$AGENT_MODEL)
                }
                type="text"
                className="w-full"
                value={acpModel}
                showOptionalTag
                onChange={setAcpModel}
              />
            )}
            <Typography.Text className="text-xs text-[#717888]">
              {t(I18nKey.SETTINGS$AGENT_MODEL_HINT)}
            </Typography.Text>
          </div>

          <SettingsInput
            testId="agent-profile-session-mode"
            label={t(I18nKey.SETTINGS$AGENT_PROFILE_SESSION_MODE_LABEL)}
            type="text"
            className="w-full"
            showOptionalTag
            value={sessionMode}
            onChange={setSessionMode}
          />

          <SettingsInput
            testId="agent-profile-prompt-timeout"
            label={t(I18nKey.SETTINGS$AGENT_PROFILE_PROMPT_TIMEOUT_LABEL)}
            type="number"
            min={1}
            step={1}
            className="w-full"
            value={promptTimeout}
            onChange={setPromptTimeout}
          />

          <McpServerRefsSelect
            availableServers={mcpServerNames}
            value={mcpServerRefs}
            onChange={setMcpServerRefs}
          />

          {selectedPreset !== ACP_CUSTOM_PRESET_KEY && (
            <>
              <hr className="border-[#3D4046]" />
              <AcpCredentialsSection
                form={acpCredentialForm}
                providerKey={selectedPreset}
              />
            </>
          )}
        </>
      )}

      <div className="flex justify-start gap-3 pt-2">
        <BrandButton
          testId="cancel-agent-profile-btn"
          type="button"
          variant="secondary"
          onClick={onCancel}
          isDisabled={isSaving}
        >
          {t(I18nKey.BUTTON$CANCEL)}
        </BrandButton>
        <BrandButton
          testId="save-agent-profile-btn"
          type="button"
          variant="primary"
          onClick={handleSave}
          isDisabled={!canSave || isSaving}
          aria-busy={isSaving}
        >
          {isSaving ? t(I18nKey.SETTINGS$SAVING) : t(I18nKey.BUTTON$SAVE)}
        </BrandButton>
      </div>
    </div>
  );
}
