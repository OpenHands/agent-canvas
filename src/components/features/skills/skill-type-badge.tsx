import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { SkillType } from "#/types/settings";
import { cn } from "#/utils/utils";
import SparkleIcon from "#/icons/sparkle.svg?react";
import KeyIcon from "#/icons/key.svg?react";
import CheckCircleIcon from "#/icons/u-check-circle.svg?react";

interface SkillTypeBadgeProps {
  type: SkillType;
}

const TYPE_CONFIG: Record<
  SkillType,
  {
    labelKey: I18nKey;
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    className: string;
  }
> = {
  agentskills: {
    labelKey: I18nKey.SETTINGS$SKILLS_TYPE_AGENTSKILLS,
    Icon: SparkleIcon,
    className:
      "bg-[rgba(247,206,109,0.12)] text-primary border border-[rgba(247,206,109,0.35)]",
  },
  knowledge: {
    labelKey: I18nKey.SETTINGS$SKILLS_TYPE_KNOWLEDGE,
    Icon: KeyIcon,
    className:
      "bg-[rgba(96,165,250,0.12)] text-[#93c5fd] border border-[rgba(96,165,250,0.35)]",
  },
  repo: {
    labelKey: I18nKey.SETTINGS$SKILLS_TYPE_REPO,
    Icon: CheckCircleIcon,
    className:
      "bg-[rgba(52,211,153,0.12)] text-[#6ee7b7] border border-[rgba(52,211,153,0.35)]",
  },
};

export function SkillTypeBadge({ type }: SkillTypeBadgeProps) {
  const { t } = useTranslation("openhands");
  const config = TYPE_CONFIG[type];
  const { Icon } = config;
  return (
    <span
      data-testid={`skill-type-badge-${type}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4",
        config.className,
      )}
    >
      <Icon className="size-3" />
      {t(config.labelKey)}
    </span>
  );
}
