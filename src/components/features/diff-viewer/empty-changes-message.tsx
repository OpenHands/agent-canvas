import { useTranslation } from "react-i18next";
import { FaCodeCompare } from "react-icons/fa6";
import { I18nKey } from "#/i18n/declaration";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";

export function EmptyChangesMessage() {
  const { t } = useTranslation("openhands");

  return (
    <ConversationTabEmptyState icon={<FaCodeCompare />}>
      {t(I18nKey.DIFF_VIEWER$NO_CHANGES)}
    </ConversationTabEmptyState>
  );
}
