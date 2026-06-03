import React from "react";
import { useTranslation } from "react-i18next";
import { ChatSendButton } from "#/components/features/chat/chat-send-button";
import { RecommendedAutomationsLauncher } from "#/components/features/automations/recommended-automations-launcher";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useNavigation } from "#/context/navigation-context";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { I18nKey } from "#/i18n/declaration";

interface SayHelloStepProps {
  onBack: () => void;
  /** Dismisses onboarding without launching a conversation. */
  onClose: () => void;
  /** Called once the conversation has been created — used by the parent
   * modal to mark the onboarding as complete before unmounting. */
  onLaunched: () => void;
}

/**
 * Step 3: a simple text input pre-filled with "hello OpenHands!" that
 * launches a brand-new conversation with no workspace and navigates
 * to it. Completing this step finishes the onboarding flow.
 */
export function SayHelloStep({
  onBack,
  onClose,
  onLaunched,
}: SayHelloStepProps) {
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
        <h2 className="text-2xl font-medium text-white">
          {t(I18nKey.ONBOARDING$HELLO_TITLE)}
        </h2>
        <p className="text-sm text-[var(--oh-muted)]">
          {t(I18nKey.ONBOARDING$HELLO_SUBTITLE)}
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        data-testid="onboarding-hello-input-form"
        className="box-border flex w-full flex-col items-start justify-center rounded-[15px] border border-[var(--oh-border)] bg-surface-raised p-4"
      >
        <div className="relative w-full">
          <div className="box-border flex w-full shrink-0 flex-row items-end justify-between gap-2 p-0 pb-[18px]">
            <input
              data-testid="onboarding-hello-input"
              aria-label={t(I18nKey.ONBOARDING$HELLO_TITLE)}
              type="text"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  launchConversation();
                }
              }}
              placeholder={defaultMessage}
              disabled={isLaunching}
              className="min-h-[20px] w-full flex-1 bg-transparent text-[16px] font-normal leading-[20px] text-white outline-none placeholder:text-[var(--oh-text-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
        <div className="flex w-full min-w-0 items-center justify-end gap-2">
          <ChatSendButton
            buttonClassName=""
            handleSubmit={launchConversation}
            disabled={!canSubmit}
          />
        </div>
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
          testId="onboarding-hello-close"
          type="button"
          variant="secondary"
          onClick={onClose}
          isDisabled={isLaunching}
        >
          {t(I18nKey.BUTTON$CLOSE)}
        </BrandButton>
      </div>
    </div>
  );
}
