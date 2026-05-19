import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";
import { useSettings } from "#/hooks/query/use-settings";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import {
  ACP_PROVIDERS,
  ACP_CUSTOM_PRESET_KEY,
  buildAcpAgentSettingsDiff,
  type ACPProviderConfig,
} from "#/constants/acp-providers";
import { parseCommand, formatCommand } from "#/utils/acp-command";

export const handle = { hideTitle: true };

type AgentType = "openhands" | "acp";

const COMMAND_PLACEHOLDER_FALLBACK = "npx -y <package-name>";

/** Coerce a possibly-undefined unknown to ``string[]`` by keeping only string
 *  entries; non-arrays and non-string entries are discarded. Used when
 *  loading already-stored ``acp_command`` / ``acp_args`` lists from settings. */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function detectPreset(
  commandText: string,
  providers: ACPProviderConfig[],
): string {
  // The preset dropdown silently follows the textarea: editing the
  // command into something that exactly matches another preset's
  // ``default_command`` re-selects that preset (and editing it away
  // from every preset flips to "Custom"). This is intentional — the
  // textarea is the source of truth; the dropdown is a read-out of
  // "which preset, if any, does this command match." A user pasting a
  // built-in command they had stashed elsewhere shouldn't have to
  // also click the matching preset.
  const normalized = parseCommand(commandText).join(" ");
  for (const provider of providers) {
    if (normalized === provider.default_command.join(" ")) {
      return provider.key;
    }
  }
  return ACP_CUSTOM_PRESET_KEY;
}

function AgentSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { data: settings, isLoading } = useSettings();
  const { mutate: saveSettings, isPending: isSaving } = useSaveSettings();

  const [agentType, setAgentType] = useState<AgentType>("openhands");
  const [commandText, setCommandText] = useState("");
  const [acpModel, setAcpModel] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  // Track the settings reference we last initialised the form from. The form
  // re-initialises when the server returns a new settings object (after save,
  // or after an update from another tab) but not just because a re-render
  // produced a new identity — otherwise an in-flight refetch could wipe
  // in-progress edits.
  const lastInitializedSettingsRef = useRef<unknown>(null);

  useEffect(() => {
    if (!settings) return;
    if (lastInitializedSettingsRef.current === settings) return;

    lastInitializedSettingsRef.current = settings;
    const kind = settings.agent_settings?.agent_kind;

    if (kind === "acp") {
      setAgentType("acp");

      // Reconstruct the textarea contents from the persisted settings:
      //
      //   spawn = acp_command + acp_args
      //
      // BUT acp_command may be the "default-preset shortcut" ``[]``, with
      // the real command living in the registry under ``acp_server``.
      // Without expanding the default before merging, a user with
      // ``acp_command: []`` + ``acp_args: ["--extra-arg"]`` would see
      // just ``--extra-arg`` in the textarea (no prefix), and saving
      // would persist ``acp_command: ["--extra-arg"]`` + flip the
      // preset to ``custom`` — silently losing the registry-default
      // prefix. Expand first, then merge.
      const rawAcpServer = settings.agent_settings?.acp_server;
      const acpServer =
        typeof rawAcpServer === "string" ? rawAcpServer : undefined;
      const provider = ACP_PROVIDERS.find(({ key }) => key === acpServer);
      const storedCommand = toStringArray(settings.agent_settings?.acp_command);
      const effectiveBaseCommand =
        storedCommand.length > 0
          ? storedCommand
          : (provider?.default_command ?? []);
      const tokens = [
        ...effectiveBaseCommand,
        ...toStringArray(settings.agent_settings?.acp_args),
      ];
      setCommandText(tokens.length > 0 ? formatCommand(tokens) : "");

      const savedModel = settings.agent_settings?.acp_model;
      setAcpModel(typeof savedModel === "string" ? savedModel : "");
    } else {
      setAgentType("openhands");
      setCommandText("");
      setAcpModel("");
    }
    setIsDirty(false);
  }, [settings]);

  if (isLoading) return null;

  const isAcp = agentType === "acp";
  const commandTokens = parseCommand(commandText);
  const isAcpInvalid = isAcp && commandTokens.length === 0;
  // ``selectedPreset`` is derived from ``commandText`` rather than tracked as
  // state. Keeping it in state would mean three sync points (effect, textarea
  // onChange, dropdown onSelectionChange) that can drift — deriving inline
  // keeps the dropdown honest about what would actually be saved.
  const selectedPreset = detectPreset(commandText, ACP_PROVIDERS);
  const selectedProvider = ACP_PROVIDERS.find(
    ({ key }) => key === selectedPreset,
  );
  const isDefaultProviderCommand =
    !!selectedProvider &&
    commandTokens.join(" ") === selectedProvider.default_command.join(" ");
  const commandPlaceholder =
    formatCommand(ACP_PROVIDERS[0]?.default_command ?? []) ||
    COMMAND_PLACEHOLDER_FALLBACK;

  const handleSave = () => {
    // The textarea is the single source of truth for the launch tokens:
    // when a built-in preset is selected and untouched, we save the
    // empty ``acp_command`` shortcut + provider key (the adapter
    // expands it from the registry at conversation-create time, see
    // ``buildConfiguredAcpAgentSettings``). When a preset has been
    // edited or the user picked Custom, we save the literal tokens.
    // Either way, ``acp_args: []`` is reset so API-set args can't
    // duplicate at spawn time.
    const useDefault = !!(selectedProvider && isDefaultProviderCommand);
    const providerKey = isAcp
      ? selectedProvider && isDefaultProviderCommand
        ? selectedProvider.key
        : ACP_CUSTOM_PRESET_KEY
      : "openhands";
    const agentSettingsDiff = buildAcpAgentSettingsDiff(providerKey, {
      command: useDefault ? [] : commandTokens,
      model: acpModel.trim() || null,
    });

    if (!agentSettingsDiff) {
      // Unreachable through the UI (the providerKey is derived from
      // either a known preset or the custom sentinel), but defensive.
      return;
    }

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
  };

  return (
    <div
      data-testid="agent-settings-screen"
      className="flex flex-col gap-6 pb-8 max-w-2xl"
    >
      <div>
        <Typography.H2 className="mb-2">
          {t(I18nKey.SETTINGS$AGENT)}
        </Typography.H2>
        <Typography.Paragraph className="text-sm text-[#A3A3A3]">
          {t(I18nKey.SETTINGS$AGENT_PAGE_DESCRIPTION)}
        </Typography.Paragraph>
      </div>

      <SettingsDropdownInput
        testId="agent-type-selector"
        name="agent-type"
        label={t(I18nKey.SETTINGS$AGENT)}
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
            // First-time switch into ACP: prefill the textarea with the
            // first registered provider.
            const preferred = ACP_PROVIDERS[0];
            if (preferred) {
              setCommandText(formatCommand(preferred.default_command));
            }
          }
          setIsDirty(true);
        }}
      />

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
              const provider = ACP_PROVIDERS.find(({ key: k }) => k === preset);
              if (provider) {
                setCommandText(formatCommand(provider.default_command));
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
              className="bg-tertiary border border-[#717888] rounded-sm p-2 text-sm font-mono text-white placeholder:italic placeholder:text-[#717888] min-h-[60px] resize-y focus:outline-none focus:border-white"
              value={commandText}
              placeholder={commandPlaceholder}
              onChange={(e) => {
                setCommandText(e.target.value);
                setIsDirty(true);
              }}
            />
            <Typography.Text className="text-xs text-[#717888]">
              {t(I18nKey.SETTINGS$AGENT_COMMAND_HINT)}
            </Typography.Text>
          </div>

          <div className="flex flex-col gap-1.5">
            <SettingsInput
              testId="agent-model-input"
              label={t(I18nKey.SETTINGS$AGENT_MODEL)}
              type="text"
              className="w-full"
              value={acpModel}
              showOptionalTag
              onChange={(value) => {
                setAcpModel(value);
                setIsDirty(true);
              }}
            />
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
          isDisabled={isSaving || !isDirty || isAcpInvalid}
          onClick={handleSave}
        >
          {isSaving ? t(I18nKey.SETTINGS$SAVING) : t(I18nKey.BUTTON$SAVE)}
        </BrandButton>
      </div>
    </div>
  );
}

export default AgentSettingsScreen;
