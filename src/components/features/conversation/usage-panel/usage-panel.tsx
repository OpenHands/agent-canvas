import { Gauge } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";
import { useLiveConversationMetrics } from "#/hooks/use-live-conversation-metrics";
import { CostSection } from "../metrics-modal/cost-section";
import { UsageSection } from "../metrics-modal/usage-section";
import { CompactContextButton } from "./compact-context-button";
import { ContextMeter, getContextFillPercent } from "./context-meter";
import { ProviderBalanceCard } from "./provider-balance-card";

/**
 * "Usage" right-panel tab: context-fill meter with a manual "Compact
 * context" action, accumulated token/cost stats, and the provider credit
 * balance (when the agent server reports one).
 *
 * Metrics come from {@link useLiveConversationMetrics}: live WebSocket
 * updates plus a 30s REST poll while the tab is mounted.
 */
export function UsagePanel() {
  const { t } = useTranslation("openhands");
  const metrics = useLiveConversationMetrics();

  const { usage } = metrics;
  const hasMetrics = metrics.cost !== null || usage !== null;

  if (!hasMetrics) {
    return (
      <ConversationTabEmptyState icon={<Gauge />}>
        {t(I18nKey.CONVERSATION$NO_METRICS)}
      </ConversationTabEmptyState>
    );
  }

  return (
    <main
      data-testid="usage-panel"
      className="h-full overflow-y-auto custom-scrollbar-always flex flex-col gap-3 p-3"
    >
      {usage !== null && (
        <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
          <div className="grid gap-3">
            <ContextMeter
              perTurnToken={usage.per_turn_token}
              contextWindow={usage.context_window}
            />
            <CompactContextButton
              fillPercent={getContextFillPercent(
                usage.per_turn_token,
                usage.context_window,
              )}
            />
          </div>
        </div>
      )}

      <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
        <div className="grid gap-3">
          <CostSection
            cost={metrics.cost}
            maxBudgetPerTask={metrics.max_budget_per_task}
          />
          {usage !== null && <UsageSection usage={usage} />}
        </div>
      </div>

      <ProviderBalanceCard />
    </main>
  );
}
