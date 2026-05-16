import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import CloseIcon from "#/icons/close.svg?react";
import { cn } from "#/utils/utils";
import type {
  CatalogCategoryId,
  CatalogItemData,
} from "#/components/features/automations/suggested-automation-catalog-data";
import { SUGGESTED_AUTOMATION_CATALOG } from "#/components/features/automations/suggested-automation-catalog-data";

export type CatalogFilterId = "all" | CatalogCategoryId;

interface SuggestedAutomationsCatalogModalProps {
  onClose: () => void;
  suggestedCardClass: string;
}

function CatalogItemCard({
  item,
  suggestedCardClass,
}: {
  item: CatalogItemData;
  suggestedCardClass: string;
}) {
  const { t } = useTranslation("openhands");
  const Icon = item.icon;

  return (
    <div
      className={suggestedCardClass}
      role="group"
      aria-label={t(item.titleKey)}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tertiary text-muted"
        >
          <Icon className="size-5" strokeWidth={2} aria-hidden />
        </span>
        <span className="text-sm font-medium text-content">
          {t(item.titleKey)}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">{t(item.descriptionKey)}</p>
    </div>
  );
}

export function SuggestedAutomationsCatalogModal({
  onClose,
  suggestedCardClass,
}: SuggestedAutomationsCatalogModalProps) {
  const { t } = useTranslation("openhands");
  const [filter, setFilter] = useState<CatalogFilterId>("all");

  const navButtonClass = (isActive: boolean) =>
    cn(
      "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
      isActive
        ? "bg-surface-raised font-medium text-content"
        : "text-muted hover:bg-base-tertiary/50 hover:text-content-2",
    );

  return (
    <ModalBackdrop
      onClose={onClose}
      aria-label={t(I18nKey.AUTOMATIONS$SUGGESTED_CATALOG_MODAL_TITLE)}
    >
      <div
        data-testid="suggested-automations-catalog-modal"
        className="my-4 flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[min(960px,94vw)] flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--oh-border)] py-3 pl-5 pr-3">
          <span className="text-sm font-semibold text-content">
            {t(I18nKey.AUTOMATIONS$SUGGESTED_CATALOG_MODAL_TITLE)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(I18nKey.BUTTON$CLOSE)}
            className="cursor-pointer rounded-lg bg-surface-raised p-1.5 text-muted transition-colors [&_path]:fill-current hover:bg-[var(--oh-interactive-hover)] hover:text-white"
          >
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label={t(I18nKey.AUTOMATIONS$SUGGESTED_CATALOG_NAV_LABEL)}
            className="w-52 shrink-0 overflow-y-auto border-r border-[var(--oh-border)] p-3 custom-scrollbar-always"
          >
            <ul className="flex flex-col gap-0.5">
              <li>
                <button
                  type="button"
                  className={navButtonClass(filter === "all")}
                  onClick={() => setFilter("all")}
                  aria-current={filter === "all" ? "page" : undefined}
                >
                  {t(I18nKey.AUTOMATIONS$SUGGESTED_CATALOG_FILTER_ALL)}
                </button>
              </li>
              {SUGGESTED_AUTOMATION_CATALOG.map((cat) => (
                <li key={cat.id}>
                  <button
                    type="button"
                    className={navButtonClass(filter === cat.id)}
                    onClick={() => setFilter(cat.id)}
                    aria-current={filter === cat.id ? "page" : undefined}
                  >
                    {t(cat.titleKey)}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div
            className="bg-background flex min-h-0 flex-1 flex-col overflow-y-auto p-5 custom-scrollbar-always"
            data-testid="suggested-automations-catalog-body"
          >
            {filter !== "all" ? (
              <h3 className="mb-3 text-left text-sm font-normal text-white">
                {t(
                  SUGGESTED_AUTOMATION_CATALOG.find((c) => c.id === filter)!
                    .titleKey,
                )}
              </h3>
            ) : null}

            {filter === "all" ? (
              <div className="flex flex-col gap-8">
                {SUGGESTED_AUTOMATION_CATALOG.map((category) => (
                  <section
                    key={category.id}
                    aria-labelledby={`cat-${category.id}`}
                  >
                    <h3
                      id={`cat-${category.id}`}
                      className="mb-3 text-left text-sm font-normal text-white"
                    >
                      {t(category.titleKey)}
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {category.items.map((item) => (
                        <CatalogItemCard
                          key={String(item.titleKey)}
                          item={item}
                          suggestedCardClass={suggestedCardClass}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {SUGGESTED_AUTOMATION_CATALOG.filter((c) => c.id === filter)
                  .flatMap((c) => c.items)
                  .map((item) => (
                    <CatalogItemCard
                      key={String(item.titleKey)}
                      item={item}
                      suggestedCardClass={suggestedCardClass}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}
