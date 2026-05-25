import React from "react";
import { useTranslation } from "react-i18next";
import { AxiosError } from "axios";
import { Check } from "lucide-react";
import OpenHandsLogo from "#/assets/branding/openhands-logo.svg?react";
import TerminalIcon from "#/icons/terminal.svg?react";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import {
  ACP_PROVIDER_FALLBACK_ICON,
  ACP_PROVIDERS,
  buildAcpAgentSettingsDiff,
  type ACPProviderIcon,
} from "#/constants/acp-providers";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

export type OnboardingAgentId =
  | "openhands"
  | "claude-code"
  | "codex"
  | "gemini-cli";

const CLAUDE_CODE_MARK_PATH =
  "m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z";

const CODEX_MARK_PATH =
  "M4.04286 0.228393C4.52451 0.0304495 5.0488 -0.0409817 5.56586 0.0208928C6.23236 0.0973928 6.82636 0.380893 7.34786 0.870893C7.35488 0.877545 7.36344 0.882351 7.37278 0.884881C7.38212 0.887412 7.39194 0.887588 7.40136 0.885393C8.10536 0.712393 8.78236 0.773393 9.43186 1.06839L9.46336 1.08339L9.54036 1.12139C10.2189 1.47289 10.7054 2.00639 10.9994 2.72039C11.1384 3.05989 11.2084 3.41439 11.2099 3.78339C11.2197 4.05816 11.1893 4.33288 11.1199 4.59889C11.1164 4.61245 11.1165 4.62665 11.12 4.6402C11.1235 4.65374 11.1303 4.66618 11.1399 4.67639C11.5329 5.0749 11.8063 5.57572 11.9289 6.12189C12.1214 7.07239 11.9239 7.92939 11.3374 8.69189L11.2464 8.80189C10.8579 9.24669 10.3481 9.56836 9.77936 9.72739C9.76694 9.73097 9.75556 9.73747 9.74617 9.74634C9.73677 9.75521 9.72964 9.7662 9.72536 9.77839C9.59786 10.1464 9.46986 10.4604 9.23186 10.7744C8.63236 11.5654 7.75086 12.0054 6.75786 11.9999C5.96636 11.9959 5.26486 11.7064 4.65286 11.1319C4.64358 11.1234 4.63225 11.1174 4.61998 11.1146C4.6077 11.1118 4.59491 11.1123 4.58286 11.1159C4.32386 11.1994 4.06286 11.2114 3.78086 11.2084C3.33033 11.2048 2.88658 11.0984 2.48336 10.8974C2.0613 10.688 1.6939 10.3831 1.41036 10.0069C1.30886 9.87239 1.20836 9.74589 1.13486 9.59639C1.03349 9.39033 0.95066 9.17565 0.887357 8.95489C0.754446 8.45324 0.751521 7.92599 0.878857 7.42289C0.882974 7.41102 0.884341 7.39837 0.882857 7.38589C0.88038 7.37348 0.873877 7.36223 0.864357 7.35389C0.556147 7.04213 0.320543 6.66619 0.174357 6.25289C0.0775698 5.99842 0.0213841 5.73031 0.00785682 5.45839C-0.0163229 5.10033 0.0153902 4.74069 0.101857 4.39239C0.326857 3.65039 0.756357 3.06839 1.39036 2.64589C1.53136 2.55189 1.66536 2.47889 1.79136 2.42689C1.93436 2.36689 2.07786 2.31689 2.22186 2.27489C2.23216 2.27184 2.24153 2.26626 2.24913 2.25866C2.25672 2.25107 2.2623 2.24169 2.26536 2.23139C2.37455 1.83888 2.56235 1.47264 2.81736 1.15489C3.15736 0.731893 3.56586 0.422893 4.04286 0.228393ZM3.64086 4.15339C3.58503 4.05573 3.49269 3.98424 3.38415 3.95465C3.27562 3.92507 3.15977 3.93981 3.06211 3.99564C2.96444 4.05147 2.89295 4.14381 2.86337 4.25235C2.83378 4.36088 2.84853 4.47673 2.90436 4.57439L3.75136 6.05689L2.90736 7.48089C2.85561 7.57738 2.84315 7.69014 2.87257 7.7956C2.902 7.90106 2.97104 7.99108 3.06526 8.04684C3.15949 8.1026 3.27162 8.1198 3.37823 8.09484C3.48484 8.06988 3.57768 8.00469 3.63736 7.91289L4.60736 6.27689C4.64561 6.21237 4.66609 6.13887 4.66671 6.06386C4.66732 5.98886 4.64805 5.91503 4.61086 5.84989L3.64086 4.15339ZM6.36386 7.27339C6.25583 7.27982 6.15434 7.32727 6.08012 7.40603C6.00591 7.48479 5.96458 7.58892 5.96458 7.69714C5.96458 7.80536 6.00591 7.90949 6.08012 7.98826C6.15434 8.06702 6.25583 8.11446 6.36386 8.12089H8.78786C8.89675 8.1156 8.99943 8.06862 9.07462 7.98969C9.14982 7.91075 9.19176 7.80591 9.19176 7.69689C9.19176 7.58787 9.14982 7.48303 9.07462 7.4041C8.99943 7.32516 8.89675 7.27818 8.78786 7.27289H6.36386V7.27339Z";

const GEMINI_MARK_PATH =
  "M12 0C12.904 6.056 17.944 11.096 24 12C17.944 12.904 12.904 17.944 12 24C11.096 17.944 6.056 12.904 0 12C6.056 11.096 11.096 6.056 12 0Z";

function getAgentOptionIcon(id: string): ACPProviderIcon {
  if (id === "openhands") return "openhands";

  return (
    ACP_PROVIDERS.find(({ key }) => key === id)?.icon ??
    ACP_PROVIDER_FALLBACK_ICON
  );
}

export function AgentOptionIcon({ id, muted }: { id: string; muted: boolean }) {
  const iconClass = muted ? "text-[var(--oh-muted)]" : "text-white";
  const icon = getAgentOptionIcon(id);

  if (icon === "openhands") {
    return (
      <OpenHandsLogo
        width={24}
        height={16}
        className={cn("shrink-0", muted && "opacity-55")}
        data-testid="onboarding-agent-icon-openhands"
        aria-hidden
      />
    );
  }

  if (icon === "claude-code") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        className={cn("size-[18px] shrink-0", iconClass)}
        data-testid="onboarding-agent-icon-claude-code"
        aria-hidden
      >
        <path fill="currentColor" d={CLAUDE_CODE_MARK_PATH} />
      </svg>
    );
  }

  if (icon === "gemini") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className={cn("size-[18px] shrink-0", iconClass)}
        data-testid="onboarding-agent-icon-gemini"
        aria-hidden
      >
        <path fill="currentColor" d={GEMINI_MARK_PATH} />
      </svg>
    );
  }

  if (icon === "cli-generic") {
    return (
      <TerminalIcon
        className={cn("size-[18px] shrink-0", iconClass)}
        data-testid="onboarding-agent-icon-cli-generic"
        aria-hidden
      />
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 12"
      fill="none"
      className={cn("size-[18px] shrink-0", iconClass)}
      data-testid="onboarding-agent-icon-codex"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={CODEX_MARK_PATH}
        fill="currentColor"
      />
    </svg>
  );
}

interface AgentOption {
  id: OnboardingAgentId;
  label: string;
  descriptionKey: I18nKey;
}

// Onboarding tile list is *derived* from the ACP registry so adding a
// new provider (or changing a display name) only needs one edit in
// ``acp-providers.ts``. The OpenHands tile is the only synthetic
// entry — it isn't an ACP provider, just the canonical default.
function getAgentOptions(): AgentOption[] {
  return [
    {
      id: "openhands",
      label: "OpenHands",
      descriptionKey: I18nKey.ONBOARDING$AGENT_OPENHANDS_DESCRIPTION,
    },
    ...ACP_PROVIDERS.map<AgentOption>((provider) => ({
      id: provider.key as OnboardingAgentId,
      label: provider.display_name,
      descriptionKey: provider.description_key,
    })),
  ];
}

interface ChooseAgentStepProps {
  selectedAgentId: OnboardingAgentId;
  onSelect: (agentId: OnboardingAgentId) => void;
  onNext: () => void;
}

export function ChooseAgentStep({
  selectedAgentId,
  onSelect,
  onNext,
}: ChooseAgentStepProps) {
  const { t } = useTranslation("openhands");
  const { mutate: saveSettings, isPending: isSaving } = useSaveSettings();

  const handleNext = () => {
    const diff = buildAcpAgentSettingsDiff(selectedAgentId);
    if (!diff) {
      // Unknown id (shouldn't be reachable through the UI). Advance
      // without writing — better to show the next step than block the
      // user behind a silent no-op.
      onNext();
      return;
    }

    saveSettings(
      { agent_settings_diff: diff },
      {
        onError: (error) => {
          const message = retrieveAxiosErrorMessage(error as AxiosError);
          displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
        },
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
          onNext();
        },
      },
    );
  };

  return (
    <div
      data-testid="onboarding-step-choose-agent"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-medium text-white">
          {t(I18nKey.ONBOARDING$AGENT_TITLE)}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.ONBOARDING$AGENT_SUBTITLE)}
        </p>
      </header>

      <div
        role="radiogroup"
        aria-label={t(I18nKey.ONBOARDING$AGENT_TITLE)}
        className="flex flex-col gap-3"
      >
        {getAgentOptions().map((option) => {
          const isSelected = option.id === selectedAgentId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-testid={`onboarding-agent-option-${option.id}`}
              data-selected={isSelected}
              onClick={() => onSelect(option.id)}
              className={cn(
                "flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer",
                isSelected
                  ? "border-white/45 bg-white/[0.09] shadow-none hover:border-white/45 hover:bg-white/[0.09]"
                  : "border-white/30 bg-white/5 hover:border-white/40 hover:bg-white/[0.08]",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                  <AgentOptionIcon id={option.id} muted={false} />
                  <span className="truncate text-base font-normal text-white">
                    {option.label}
                  </span>
                </div>
                <span className="text-xs text-[var(--oh-muted)]">
                  {t(option.descriptionKey)}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {isSelected ? (
                  <Check
                    width={18}
                    height={18}
                    className="mt-1 shrink-0 text-white"
                    aria-hidden
                  />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-0 flex justify-end bg-base-secondary pt-4 pb-7">
        <BrandButton
          testId="onboarding-agent-next"
          type="button"
          variant="primary"
          isDisabled={isSaving}
          onClick={handleNext}
        >
          {isSaving ? t(I18nKey.SETTINGS$SAVING) : t(I18nKey.ONBOARDING$NEXT)}
        </BrandButton>
      </div>
    </div>
  );
}
