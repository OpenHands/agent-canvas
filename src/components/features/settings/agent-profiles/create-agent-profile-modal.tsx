import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ApiKeyModalBase } from "#/components/features/settings/api-key-modal-base";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import type { AgentKind } from "./editor/use-agent-profile-form";

interface CreateAgentProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (kind: AgentKind) => void;
}

interface KindOption {
  kind: AgentKind;
  titleKey: I18nKey;
  descKey: I18nKey;
}

const KIND_OPTIONS: KindOption[] = [
  {
    kind: "openhands",
    titleKey: I18nKey.SETTINGS$AGENT_TYPE_OPENHANDS,
    descKey: I18nKey.SETTINGS$AGENT_TYPE_OPENHANDS_DESC,
  },
  {
    kind: "acp",
    titleKey: I18nKey.SETTINGS$AGENT_TYPE_ACP,
    descKey: I18nKey.SETTINGS$AGENT_TYPE_ACP_DESC,
  },
];

/**
 * Minimal kind picker shown on "+ New agent". The chosen kind is fixed for the
 * profile's life (switching = Duplicate-as / New), so it's decided up front
 * before the editor opens with that kind's sections and built-in defaults.
 */
export function CreateAgentProfileModal({
  isOpen,
  onClose,
  onSelect,
}: CreateAgentProfileModalProps) {
  const { t } = useTranslation("openhands");
  const cancelRef = useRef<HTMLButtonElement>(null);

  if (!isOpen) return null;

  const footer = (
    <BrandButton
      ref={cancelRef}
      testId="create-agent-cancel"
      type="button"
      variant="tertiary"
      onClick={onClose}
    >
      {t(I18nKey.BUTTON$CANCEL)}
    </BrandButton>
  );

  return (
    <ApiKeyModalBase
      isOpen
      title={t(I18nKey.SETTINGS$CREATE_AGENT_TITLE)}
      footer={footer}
      onClose={onClose}
      initialFocusRef={cancelRef}
    >
      <Typography.Text className="text-sm text-[#A3A3A3]">
        {t(I18nKey.SETTINGS$CREATE_AGENT_SUBTITLE)}
      </Typography.Text>
      <div className="flex flex-col gap-3">
        {KIND_OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            data-testid={`create-agent-kind-${opt.kind}`}
            onClick={() => onSelect(opt.kind)}
            className="flex flex-col gap-1 rounded-lg border border-[#3D4046] bg-tertiary/40 p-4 text-left transition-colors hover:border-primary hover:bg-tertiary"
          >
            <Typography.Text className="text-sm font-medium text-white">
              {t(opt.titleKey)}
            </Typography.Text>
            <Typography.Text className="text-xs text-[#A3A3A3]">
              {t(opt.descKey)}
            </Typography.Text>
          </button>
        ))}
      </div>
    </ApiKeyModalBase>
  );
}
