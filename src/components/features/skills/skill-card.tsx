import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { I18nKey } from "#/i18n/declaration";
import type { SkillInfo } from "#/types/settings";
import { cn } from "#/utils/utils";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import ChevronDownIcon from "#/icons/chevron-down.svg?react";
import CopyIcon from "#/icons/copy.svg?react";
import { SkillTypeBadge } from "./skill-type-badge";

interface SkillCardProps {
  skill: SkillInfo;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const DESCRIPTION_CLAMP_THRESHOLD = 220;

function hasExpandableMetadata(skill: SkillInfo): boolean {
  return Boolean(
    skill.source ||
    skill.license ||
    skill.compatibility ||
    (skill.allowed_tools && skill.allowed_tools.length > 0) ||
    (skill.metadata && Object.keys(skill.metadata).length > 0),
  );
}

export function SkillCard({ skill, enabled, onToggle }: SkillCardProps) {
  const { t } = useTranslation("openhands");
  const [showFullDescription, setShowFullDescription] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const description = skill.description?.trim() || "";
  const isDescriptionClamped = description.length > DESCRIPTION_CLAMP_THRESHOLD;
  const showShowMoreButton = isDescriptionClamped;

  const handleCopySource = async () => {
    if (!skill.source) return;
    try {
      await navigator.clipboard.writeText(skill.source);
      displaySuccessToast(t(I18nKey.SETTINGS$SKILLS_COPIED));
    } catch {
      displayErrorToast(t(I18nKey.ERROR$GENERIC));
    }
  };

  const detailsAvailable = hasExpandableMetadata(skill);

  return (
    <article
      data-testid={`skill-card-${skill.name}`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-[var(--oh-border)] bg-base-secondary p-4 transition-colors hover:border-[var(--cool-grey-500)] hover:bg-base-tertiary/30",
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
              className="inline-flex items-center rounded-full border border-[var(--oh-border)] px-2 py-0.5 text-[11px] font-medium text-tertiary-light"
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
            className="mt-1 text-xs font-medium text-[var(--oh-muted)] hover:text-white hover:underline transition-colors"
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
              className="inline-flex items-center rounded-md border border-[var(--oh-border)] bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[11px] text-tertiary-light"
            >
              {trigger}
            </span>
          ))}
        </div>
      )}

      {detailsAvailable && (
        <div className="pt-2">
          <button
            type="button"
            data-testid={`skill-details-toggle-${skill.name}`}
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between text-xs font-medium text-tertiary-light hover:text-white"
          >
            <span>{t(I18nKey.SETTINGS$SKILLS_DETAILS)}</span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform",
                detailsOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          {detailsOpen && (
            <dl
              data-testid={`skill-details-${skill.name}`}
              className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-[max-content_1fr]"
            >
              {skill.source && (
                <>
                  <dt className="text-tertiary-light">
                    {t(I18nKey.SETTINGS$SKILLS_SOURCE)}
                  </dt>
                  <dd className="flex items-center gap-2 min-w-0">
                    <code
                      data-testid={`skill-source-${skill.name}`}
                      className="block break-all rounded bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 font-mono text-[11px] text-white"
                    >
                      {skill.source}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopySource}
                      aria-label={t(I18nKey.SETTINGS$SKILLS_COPY_PATH)}
                      data-testid={`skill-copy-source-${skill.name}`}
                      className="shrink-0 rounded p-1 text-tertiary-light hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
                    >
                      <CopyIcon className="size-3.5" />
                    </button>
                  </dd>
                </>
              )}
              {skill.license && (
                <>
                  <dt className="text-tertiary-light">
                    {t(I18nKey.SETTINGS$SKILLS_LICENSE)}
                  </dt>
                  <dd className="text-white">{skill.license}</dd>
                </>
              )}
              {skill.compatibility && (
                <>
                  <dt className="text-tertiary-light">
                    {t(I18nKey.SETTINGS$SKILLS_COMPATIBILITY)}
                  </dt>
                  <dd className="text-white">{skill.compatibility}</dd>
                </>
              )}
              {skill.allowed_tools && skill.allowed_tools.length > 0 && (
                <>
                  <dt className="text-tertiary-light">
                    {t(I18nKey.SETTINGS$SKILLS_ALLOWED_TOOLS)}
                  </dt>
                  <dd className="flex flex-wrap gap-1">
                    {skill.allowed_tools.map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center rounded-md border border-[var(--oh-border)] px-1.5 py-0.5 font-mono text-[11px] text-tertiary-light"
                      >
                        {tool}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              {skill.metadata && Object.keys(skill.metadata).length > 0 && (
                <>
                  <dt className="text-tertiary-light">
                    {t(I18nKey.SETTINGS$SKILLS_METADATA)}
                  </dt>
                  <dd>
                    <ul className="flex flex-col gap-0.5">
                      {Object.entries(skill.metadata).map(([key, value]) => (
                        <li key={key} className="flex gap-2">
                          <span className="font-mono text-[11px] text-tertiary-light">
                            {key}:
                          </span>
                          <span className="text-white">{value}</span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      )}
    </article>
  );
}
