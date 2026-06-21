import { CheckboxGroup, Checkbox } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";

interface McpServerRefsSelectProps {
  /** Names of the user's currently configured MCP servers (mcp_config keys). */
  availableServers: string[];
  /**
   * `null` = all configured servers; `[]` = none; a non-null list = exactly the
   * named servers. Mirrors `AgentProfile.mcp_server_refs`.
   */
  value: string[] | null;
  onChange: (value: string[] | null) => void;
}

/**
 * Tri-state selector for `mcp_server_refs`. An "All configured servers" switch
 * maps to `null`; turning it off reveals a checkbox list whose selection becomes
 * the explicit name list (`[]` when nothing is checked). Dangling refs — names
 * the user previously selected that are no longer configured — are still shown
 * (checked) so the user can see and drop them; the backend hard-errors on them
 * at resolve time, surfaced separately by the editor's materialize check.
 */
export function McpServerRefsSelect({
  availableServers,
  value,
  onChange,
}: McpServerRefsSelectProps) {
  const { t } = useTranslation("openhands");
  const allServers = value === null;

  // Show configured servers plus any still-referenced-but-removed names so the
  // selection round-trips a dangling ref instead of silently dropping it.
  const danglingRefs = (value ?? []).filter(
    (name) => !availableServers.includes(name),
  );
  const options = [...availableServers, ...danglingRefs];

  return (
    <div className="flex flex-col gap-3" data-testid="mcp-server-refs-select">
      <div className="flex flex-col gap-1">
        <Typography.Text className="text-sm font-medium text-white">
          {t(I18nKey.SETTINGS$AGENT_PROFILE_MCP_REFS_LABEL)}
        </Typography.Text>
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$AGENT_PROFILE_MCP_REFS_HINT)}
        </Typography.Text>
      </div>

      <SettingsSwitch
        testId="mcp-server-refs-all"
        isToggled={allServers}
        onToggle={(on) => onChange(on ? null : [...availableServers])}
      >
        {t(I18nKey.SETTINGS$AGENT_PROFILE_MCP_ALL_LABEL)}
      </SettingsSwitch>

      {!allServers &&
        (options.length === 0 ? (
          <Typography.Text className="text-xs text-[#717888]">
            {t(I18nKey.SETTINGS$AGENT_PROFILE_MCP_NONE_AVAILABLE)}
          </Typography.Text>
        ) : (
          <CheckboxGroup
            value={value ?? []}
            onValueChange={(next) => onChange(next)}
            classNames={{ wrapper: "gap-2" }}
          >
            {options.map((name) => (
              <Checkbox
                key={name}
                value={name}
                data-testid={`mcp-server-ref-${name}`}
                size="sm"
              >
                <span className="text-sm text-white">{name}</span>
              </Checkbox>
            ))}
          </CheckboxGroup>
        ))}
    </div>
  );
}
