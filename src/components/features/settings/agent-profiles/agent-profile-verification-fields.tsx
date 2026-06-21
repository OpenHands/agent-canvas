import { useTranslation } from "react-i18next";
import type { ProfileVerificationSettings } from "@openhands/typescript-client";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";

const CRITIC_MODE_ALL_ACTIONS = "all_actions";
const CRITIC_MODE_FINISH_AND_MESSAGE = "finish_and_message";

interface AgentProfileVerificationFieldsProps {
  value: ProfileVerificationSettings;
  onChange: (next: ProfileVerificationSettings) => void;
}

/**
 * Editor for an OpenHands profile's `verification` block
 * ({@link ProfileVerificationSettings}). The critic toggle gates the detail
 * fields. Labels reuse the global agent-settings schema's `SCHEMA$VERIFICATION$*`
 * i18n keys so they stay consistent with the standalone Verification page.
 */
export function AgentProfileVerificationFields({
  value,
  onChange,
}: AgentProfileVerificationFieldsProps) {
  const { t } = useTranslation("openhands");

  const patch = (next: Partial<ProfileVerificationSettings>) =>
    onChange({ ...value, ...next });

  return (
    <div className="flex flex-col gap-4">
      <Typography.Text className="text-sm font-medium text-white">
        {t(I18nKey.SCHEMA$VERIFICATION$SECTION_LABEL)}
      </Typography.Text>

      <SettingsSwitch
        testId="agent-profile-critic-enabled"
        isToggled={value.critic_enabled}
        onToggle={(critic_enabled) => patch({ critic_enabled })}
      >
        {t(I18nKey.SCHEMA$VERIFICATION$CRITIC_ENABLED$LABEL)}
      </SettingsSwitch>

      {value.critic_enabled && (
        <div className="flex flex-col gap-4 border-l border-[#3D4046] pl-4">
          <SettingsDropdownInput
            testId="agent-profile-critic-mode"
            name="critic-mode"
            label={t(I18nKey.SCHEMA$VERIFICATION$CRITIC_MODE$LABEL)}
            items={[
              {
                key: CRITIC_MODE_ALL_ACTIONS,
                label: t(
                  I18nKey.SCHEMA$VERIFICATION$CRITIC_MODE$CHOICE$ALL_ACTIONS,
                ),
              },
              {
                key: CRITIC_MODE_FINISH_AND_MESSAGE,
                label: t(
                  I18nKey.SCHEMA$VERIFICATION$CRITIC_MODE$CHOICE$FINISH_AND_MESSAGE,
                ),
              },
            ]}
            selectedKey={value.critic_mode}
            isClearable={false}
            onSelectionChange={(key) => {
              if (key) patch({ critic_mode: String(key) });
            }}
          />

          <SettingsInput
            testId="agent-profile-critic-threshold"
            label={t(I18nKey.SCHEMA$VERIFICATION$CRITIC_THRESHOLD$LABEL)}
            type="number"
            min={0}
            max={1}
            step={0.05}
            className="w-full"
            value={String(value.critic_threshold)}
            onChange={(raw) => {
              const num = Number(raw);
              if (!Number.isNaN(num)) patch({ critic_threshold: num });
            }}
          />

          <SettingsSwitch
            testId="agent-profile-iterative-refinement"
            isToggled={value.enable_iterative_refinement}
            onToggle={(enable_iterative_refinement) =>
              patch({ enable_iterative_refinement })
            }
          >
            {t(I18nKey.SCHEMA$VERIFICATION$ENABLE_ITERATIVE_REFINEMENT$LABEL)}
          </SettingsSwitch>

          {value.enable_iterative_refinement && (
            <SettingsInput
              testId="agent-profile-max-refinement"
              label={t(
                I18nKey.SCHEMA$VERIFICATION$MAX_REFINEMENT_ITERATIONS$LABEL,
              )}
              type="number"
              min={1}
              step={1}
              className="w-full"
              value={String(value.max_refinement_iterations)}
              onChange={(raw) => {
                const num = Number(raw);
                if (!Number.isNaN(num))
                  patch({ max_refinement_iterations: num });
              }}
            />
          )}

          <SettingsInput
            testId="agent-profile-critic-server-url"
            label={t(I18nKey.SCHEMA$VERIFICATION$CRITIC_SERVER_URL$LABEL)}
            type="text"
            className="w-full"
            showOptionalTag
            value={value.critic_server_url ?? ""}
            onChange={(raw) =>
              patch({ critic_server_url: raw.trim() ? raw : null })
            }
          />

          <SettingsInput
            testId="agent-profile-critic-model-name"
            label={t(I18nKey.SCHEMA$VERIFICATION$CRITIC_MODEL_NAME$LABEL)}
            type="text"
            className="w-full"
            showOptionalTag
            value={value.critic_model_name ?? ""}
            onChange={(raw) =>
              patch({ critic_model_name: raw.trim() ? raw : null })
            }
          />
        </div>
      )}
    </div>
  );
}
