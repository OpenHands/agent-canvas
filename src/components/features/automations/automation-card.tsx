import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";
import { ToggleSwitch } from "./toggle-switch";
import { KebabMenu } from "./kebab-menu";
import type { KebabMenuItem } from "./kebab-menu";
import { useHasPermission } from "#/hooks/use-has-permission";
import { useNavigation } from "#/context/navigation-context";
import FolderIcon from "#/icons/folder.svg?react";
import ClockIcon from "#/icons/clock.svg?react";
import SparkleIcon from "#/icons/sparkle.svg?react";
import PowerIcon from "#/icons/power.svg?react";
import TrashIcon from "#/icons/trash.svg?react";
import EditIcon from "#/icons/u-edit.svg?react";
import {
  SkillCardPillRow,
  type SkillCardPill,
} from "#/components/features/skills/skill-card-pill-row";
import { cn } from "#/utils/utils";
import {
  extensionModuleCardInteractiveClassName,
  extensionModuleCardPillClassName,
  extensionModuleCardSurfaceClassName,
} from "#/utils/extension-module-card-classes";

interface AutomationCardProps {
  automation: Automation;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
}

function buildAutomationMetadataPills(
  automation: Automation,
  scheduleLabel: string,
): SkillCardPill[] {
  const pills: SkillCardPill[] = [];

  if (automation.repository) {
    pills.push({
      id: "repository",
      node: (
        <span className={cn(extensionModuleCardPillClassName, "gap-1")}>
          <FolderIcon className="size-3 shrink-0" />
          {automation.repository}
        </span>
      ),
    });
  }

  pills.push({
    id: "schedule",
    node: (
      <span className={cn(extensionModuleCardPillClassName, "gap-1")}>
        <ClockIcon className="size-3 shrink-0" />
        {scheduleLabel}
      </span>
    ),
  });

  if (automation.model) {
    pills.push({
      id: "model",
      node: (
        <span className={cn(extensionModuleCardPillClassName, "gap-1")}>
          <SparkleIcon className="size-3 shrink-0" />
          {automation.model}
        </span>
      ),
    });
  }

  return pills;
}

export function AutomationCard({
  automation,
  onToggle,
  onDelete,
  onEdit,
}: AutomationCardProps) {
  const { navigate } = useNavigation();
  const { t } = useTranslation("openhands");
  const canManage = useHasPermission("manage_automations");

  const scheduleLabel =
    automation.trigger.schedule_human || automation.trigger.type;
  const pills = useMemo(
    () => buildAutomationMetadataPills(automation, scheduleLabel),
    [automation, scheduleLabel],
  );

  const menuItems: KebabMenuItem[] = [
    ...(onEdit
      ? [
          {
            label: t(I18nKey.AUTOMATIONS$EDIT),
            icon: <EditIcon className="size-4" />,
            onClick: () => onEdit(automation.id),
          },
        ]
      : []),
    {
      label: automation.enabled
        ? t(I18nKey.AUTOMATIONS$TURN_OFF)
        : t(I18nKey.AUTOMATIONS$TURN_ON),
      icon: <PowerIcon className="size-4" />,
      onClick: () => onToggle(automation.id, automation.enabled),
    },
    {
      label: t(I18nKey.AUTOMATIONS$DELETE),
      icon: <TrashIcon className="size-4" />,
      onClick: () => onDelete(automation.id),
      variant: "danger",
    },
  ];

  const handleCardClick = () => {
    navigate?.(`/automations/${automation.id}`);
  };

  return (
    <div
      role="link"
      tabIndex={0}
      data-testid={`automation-card-${automation.id}`}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleCardClick();
      }}
      className={cn(
        "flex min-w-0 flex-col gap-3 overflow-hidden p-4 text-left",
        extensionModuleCardSurfaceClassName,
        extensionModuleCardInteractiveClassName,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
          {automation.name}
        </h3>

        <div className="flex shrink-0 items-center gap-2">
          {canManage && (
            <ToggleSwitch
              enabled={automation.enabled}
              label={`Toggle ${automation.name}`}
              onToggle={() => onToggle(automation.id, automation.enabled)}
            />
          )}
          {canManage && <KebabMenu items={menuItems} />}
        </div>
      </header>

      {automation.prompt ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-tertiary-light">
          {automation.prompt}
        </p>
      ) : null}

      {pills.length > 0 ? (
        <SkillCardPillRow
          pills={pills}
          testId={`automation-pills-${automation.id}`}
        />
      ) : null}
    </div>
  );
}
