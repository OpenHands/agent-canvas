import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";
import { KebabMenu } from "./kebab-menu";
import type { KebabMenuItem } from "./kebab-menu";
import { useHasPermission } from "#/hooks/use-has-permission";
import { useNavigation } from "#/context/navigation-context";
import { FileText } from "lucide-react";
import FolderIcon from "#/icons/folder.svg?react";
import ClockIcon from "#/icons/clock.svg?react";
import SparkleIcon from "#/icons/sparkle.svg?react";
import PlayIcon from "#/icons/play.svg?react";
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
  onRunNow: (id: string) => void;
  isRunPending?: boolean;
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

const cardRunNowButtonClassName =
  "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-interactive-hover)] hover:text-[var(--oh-foreground)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[var(--oh-muted)]";

export function AutomationCard({
  automation,
  onToggle,
  onRunNow,
  isRunPending = false,
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

  const handleView = () => {
    navigate?.(`/automations/${automation.id}`);
  };

  const menuItems: KebabMenuItem[] = [
    ...(canManage
      ? [
          {
            label: t(I18nKey.AUTOMATIONS$RUN_NOW),
            icon: <PlayIcon className="size-4" />,
            onClick: () => onRunNow(automation.id),
            disabled: isRunPending,
          },
        ]
      : []),
    {
      label: t(I18nKey.COMMON$VIEW),
      icon: <FileText className="size-4" aria-hidden />,
      onClick: handleView,
    },
    ...(canManage && onEdit
      ? [
          {
            label: t(I18nKey.AUTOMATIONS$EDIT),
            icon: <EditIcon className="size-4" />,
            onClick: () => onEdit(automation.id),
          },
        ]
      : []),
    ...(canManage
      ? [
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
          },
        ]
      : []),
  ];

  const handleCardClick = () => {
    handleView();
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

        <div className="flex shrink-0 items-center gap-0.5">
          {canManage ? (
            <button
              type="button"
              data-testid={`automation-run-now-${automation.id}`}
              aria-busy={isRunPending}
              disabled={isRunPending}
              onClick={(event) => {
                event.stopPropagation();
                onRunNow(automation.id);
              }}
              className={cardRunNowButtonClassName}
            >
              <PlayIcon className="size-3.5 shrink-0" aria-hidden />
              {t(I18nKey.AUTOMATIONS$RUN_NOW)}
            </button>
          ) : null}
          <KebabMenu items={menuItems} />
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
