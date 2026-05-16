import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  ClipboardCheck,
  Cpu,
  Crosshair,
  GitBranch,
  Inbox,
  Landmark,
  Package,
  ScrollText,
  ShieldAlert,
  Target,
  Zap,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";

export type CatalogCategoryId =
  | "code_quality"
  | "optimization"
  | "maintenance"
  | "reporting";

export interface CatalogItemData {
  icon: LucideIcon;
  titleKey: I18nKey;
  descriptionKey: I18nKey;
}

export interface CatalogCategoryData {
  id: CatalogCategoryId;
  titleKey: I18nKey;
  items: CatalogItemData[];
}

export const SUGGESTED_AUTOMATION_CATALOG: CatalogCategoryData[] = [
  {
    id: "code_quality",
    titleKey: I18nKey.AUTOMATIONS$SUGGESTED_CAT_CODE_QUALITY,
    items: [
      {
        icon: ClipboardCheck,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_QA_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_QA_DESC,
      },
      {
        icon: ShieldAlert,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_VULN_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_VULN_DESC,
      },
      {
        icon: Landmark,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_ARCH_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_ARCH_DESC,
      },
      {
        icon: Crosshair,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_PENTEST_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_PENTEST_DESC,
      },
    ],
  },
  {
    id: "optimization",
    titleKey: I18nKey.AUTOMATIONS$SUGGESTED_CAT_OPTIMIZATION,
    items: [
      {
        icon: Cpu,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_CPU_MEM_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_CPU_MEM_DESC,
      },
      {
        icon: ScrollText,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_LOG_CLEANUP_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_LOG_CLEANUP_DESC,
      },
    ],
  },
  {
    id: "maintenance",
    titleKey: I18nKey.AUTOMATIONS$SUGGESTED_CAT_MAINTENANCE,
    items: [
      {
        icon: Package,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_DEPS_UPDATES_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_DEPS_UPDATES_DESC,
      },
      {
        icon: Target,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_TEST_COV_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_TEST_COV_DESC,
      },
      {
        icon: Zap,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_TEST_OPT_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_TEST_OPT_DESC,
      },
    ],
  },
  {
    id: "reporting",
    titleKey: I18nKey.AUTOMATIONS$SUGGESTED_CAT_REPORTING,
    items: [
      {
        icon: GitBranch,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_CHANGE_SUMMARY_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_CHANGE_SUMMARY_DESC,
      },
      {
        icon: Inbox,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_ISSUES_SUMMARY_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_ISSUES_SUMMARY_DESC,
      },
      {
        icon: CalendarClock,
        titleKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_STANDUP_TITLE,
        descriptionKey: I18nKey.AUTOMATIONS$SUGGESTED_MORE_STANDUP_DESC,
      },
    ],
  },
];
