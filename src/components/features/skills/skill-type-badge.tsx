import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { SkillType } from "#/types/settings";
import { cn } from "#/utils/utils";

interface SkillTypeBadgeProps {
  type: SkillType;
}

const SKILL_TYPE_BADGE_MONOCHROME_CLASS_NAME =
  "bg-[rgba(195,205,220,0.12)] text-tertiary-light border border-[rgba(195,205,220,0.35)]";

const TYPE_CONFIG: Record<
  SkillType,
  {
    labelKey: I18nKey;
    className: string;
  }
> = {
  agentskills: {
    labelKey: I18nKey.SETTINGS$SKILLS_TYPE_AGENTSKILLS,
    className: SKILL_TYPE_BADGE_MONOCHROME_CLASS_NAME,
  },
  knowledge: {
    labelKey: I18nKey.SETTINGS$SKILLS_TYPE_KNOWLEDGE,
    className: SKILL_TYPE_BADGE_MONOCHROME_CLASS_NAME,
  },
  repo: {
    labelKey: I18nKey.SETTINGS$SKILLS_TYPE_REPO,
    className: SKILL_TYPE_BADGE_MONOCHROME_CLASS_NAME,
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
