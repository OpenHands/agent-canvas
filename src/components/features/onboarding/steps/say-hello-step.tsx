import React from "react";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { RecommendedAutomationsLauncher } from "#/components/features/automations/recommended-automations-launcher";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { I18nKey } from "#/i18n/declaration";

interface SayHelloStepProps {
  onBack: () => void;
  /** Called once the conversation has been created — used by the parent
   * modal to mark the onboarding as complete before unmounting. */
  onLaunched: () => void;
}

/**
 * Step 3: a simple text input pre-filled with "hello OpenHands!" that
 * launches a brand-new conversation with no workspace and navigates
 * to it. Completing this step finishes the onboarding flow.
 */
export function SayHelloStep({ onBack, onLaunched }: SayHelloStepProps) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const defaultMessage = t(I18nKey.ONBOARDING$HELLO_DEFAULT_MESSAGE);
  const [message, setMessage] = React.useState(defaultMessage);

  const {
    mutate: createConversation,
    isPending,
    isSuccess,
  } = useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isLaunching = isPending || isSuccess || isCreatingElsewhere;
  const launchInFlightRef = React.useRef(false);

  const canSubmit =
    message.trim().length > 0 && !isLaunching && !launchInFlightRef.current;

  const launchConversation = () => {
    if (!canSubmit || launchInFlightRef.current) return;
    launchInFlightRef.current = true;

    // Explicitly omit `repository` and `workingDir` so the
    // conversation starts with no workspace, per the spec.
    createConversation(
      { query: message.trim() },
      {
        onSuccess: (data) => {
          onLaunched();
          navigate(`/conversations/${data.conversation_id}`);
        },
        onError: () => {
          launchInFlightRef.current = false;
        },
      },
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    launchConversation();
  };

  return (
    <div
      data-testid="onboarding-step-say-hello"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-white">
          {t(I18nKey.ONBOARDING$HELLO_TITLE)}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.ONBOARDING$HELLO_SUBTITLE)}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="contents">
        <input
          data-testid="onboarding-hello-input"
          aria-label={t(I18nKey.ONBOARDING$HELLO_TITLE)}
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={defaultMessage}
          disabled={isLaunching}
          className="w-full rounded-xl border border-white/10 bg-base-secondary px-4 py-3 text-base text-white placeholder:text-[var(--oh-text-subtle)] focus:border-primary focus:outline-none disabled:opacity-60"
        />
      </form>

      <div data-testid="onboarding-recommended-automations">
        <RecommendedAutomationsLauncher onLaunched={onLaunched} />
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 bg-base-secondary pt-4 pb-7">
        <BrandButton
          testId="onboarding-hello-back"
          type="button"
          variant="secondary"
          onClick={onBack}
          isDisabled={isLaunching}
        >
          {t(I18nKey.ONBOARDING$BACK)}
        </BrandButton>
        <BrandButton
          testId="onboarding-hello-launch"
          type="button"
          variant="primary"
          isDisabled={!canSubmit}
          onClick={launchConversation}
          startContent={<Send className="size-4" aria-hidden />}
        >
          {isLaunching
            ? t(I18nKey.ONBOARDING$HELLO_LAUNCHING)
            : t(I18nKey.ONBOARDING$HELLO_LAUNCH)}
        </BrandButton>
      </div>
    </div>
  );
}
