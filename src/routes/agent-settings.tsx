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
  type ACPProviderInfo,
} from "@openhands/typescript-client";
import { ACP_CUSTOM_PRESET_KEY } from "#/constants/acp-presets";

// Cache the registry as a sorted array for the dropdown + iteration sites
// below. ``ACP_PROVIDERS`` is a frozen Record keyed by provider id; turning
// it into an array once per module load avoids re-allocating an array on
// every render of the form.
const ACP_PROVIDER_LIST: readonly ACPProviderInfo[] =
  Object.values(ACP_PROVIDERS);

export const handle = { hideTitle: true };

type AgentType = "openhands" | "acp";

const COMMAND_PLACEHOLDER_FALLBACK = "npx -y <package-name>";

function tokenizeCommand(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function formatCommand(command: string[]): string {
  return command.join(" ");
}

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
  providers: readonly ACPProviderInfo[],
): string {
  const normalized = tokenizeCommand(commandText).join(" ");
  for (const provider of providers) {
    if (normalized === provider.defaultCommand.join(" ")) {
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

      const tokens = [
        ...toStringArray(settings.agent_settings?.acp_command),
        ...toStringArray(settings.agent_settings?.acp_args),
      ];
      const joined = tokens.join(" ");
      const rawAcpServer = settings.agent_settings?.acp_server;
      const acpServer =
        typeof rawAcpServer === "string" ? rawAcpServer : undefined;
      const provider = acpServer ? ACP_PROVIDERS[acpServer] : undefined;
      const effectiveCommand =
        joined || formatCommand([...(provider?.defaultCommand ?? [])]);
      setCommandText(effectiveCommand);

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
  const commandTokens = tokenizeCommand(commandText);
  const isAcpInvalid = isAcp && commandTokens.length === 0;
  // ``selectedPreset`` is derived from ``commandText`` rather than tracked as
  // state. Keeping it in state would mean three sync points (effect, textarea
  // onChange, dropdown onSelectionChange) that can drift — deriving inline
  // keeps the dropdown honest about what would actually be saved.
  const selectedPreset = detectPreset(commandText, ACP_PROVIDER_LIST);
  const selectedProvider =
    selectedPreset !== ACP_CUSTOM_PRESET_KEY
      ? ACP_PROVIDERS[selectedPreset]
      : undefined;
  const isDefaultProviderCommand =
    !!selectedProvider &&
    commandTokens.join(" ") === selectedProvider.defaultCommand.join(" ");
  const commandPlaceholder =
    formatCommand([...(ACP_PROVIDER_LIST[0]?.defaultCommand ?? [])]) ||
    COMMAND_PLACEHOLDER_FALLBACK;

  const handleSave = () => {
    let agentSettingsDiff: Record<string, unknown>;
    if (isAcp) {
      // ``acp_args`` is intentionally omitted: there is no UI for it, the
      // textarea contributes every token via ``acp_command``, and the
      // backend's default ``[]`` on the ACPAgent model is correct. Sending
      // it would only matter for users who set it via the raw API, and we
      // don't want to clobber that.
      agentSettingsDiff = {
        agent_kind: "acp",
        acp_server:
          selectedProvider && isDefaultProviderCommand
            ? selectedProvider.key
            : ACP_CUSTOM_PRESET_KEY,
        acp_command:
          selectedProvider && isDefaultProviderCommand ? [] : commandTokens,
        acp_model: acpModel.trim() || null,
      };
    } else {
      // Switching back to OpenHands. The agent-server's ``Settings.update``
      // applies a fresh ``{'agent_kind': ...}`` base whenever the kind flips
      // — any ``acp_*`` fields sent here would be discarded before
      // validation, so send the kind alone.
      agentSettingsDiff = { agent_kind: "openhands" };
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
            const preferred = ACP_PROVIDER_LIST[0];
            if (preferred) {
              setCommandText(formatCommand([...preferred.defaultCommand]));
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
              ...ACP_PROVIDER_LIST.map((provider) => ({
                key: provider.key,
                label: provider.displayName,
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
              const provider = ACP_PROVIDERS[preset];
              if (provider) {
                setCommandText(formatCommand([...provider.defaultCommand]));
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
