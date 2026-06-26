import { useTranslation } from "react-i18next";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { I18nKey } from "#/i18n/declaration";
import {
  getAvailableWorkOptionalTools,
  isWorkOptionalToolAvailable,
} from "#/types/work-tools";
import type { WorkOptionalToolId } from "#/types/work-tools";

interface WorkToolTogglesProps {
  enabledOptionalToolIds: WorkOptionalToolId[];
  onChange: (next: WorkOptionalToolId[]) => void;
  isDisabled?: boolean;
  testIdPrefix?: string;
}

export function WorkToolToggles({
  enabledOptionalToolIds,
  onChange,
  isDisabled = false,
  testIdPrefix = "work-tool",
}: WorkToolTogglesProps) {
  const { t } = useTranslation("openhands");
  const availableTools = getAvailableWorkOptionalTools();

  if (availableTools.length === 0) {
    return (
      <p className="text-xs text-tertiary-light">
        {t(I18nKey.WORK$TOOLS_NONE_AVAILABLE)}
      </p>
    );
  }

  const toggleTool = (toolId: WorkOptionalToolId, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...enabledOptionalToolIds, toolId]))
      : enabledOptionalToolIds.filter((entry) => entry !== toolId);
    onChange(next);
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-list`}>
      {availableTools.map((tool) => {
        const isEnabled = enabledOptionalToolIds.includes(tool.id);
        const toolAvailable = isWorkOptionalToolAvailable(tool.id);

        return (
          <div
            key={tool.id}
            className="flex items-start justify-between gap-3 rounded-md border border-[var(--oh-border-input)] px-3 py-2"
            data-testid={`${testIdPrefix}-${tool.id}`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t(tool.labelKey as I18nKey)}
              </p>
              <p className="mt-0.5 text-xs text-tertiary-light">
                {t(tool.descriptionKey as I18nKey)}
              </p>
            </div>
            <SettingsSwitch
              testId={`${testIdPrefix}-${tool.id}-switch`}
              isToggled={isEnabled}
              isDisabled={isDisabled || !toolAvailable}
              togglePosition="right"
              onToggle={(checked) => toggleTool(tool.id, checked)}
            />
          </div>
        );
      })}
    </div>
  );
}
