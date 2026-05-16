import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCopy, FiCheck } from "react-icons/fi";
import { I18nKey } from "#/i18n/declaration";

export function VSCodeNotConfigured() {
  const { t } = useTranslation("openhands");
  const [copied, setCopied] = useState(false);

  const setupPrompt = t(I18nKey.VSCODE$SETUP_PROMPT);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(setupPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API is not available
    }
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-6 px-4"
      data-testid="vscode-not-configured"
    >
      <div className="flex flex-col items-center gap-3 max-w-lg text-center">
        <h2 className="text-xl font-semibold text-white">
          {t(I18nKey.VSCODE$NOT_CONFIGURED_TITLE)}
        </h2>
        <p className="text-sm text-tertiary-light">
          {t(I18nKey.VSCODE$NOT_CONFIGURED_MESSAGE)}
        </p>
      </div>

      <div className="relative w-full max-w-lg">
        <pre className="bg-[#1e1e2e] border border-[#363646] rounded-lg p-4 pr-12 text-sm text-[#cdd6f4] whitespace-pre-wrap break-words">
          {setupPrompt}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-3 right-3 p-1.5 rounded-md text-[#9299AA] hover:text-white hover:bg-[#363646] transition-colors cursor-pointer"
          aria-label={t(I18nKey.VSCODE$COPY_PROMPT)}
          title={
            copied
              ? t(I18nKey.VSCODE$COPIED_TO_CLIPBOARD)
              : t(I18nKey.VSCODE$COPY_PROMPT)
          }
        >
          {copied ? (
            <FiCheck className="w-4 h-4 text-green-400" />
          ) : (
            <FiCopy className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
