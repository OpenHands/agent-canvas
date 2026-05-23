import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";
import { SkillReadyItem } from "../event-content-helpers/create-skill-ready-event";
import { SkillItemExpanded } from "./skill-item-expanded";

interface SkillReadyContentListProps {
  items: SkillReadyItem[];
}

export function SkillReadyContentList({ items }: SkillReadyContentListProps) {
  const { t } = useTranslation("openhands");
  const [expandedSkills, setExpandedSkills] = React.useState<
    Record<string, boolean>
  >({});

  const toggleSkill = (name: string) => {
    setExpandedSkills((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="flex flex-col gap-1 mt-1">
      <Typography.Text className="font-bold text-[var(--oh-foreground)] text-sm px-2 py-1">
        {t(I18nKey.SKILLS$TRIGGERED_SKILL_KNOWLEDGE)}
      </Typography.Text>
      {items.map((item) => {
        const isExpanded = expandedSkills[item.name] || false;

        return (
          <div
            key={item.name}
            className="border border-[var(--oh-border-subtle)] rounded-md overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleSkill(item.name)}
              className="w-full py-1.5 px-2 text-left flex items-center gap-2 hover:bg-tertiary transition-colors cursor-pointer"
            >
              <Typography.Text className="text-[var(--oh-text-tertiary)]">
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </Typography.Text>
              <Typography.Text className="font-normal text-[var(--oh-foreground)] text-sm">
                {item.name}
              </Typography.Text>
            </button>

            {isExpanded && item.content && (
              <>
                <hr className="border-[var(--oh-border-subtle)]" />
                <SkillItemExpanded content={item.content} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
