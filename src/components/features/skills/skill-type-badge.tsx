import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { SkillType } from "#/types/settings";
import { cn } from "#/utils/utils";

interface SkillTypeBadgeProps {
  type: SkillType;
}

const TYPE_CONFIG: Record<
  SkillType,
  {
    labelKey: I18nKey;
    className: string;
  }
> = {
  agentskills: {
    labelKey: I18nKey.SETTINGS$SKILLS_TYPE_AGENTSKILLS,
    className:
      "bg-[rgba(247,206,109,0.12)] text-primary border border-[rgba(247,206,109,0.35)]",
  },
  knowledge: {
    labelKey: I18nKey.SETTINGS$SKILLS_TYPE_KNOWLEDGE,
    className:
      "bg-[rgba(96,165,250,0.12)] text-[#93c5fd] border border-[rgba(96,165,250,0.35)]",
  },
  repo: {
    labelKey: I18nKey.SETTINGS$SKILLS_TYPE_REPO,
    className:
      "bg-[rgba(52,211,153,0.12)] text-[#6ee7b7] border border-[rgba(52,211,153,0.35)]",
  },
};

export function getSkillTypeLabelKey(type: SkillType): I18nKey {
  return TYPE_CONFIG[type].labelKey;
}

export function SkillTypeBadge({ type }: SkillTypeBadgeProps) {
  const { t } = useTranslation("openhands");
  const config = TYPE_CONFIG[type];
  return (
    <span
      data-testid={`skill-type-badge-${type}`}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4",
        config.className,
      )}
    >
      {t(config.labelKey)}
    </span>
  );
}
