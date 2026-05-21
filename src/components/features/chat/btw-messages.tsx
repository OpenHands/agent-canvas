import { useTranslation } from "react-i18next";
import CheckCircle from "#/icons/check-circle-solid.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { useBtwStore } from "#/stores/btw-store";
import { GenericEventMessage } from "./generic-event-message";

function GotItButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("openhands");
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-success bg-success/10 hover:bg-success/20 border border-success/30 transition-colors"
    >
      <CheckCircle className="w-3.5 h-3.5 fill-success" />
      <span>{t(I18nKey.CHAT_INTERFACE$BTW_GOT_IT)}</span>
    </button>
  );
}

export interface BtwMessagesProps {
  conversationId: string | null | undefined;
}

export function BtwMessages({ conversationId }: BtwMessagesProps) {
  const { t } = useTranslation("openhands");
  const entriesById = useBtwStore((s) => s.entriesByConversation);
  const dismiss = useBtwStore((s) => s.dismiss);
  const entries = conversationId ? (entriesById[conversationId] ?? []) : [];

  if (!conversationId || entries.length === 0) return null;

  return (
    <div data-testid="btw-messages" className="flex flex-col w-full">
      {entries.map((entry) => {
        const isPending = entry.status === "pending";
        return (
          <GenericEventMessage
            key={entry.id}
            title={
              <span className="flex items-center gap-2">
                <span className="opacity-60">
                  {t(I18nKey.CHAT_INTERFACE$BTW_PREFIX)}
                </span>
                <span>{entry.question}</span>
                {isPending && (
                  <span
                    data-testid="btw-spinner"
                    className="inline-block w-3.5 h-3.5 ml-2 rounded-full border-2 border-[var(--oh-border-input)] border-t-transparent animate-spin"
                  />
                )}
              </span>
            }
            details={
              isPending
                ? t(I18nKey.CHAT_INTERFACE$BTW_WAITING_FOR_ANSWER)
                : (entry.response ?? "")
            }
            initiallyExpanded={!isPending}
            chevronPosition="before"
            titleTrailing={
              !isPending && (
                <GotItButton
                  onClick={() => dismiss(conversationId, entry.id)}
                />
              )
            }
          />
        );
      })}
    </div>
  );
}
