import { useTranslation } from "react-i18next";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { AcpCredentialsSection } from "#/components/features/settings/acp-credentials-section";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import {
  ACP_PROVIDERS,
  ACP_CUSTOM_PRESET_KEY,
} from "#/constants/acp-providers";
import { formatCommand } from "#/utils/acp-command";
import { McpServerRefsSelect } from "../../mcp-server-refs-select";
import {
  ACP_CUSTOM_MODEL_KEY,
  type AgentProfileForm,
} from "../use-agent-profile-form";
import { SectionShell } from "./section-shell";

interface SectionProps {
  form: AgentProfileForm;
}

export function ProviderModelSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_PROVIDER_MODEL)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_PROVIDER_MODEL_DESC)}
    >
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
        selectedKey={form.selectedPreset}
        isClearable={false}
        onSelectionChange={(key) => {
          if (key) form.handlePresetChange(String(key));
        }}
      />

      <div className="flex flex-col gap-1.5">
        {form.hasModelSuggestions && (
          <SettingsDropdownInput
            testId="agent-profile-model-selector"
            name="agent-profile-model"
            label={t(I18nKey.SETTINGS$AGENT_MODEL)}
            items={[
              ...form.modelSuggestions.map((m) => ({
                key: m.id,
                label: m.label,
              })),
              {
                key: ACP_CUSTOM_MODEL_KEY,
                label: t(I18nKey.SETTINGS$AGENT_PRESET_CUSTOM),
              },
            ]}
            selectedKey={form.selectedModelKey}
            isClearable={false}
            onSelectionChange={(key) => {
              if (key) form.handleModelChange(String(key));
            }}
          />
        )}
        {form.selectedModelKey === ACP_CUSTOM_MODEL_KEY && (
          <SettingsInput
            testId="agent-profile-model-input"
            label={
              form.hasModelSuggestions
                ? t(I18nKey.SETTINGS$AGENT_CUSTOM_MODEL)
                : t(I18nKey.SETTINGS$AGENT_MODEL)
            }
            type="text"
            className="w-full"
            value={form.acpModel}
            showOptionalTag
            onChange={form.setAcpModel}
          />
        )}
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$AGENT_MODEL_HINT)}
        </Typography.Text>
      </div>
    </SectionShell>
  );
}

export function LaunchSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_LAUNCH)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_LAUNCH_DESC)}
    >
      <div className="flex flex-col gap-2.5">
        <Typography.Text className="text-sm">
          {t(I18nKey.SETTINGS$AGENT_COMMAND)}
        </Typography.Text>
        <textarea
          data-testid="agent-profile-command-input"
          className="bg-tertiary border border-[#717888] rounded-sm p-2 text-sm font-mono text-white placeholder:text-[#717888] min-h-[60px] resize-y focus:outline-none focus:border-white"
          value={form.commandText}
          placeholder={formatCommand(ACP_PROVIDERS[0]?.default_command ?? [])}
          onChange={(e) => form.setCommandText(e.target.value)}
        />
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$AGENT_COMMAND_HINT)}
        </Typography.Text>
      </div>

      <SettingsInput
        testId="agent-profile-session-mode"
        label={t(I18nKey.SETTINGS$AGENT_PROFILE_SESSION_MODE_LABEL)}
        type="text"
        className="w-full"
        showOptionalTag
        value={form.sessionMode}
        onChange={form.setSessionMode}
      />

      <SettingsInput
        testId="agent-profile-prompt-timeout"
        label={t(I18nKey.SETTINGS$AGENT_PROFILE_PROMPT_TIMEOUT_LABEL)}
        type="number"
        min={1}
        step={1}
        // Empty/invalid resolves to this default on save (see buildPayload); the
        // placeholder telegraphs that so the fallback isn't silent.
        placeholder="1800"
        className="w-full max-w-xs"
        value={form.promptTimeout}
        onChange={form.setPromptTimeout}
      />
    </SectionShell>
  );
}

export function McpSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_MCP)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_MCP_DESC)}
    >
      <McpServerRefsSelect
        availableServers={form.mcpServerNames}
        value={form.mcpServerRefs}
        onChange={form.setMcpServerRefs}
      />
      <Typography.Text className="text-xs text-[#717888]">
        {t(I18nKey.SETTINGS$AGENT_MANAGE_MCP_SERVERS)}
      </Typography.Text>
    </SectionShell>
  );
}

export function AuthenticationSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  const isCustom = form.selectedPreset === ACP_CUSTOM_PRESET_KEY;
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_AUTHENTICATION)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_AUTHENTICATION_DESC)}
    >
      {isCustom ? (
        <Typography.Text
          className="text-sm text-[#A3A3A3]"
          testId="agent-profile-auth-custom"
        >
          {t(I18nKey.SETTINGS$AGENT_AUTH_CUSTOM_NOTE)}
        </Typography.Text>
      ) : (
        <AcpCredentialsSection
          form={form.acpCredentialForm}
          providerKey={form.selectedPreset}
          hideHeading
        />
      )}
    </SectionShell>
  );
}
