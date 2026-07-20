import { MetricsModalHeader } from "./metrics-modal-header";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { CostSection } from "./cost-section";
import { UsageSection } from "./usage-section";
import { ContextWindowSection } from "./context-window-section";
import { EmptyState } from "./empty-state";
import { useLiveConversationMetrics } from "#/hooks/use-live-conversation-metrics";

interface MetricsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MetricsModal({ isOpen, onOpenChange }: MetricsModalProps) {
  const metrics = useLiveConversationMetrics(isOpen);

  if (!isOpen) return null;

  return (
    <ModalBackdrop onClose={() => onOpenChange(false)}>
      <ModalBody
        testID="metrics-modal"
        className="relative items-start border border-[var(--oh-border)]"
      >
        <MetricsModalHeader onClose={() => onOpenChange(false)} />
        <div className="w-full">
          {(metrics.cost !== null || metrics.usage !== null) && (
            <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
              <div className="grid gap-3">
                <CostSection
                  cost={metrics.cost}
                  maxBudgetPerTask={metrics.max_budget_per_task}
                />

                {metrics.usage !== null && (
                  <>
                    <UsageSection usage={metrics.usage} />
                    <ContextWindowSection
                      perTurnToken={metrics.usage.per_turn_token}
                      contextWindow={metrics.usage.context_window}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {!metrics.cost && !metrics.usage && (
            <div className="rounded-md border border-[var(--oh-border)] bg-surface-raised p-3">
              <EmptyState />
            </div>
          )}
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}
