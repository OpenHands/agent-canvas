import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useUnifiedVSCodeUrl } from "#/hooks/query/use-unified-vscode-url";
import { useAgentState } from "#/hooks/use-agent-state";
import { RUNTIME_STARTING_STATES } from "#/types/agent-state";
import { VSCODE_IN_NEW_TAB } from "#/utils/feature-flags";
import { WaitingForRuntimeMessage } from "#/components/features/chat/waiting-for-runtime-message";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";
import { BrandButton } from "#/components/features/settings/brand-button";
import VSCodeIcon from "#/icons/vscode.svg?react";

function VSCodeTab() {
  const { t } = useTranslation("openhands");
  const { data, isLoading, error } = useUnifiedVSCodeUrl();
  const { curAgentState } = useAgentState();
  const isRuntimeStarting = RUNTIME_STARTING_STATES.includes(curAgentState);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [isCrossProtocol, setIsCrossProtocol] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.url) {
      try {
        const iframeProtocol = new URL(data.url).protocol;
        const currentProtocol = window.location.protocol;

        // Check if the iframe URL has a different protocol than the current page
        setIsCrossProtocol(
          VSCODE_IN_NEW_TAB() || iframeProtocol !== currentProtocol,
        );
      } catch (e) {
        // Silently handle URL parsing errors
        setIframeError(t("VSCODE$URL_PARSE_ERROR"));
      }
    }
  }, [data?.url]);

  const handleOpenInNewTab = () => {
    if (data?.url) {
      window.open(data.url, "_blank", "noopener,noreferrer");
    }
  };

  if (isRuntimeStarting) {
    return <WaitingForRuntimeMessage />;
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center text-center justify-center text-2xl text-tertiary-light">
        {t(I18nKey.VSCODE$LOADING)}
      </div>
    );
  }

  if (error || data?.error || !data?.url || iframeError) {
    return (
      <div className="w-full h-full flex items-center text-center justify-center text-2xl text-tertiary-light">
        {iframeError ||
          data?.error ||
          String(error) ||
          t(I18nKey.VSCODE$URL_NOT_AVAILABLE)}
      </div>
    );
  }

  // If cross-origin, show a button to open in new tab
  if (isCrossProtocol) {
    return (
      <ConversationTabEmptyState
        icon={<VSCodeIcon />}
        action={
          <BrandButton
            type="button"
            variant="secondary"
            onClick={handleOpenInNewTab}
            className="min-w-40 justify-center px-6"
          >
            {t("VSCODE$OPEN_IN_NEW_TAB")}
          </BrandButton>
        }
      >
        {t("VSCODE$CROSS_ORIGIN_WARNING")}
      </ConversationTabEmptyState>
    );
  }

  // If same origin, use the iframe
  return (
    <div className="h-full w-full">
      <iframe
        ref={iframeRef}
        title={t(I18nKey.VSCODE$TITLE)}
        src={data.url}
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

// Export the VSCodeTab directly since we're using the provider at a higher level
export default VSCodeTab;
