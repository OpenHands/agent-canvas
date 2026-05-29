import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";
import { useSettings } from "#/hooks/query/use-settings";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useAgentSettingsSchema } from "#/hooks/query/use-agent-settings-schema";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { formControlSwitchDescriptionClassName } from "#/utils/form-control-classes";
import { cn } from "#/utils/utils";
import { SettingsFieldSchema } from "#/types/settings";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import {
  resolveSchemaFieldDescription,
  resolveSchemaFieldLabel,
} from "#/utils/sdk-settings-field-metadata";
import {
  ACP_PROVIDERS,
  ACP_CUSTOM_PRESET_KEY,
  buildAcpAgentSettingsDiff,
  getAcpProvider,
  type ACPProviderConfig,
} from "#/constants/acp-providers";
import { parseCommand, formatCommand } from "#/utils/acp-command";

export const handle = { hideTitle: true };

type AgentType = "openhands" | "acp";

const ENABLE_SUB_AGENTS_FIELD_KEY = "enable_sub_agents";
const COMMAND_PLACEHOLDER_FALLBACK = "npx -y <package-name>";
const ACP_CUSTOM_MODEL_KEY = "__custom_model__";

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
    if (normalized === provider.default_command.join(" ")) {
      return provider.key;
    }
  }
  return ACP_CUSTOM_PRESET_KEY;
}

function findEnableSubAgentsField(
  fields: SettingsFieldSchema[] | undefined,
): SettingsFieldSchema | undefined {
  return fields?.find((field) => field.key === ENABLE_SUB_AGENTS_FIELD_KEY);
}

function getEnableSubAgentsValue(
  settingsValue: unknown,
  field: SettingsFieldSchema | undefined,
) {
  if (typeof settingsValue === "boolean") return settingsValue;
  return field?.default === true;
}

function isKnownAcpModel(
  provider: ACPProviderConfig | undefined,
  model: string,
): boolean {
  return (
    provider?.available_models?.some(({ id }) => id === model.trim()) ?? false
  );
}

function AgentSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { data: settings, isLoading } = useSettings();
  const { mutate: saveSettings, isPending: isSaving } = useSaveSettings();
  const { data: schema } = useAgentSettingsSchema(
    settings?.agent_settings_schema,
  );

  // --- Sub-agents (OpenHands path) ---
  const fields = React.useMemo(
    () => schema?.sections.flatMap((section) => section.fields),
    [schema],
  );
  const subAgentsField = findEnableSubAgentsField(fields);
  const initialSubAgentsEnabled = React.useMemo(
    () =>
      getEnableSubAgentsValue(
        settings?.agent_settings?.[ENABLE_SUB_AGENTS_FIELD_KEY],
        subAgentsField,
      ),
    [subAgentsField, settings?.agent_settings],
  );
  const [subAgentsEnabled, setSubAgentsEnabled] = useState(
    initialSubAgentsEnabled,
  );

  // --- ACP path ---
  const [agentType, setAgentType] = useState<AgentType>("openhands");
  const [commandText, setCommandText] = useState("");
  const [acpModel, setAcpModel] = useState("");
  const [isCustomAcpModel, setIsCustomAcpModel] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const lastInitializedSettingsRef = useRef<unknown>(null);
  const loadedAcpServerRef = useRef<string | null>(null);
  const loadedCommandTextRef = useRef<string>("");

  useEffect(() => {
    if (!settings) return;
    if (lastInitializedSettingsRef.current === settings) return;

    lastInitializedSettingsRef.current = settings;
    const kind = settings.agent_settings?.agent_kind;

    if (kind === "acp") {
      setAgentType("acp");

      const rawAcpServer = settings.agent_settings?.acp_server;
      const acpServer =
        typeof rawAcpServer === "string" ? rawAcpServer : undefined;
      const provider = getAcpProvider(acpServer);
      const storedCommand = toStringArray(settings.agent_settings?.acp_command);
      const effectiveBaseCommand =
        storedCommand.length > 0
          ? storedCommand
          : (provider?.default_command ?? []);
      const tokens = [
        ...effectiveBaseCommand,
        ...toStringArray(settings.agent_settings?.acp_args),
      ];
      const renderedCommandText =
        tokens.length > 0 ? formatCommand(tokens) : "";
      setCommandText(renderedCommandText);
      loadedAcpServerRef.current = acpServer ?? null;
      loadedCommandTextRef.current = renderedCommandText;

      const savedModel = settings.agent_settings?.acp_model;
      const normalizedSavedModel =
        typeof savedModel === "string" ? savedModel.trim() : "";
      setAcpModel(normalizedSavedModel || provider?.default_model || "");
      setIsCustomAcpModel(
        !!normalizedSavedModel &&
          (!provider || !isKnownAcpModel(provider, normalizedSavedModel)),
      );
    } else {
      setAgentType("openhands");
      setCommandText("");
      setAcpModel("");
      loadedAcpServerRef.current = null;
      loadedCommandTextRef.current = "";
      setIsCustomAcpModel(false);
    }
    setIsDirty(false);
  }, [settings]);

  // Sync the sub-agents toggle when settings reload
  useEffect(() => {
    setSubAgentsEnabled(initialSubAgentsEnabled);
  }, [initialSubAgentsEnabled]);

  if (isLoading) return null;

  const isAcp = agentType === "acp";
  const commandTokens = parseCommand(commandText);
  const isAcpInvalid = isAcp && commandTokens.length === 0;
  const selectedPreset = detectPreset(commandText, ACP_PROVIDERS);
  const selectedProvider = getAcpProvider(selectedPreset);
  const modelSuggestions = selectedProvider?.available_models ?? [];
  const hasModelSuggestions = modelSuggestions.length > 0;
  const selectedModelIsSuggestion = isKnownAcpModel(selectedProvider, acpModel);
  const selectedModelKey =
    isCustomAcpModel || !selectedModelIsSuggestion
      ? ACP_CUSTOM_MODEL_KEY
      : acpModel;
  const isDefaultProviderCommand =
    !!selectedProvider &&
    commandTokens.join(" ") === selectedProvider.default_command.join(" ");
  const commandPlaceholder =
    formatCommand(ACP_PROVIDERS[0]?.default_command ?? []) ||
    COMMAND_PLACEHOLDER_FALLBACK;

  // Dirty tracking: for OpenHands path, also check sub-agents toggle
  const isOpenHandsDirty =
    !isAcp && subAgentsEnabled !== initialSubAgentsEnabled;
  const effectiveIsDirty = isDirty || isOpenHandsDirty;

  const handleSave = () => {
    if (isAcp) {
      const useDefault = !!(selectedProvider && isDefaultProviderCommand);
      const loadedServer = loadedAcpServerRef.current;
      const commandUnchanged = commandText === loadedCommandTextRef.current;
      const loadedServerIsUnknown =
        !!loadedServer &&
        loadedServer !== ACP_CUSTOM_PRESET_KEY &&
        !ACP_PROVIDERS.some((p) => p.key === loadedServer);
      const preserveUnknownServer =
        isAcp && commandUnchanged && loadedServerIsUnknown;
      const providerKey = preserveUnknownServer
        ? (loadedServer as string)
        : selectedProvider && isDefaultProviderCommand
          ? selectedProvider.key
          : ACP_CUSTOM_PRESET_KEY;
      // ``model: undefined`` lets buildAcpAgentSettingsDiff seed the provider's
      // ``default_model`` for built-in keys; for the custom preset it falls
      // through to ``null`` since custom has no default.
      const agentSettingsDiff = buildAcpAgentSettingsDiff(providerKey, {
        command: useDefault ? [] : commandTokens,
        model: acpModel.trim() || undefined,
        allowUnknownServer: preserveUnknownServer,
      });

      if (!agentSettingsDiff) return;

      saveSettings(
        { agent_settings_diff: agentSettingsDiff },
        {
          onError: (error) => {
            const message = retrieveAxiosErrorMessage(error as AxiosError);
            displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
          },
          onSuccess: () => {
            displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
            setIsDirty(false);
          },
        },
      );
    } else {
      // OpenHands path: save agent_kind + sub-agents toggle
      saveSettings(
        {
          agent_settings_diff: {
            agent_kind: "openhands",
            enable_sub_agents: subAgentsEnabled,
          },
        },
        {
          onError: (error) => {
            const message = retrieveAxiosErrorMessage(error as AxiosError);
            displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
          },
          onSuccess: () => {
            displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
            setIsDirty(false);
          },
        },
      );
    }
  };

  // Sub-agents field metadata for OpenHands section
  const subAgentsLabel = subAgentsField
    ? resolveSchemaFieldLabel(t, subAgentsField.key, subAgentsField.label)
    : t(I18nKey.SCHEMA$ENABLE_SUB_AGENTS$LABEL);
  const subAgentsDescription = subAgentsField
    ? resolveSchemaFieldDescription(
        t,
        subAgentsField.key,
        subAgentsField.description,
      )
    : t(I18nKey.SCHEMA$ENABLE_SUB_AGENTS$DESCRIPTION);

  return (
    <div
      data-testid="agent-settings-screen"
      className="flex flex-col gap-6 pb-8 max-w-2xl"
    >
      <div>
        <Typography.H2 className="mb-2">
          {t(I18nKey.SETTINGS$NAV_AGENT)}
        </Typography.H2>
        <Typography.Paragraph className="text-sm text-[#A3A3A3]">
          {t(I18nKey.SETTINGS$AGENT_PAGE_DESCRIPTION)}
        </Typography.Paragraph>
      </div>

      <SettingsDropdownInput
        testId="agent-type-selector"
        name="agent-type"
        label={t(I18nKey.SETTINGS$NAV_AGENT)}
        items={[
          {
            key: "openhands",
            label: t(I18nKey.SETTINGS$AGENT_TYPE_OPENHANDS),
          },
          { key: "acp", label: t(I18nKey.SETTINGS$AGENT_TYPE_ACP) },
        ]}
        selectedKey={agentType}
        onSelectionChange={(key) => {
          if (!key) return;
          const newType = key as AgentType;
          setAgentType(newType);
          if (newType === "acp" && !commandText) {
            const preferred = ACP_PROVIDERS[0];
            if (preferred) {
              setCommandText(formatCommand(preferred.default_command));
              setAcpModel(preferred.default_model ?? "");
              setIsCustomAcpModel(false);
            }
          } else if (newType === "openhands") {
            setIsCustomAcpModel(false);
          }
          setIsDirty(true);
        }}
      />

      {!isAcp && (
        <div className="flex flex-col gap-1.5">
          <SettingsSwitch
            testId="agent-settings-enable-sub-agents"
            isToggled={subAgentsEnabled}
            onToggle={(val) => {
              setSubAgentsEnabled(val);
            }}
          >
            {subAgentsLabel}
          </SettingsSwitch>
          {subAgentsDescription ? (
            <Typography.Paragraph
              className={cn(
                formControlSwitchDescriptionClassName,
                "text-tertiary-alt text-xs leading-5",
              )}
            >
              {subAgentsDescription}
            </Typography.Paragraph>
          ) : null}
        </div>
      )}

      {isAcp && (
        <>
          <SettingsDropdownInput
            testId="agent-preset-selector"
            name="agent-preset"
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
            onSelectionChange={(key) => {
              if (!key) return;
              const preset = String(key);
              const provider = getAcpProvider(preset);
              if (provider) {
                setCommandText(formatCommand(provider.default_command));
                setAcpModel(provider.default_model ?? "");
                setIsCustomAcpModel(false);
              } else if (preset === ACP_CUSTOM_PRESET_KEY) {
                // Clear command + model: the previous provider's default
                // command would otherwise make detectPreset(commandText)
                // re-match it on the next render and snap the dropdown back
                // off "Custom". Clearing model also prevents leaking e.g.
                // ``claude-opus-4-7`` into ``acp_model`` for an unrelated
                // wrapper.
                setCommandText("");
                setAcpModel("");
                setIsCustomAcpModel(true);
              }
              setIsDirty(true);
            }}
          />

          <div className="flex flex-col gap-2.5">
            <Typography.Text className="text-sm">
              {t(I18nKey.SETTINGS$AGENT_COMMAND)}
            </Typography.Text>
            <textarea
              data-testid="agent-command-input"
              className="bg-tertiary border border-[#717888] rounded-sm p-2 text-sm font-mono text-white placeholder:text-[#717888] min-h-[60px] resize-y focus:outline-none focus:border-white"
              value={commandText}
              placeholder={commandPlaceholder}
              onChange={(e) => {
                const nextCommandText = e.target.value;
                // Keep the model selector in sync with the command being
                // typed. Editing the command into a *different* provider — or
                // into a custom command — must drop the previous provider's
                // model, or Save would silently persist e.g.
                // ``claude-opus-4-7`` against a Codex / custom wrapper. The
                // preset dropdown already does this; the textarea is the other
                // way a user changes provider, so it needs the same
                // reconciliation. Gated on the *detected preset* actually
                // changing, so it never clobbers a model the user is editing
                // within the same provider.
                const prevPreset = detectPreset(commandText, ACP_PROVIDERS);
                const nextPreset = detectPreset(nextCommandText, ACP_PROVIDERS);
                if (nextPreset !== prevPreset) {
                  const nextProvider = getAcpProvider(nextPreset);
                  setAcpModel(nextProvider?.default_model ?? "");
                  setIsCustomAcpModel(false);
                }
                setCommandText(nextCommandText);
                setIsDirty(true);
              }}
            />
            <Typography.Text className="text-xs text-[#717888]">
              {t(I18nKey.SETTINGS$AGENT_COMMAND_HINT)}
            </Typography.Text>
          </div>

          <div className="flex flex-col gap-1.5">
            {hasModelSuggestions && (
              <SettingsDropdownInput
                testId="agent-model-selector"
                name="agent-model"
                label={t(I18nKey.SETTINGS$AGENT_MODEL)}
                items={[
                  ...modelSuggestions.map((model) => ({
                    key: model.id,
                    label: model.label,
                  })),
                  {
                    key: ACP_CUSTOM_MODEL_KEY,
                    label: t(I18nKey.SETTINGS$AGENT_PRESET_CUSTOM),
                  },
                ]}
                selectedKey={selectedModelKey}
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
                  setIsDirty(true);
                }}
              />
            )}
            {selectedModelKey === ACP_CUSTOM_MODEL_KEY && (
              <SettingsInput
                testId="agent-model-input"
                label={
                  hasModelSuggestions
                    ? t(I18nKey.SETTINGS$AGENT_CUSTOM_MODEL)
                    : t(I18nKey.SETTINGS$AGENT_MODEL)
                }
                type="text"
                className="w-full"
                value={acpModel}
                showOptionalTag
                onChange={(value) => {
                  setAcpModel(value);
                  setIsDirty(true);
                }}
              />
            )}
            <Typography.Text className="text-xs text-[#717888]">
              {t(I18nKey.SETTINGS$AGENT_MODEL_HINT)}
            </Typography.Text>
          </div>
        </>
      )}

      <div>
        <BrandButton
          testId="agent-save-button"
          type="button"
          variant="primary"
          isDisabled={isSaving || !effectiveIsDirty || isAcpInvalid}
          onClick={handleSave}
        >
          {isSaving
            ? t(I18nKey.SETTINGS$SAVING)
            : t(I18nKey.SETTINGS$SAVE_CHANGES)}
        </BrandButton>
      </div>
    </div>
  );
}

export default AgentSettingsScreen;
