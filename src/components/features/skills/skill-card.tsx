import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { I18nKey } from "#/i18n/declaration";
import type { SkillInfo } from "#/types/settings";
import { cn } from "#/utils/utils";
import { SkillTypeBadge } from "./skill-type-badge";

interface SkillCardProps {
  skill: SkillInfo;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const DESCRIPTION_CLAMP_THRESHOLD = 220;

export function SkillCard({ skill, enabled, onToggle }: SkillCardProps) {
  const { t } = useTranslation("openhands");
  const [showFullDescription, setShowFullDescription] = React.useState(false);

  const description = skill.description?.trim() || "";
  const isDescriptionClamped = description.length > DESCRIPTION_CLAMP_THRESHOLD;
  const showShowMoreButton = isDescriptionClamped;

  return (
    <article
      data-testid={`skill-card-${skill.name}`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-tertiary bg-base-secondary p-4 transition-colors hover:border-white/40 hover:bg-base-tertiary/30",
        !enabled && "opacity-70",
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            data-testid={`skill-name-${skill.name}`}
            className="text-sm font-semibold text-white truncate"
          >
            {skill.name}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <SkillTypeBadge type={skill.type} />
          {skill.version && (
            <span
              data-testid={`skill-version-${skill.name}`}
              className="inline-flex items-center rounded-full border border-tertiary px-2 py-0.5 text-[11px] font-medium text-tertiary-light"
            >
              {t(I18nKey.SETTINGS$SKILLS_VERSION, { version: skill.version })}
            </span>
          )}
          {skill.disable_model_invocation && (
            <span
              data-testid={`skill-disable-model-invocation-${skill.name}`}
              className="inline-flex items-center gap-1 rounded-full border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.12)] px-2 py-0.5 text-[11px] font-medium text-[#fca5a5]"
            >
              <span className="size-1.5 rounded-full bg-[#fca5a5]" />
              {t(I18nKey.SETTINGS$SKILLS_DISABLE_MODEL_INVOCATION)}
            </span>
          )}
          <SettingsSwitch
            testId={`skill-toggle-${skill.name}`}
            isToggled={enabled}
            onToggle={onToggle}
          />
        </div>
      </header>

      <div data-testid={`skill-description-${skill.name}`} className="text-sm">
        {description ? (
          <p
            className={cn(
              "whitespace-pre-wrap text-tertiary-light leading-5",
              !showFullDescription && isDescriptionClamped && "line-clamp-3",
            )}
          >
            {description}
          </p>
        ) : null}
        {showShowMoreButton && (
          <button
            type="button"
            onClick={() => setShowFullDescription((prev) => !prev)}
            data-testid={`skill-show-more-${skill.name}`}
            className="mt-1 text-xs font-medium text-primary hover:underline"
          >
            {showFullDescription
              ? t(I18nKey.SETTINGS$SKILLS_SHOW_LESS)
              : t(I18nKey.SETTINGS$SKILLS_SHOW_MORE)}
          </button>
        )}
      </div>

      {skill.triggers && skill.triggers.length > 0 && (
        <div
          data-testid={`skill-triggers-${skill.name}`}
          className="flex flex-wrap items-center gap-1.5"
        >
          {skill.triggers.map((trigger) => (
            <span
              key={trigger}
              className="inline-flex items-center rounded-md border border-tertiary bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[11px] text-tertiary-light"
            >
              {trigger}
            </span>
          ))}
        </div>
      )}

    </article>
  );
}
