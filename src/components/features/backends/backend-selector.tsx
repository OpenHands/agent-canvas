import React from "react";
import { useTranslation } from "react-i18next";
import { useMatch, useNavigate } from "react-router";
import { Plus, Settings } from "lucide-react";
import { Dropdown } from "#/ui/dropdown/dropdown";
import { DropdownOption } from "#/ui/dropdown/types";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useAllCloudOrganizations } from "#/hooks/query/use-cloud-organizations";
import { useCloudCurrentUserId } from "#/hooks/query/use-cloud-current-user-id";
import {
  useBackendsHealth,
  type BackendHealth,
} from "#/hooks/query/use-backends-health";
import { I18nKey } from "#/i18n/declaration";
import type { Backend } from "#/api/backend-registry/types";
// Import the trigger helpers from the lightweight store, not the overlay
// component, so the eagerly-mounted sidebar/backend-selector graph does not
// pull in the overlay's render code (the overlay is lazy-loaded from
// `routes/root-layout.tsx`).
import {
  ENVIRONMENT_SWITCH_SETACTIVE_DELAY_MS,
  triggerEnvironmentSwitch,
} from "#/components/features/backends/environment-switch-store";
import { AddBackendModal } from "./add-backend-modal";
import { BackendStatusDot } from "./backend-status-dot";
import { ManageBackendsModal } from "./manage-backends-modal";

const VALUE_SEPARATOR = "::";

function makeOptionValue(backendId: string, orgId: string | null): string {
  return orgId ? `${backendId}${VALUE_SEPARATOR}${orgId}` : backendId;
}

function parseOptionValue(value: string): {
  backendId: string;
  orgId: string | null;
} {
  const [backendId, orgId] = value.split(VALUE_SEPARATOR);
  return { backendId, orgId: orgId ?? null };
}

function buildStatusPrefix(health: BackendHealth | undefined) {
  return <BackendStatusDot isConnected={health?.isConnected ?? null} />;
}

function buildOptions(
  registered: Backend[],
  personalWorkspaceLabel: string,
  cloudOrgs: ReturnType<typeof useAllCloudOrganizations>,
  currentUserIds: ReturnType<typeof useCloudCurrentUserId>,
  healthByBackendId: Record<string, BackendHealth>,
): DropdownOption[] {
  const options: DropdownOption[] = [];

  const locals = registered.filter((b) => b.kind === "local");
  const clouds = registered.filter((b) => b.kind === "cloud");

  for (const b of locals) {
    options.push({
      value: makeOptionValue(b.id, null),
      label: b.name,
      prefix: buildStatusPrefix(healthByBackendId[b.id]),
    });
  }

  for (const b of clouds) {
    const entry = cloudOrgs[b.id];
    const prefix = buildStatusPrefix(healthByBackendId[b.id]);
    if (!entry || entry.orgs.length === 0) {
      options.push({
        value: makeOptionValue(b.id, null),
        label: b.name,
        prefix,
      });
    } else {
      // Personal-workspace rule (per the SaaS contract): the org whose
      // id matches the calling user's id is the user's personal
      // workspace. We resolve `user_id` once per backend (via /me on any
      // one org) and apply it across all orgs of that backend.
      const userIdForBackend = currentUserIds[b.id]?.userId ?? null;

      for (const org of entry.orgs) {
        const isPersonal = !!userIdForBackend && userIdForBackend === org.id;
        const orgLabel = isPersonal ? personalWorkspaceLabel : org.name;
        options.push({
          value: makeOptionValue(b.id, org.id),
          label: `${b.name} – ${orgLabel}`,
          // All org rows for the same cloud backend share that backend's
          // single connectivity verdict — there is no per-org probe.
          prefix,
        });
      }
    }
  }

  return options;
}

interface BackendSelectorProps {
  /** Render the menu above the trigger (e.g. when pinned to bottom of sidebar). */
  openUpward?: boolean;
  /** Hide the selector input trigger and only render the dropdown menu. */
  hideTrigger?: boolean;
  /** Whether the dropdown menu should start open on mount. */
  defaultOpen?: boolean;
  /** Callback fired after selecting a backend/org option. */
  onSelectOption?: () => void;
  /**
   * Override the internal Add Backend modal handling. When provided,
   * clicking "Add Backend" calls this instead of opening BackendSelector's
   * own modal. Useful when the selector is mounted inside an ephemeral
   * container (e.g. the collapsed-sidebar popover) and the modal must
   * survive the parent unmounting.
   */
  onOpenAddBackend?: () => void;
  /** Same as onOpenAddBackend but for the Manage Backends modal. */
  onOpenManageBackends?: () => void;
}

export function BackendSelector({
  openUpward = false,
  hideTrigger = false,
  defaultOpen = false,
  onSelectOption,
  onOpenAddBackend,
  onOpenManageBackends,
}: BackendSelectorProps = {}) {
  const { t } = useTranslation("openhands");
  const { backends, active, setActive } = useActiveBackendContext();
  const cloudOrgs = useAllCloudOrganizations();
  const currentUserIds = useCloudCurrentUserId();
  // Probe each registered backend every 10s.
  const healthByBackendId = useBackendsHealth(backends);
  const navigate = useNavigate();
  const settingsMatch = useMatch("/settings");
  const settingsSubrouteMatch = useMatch("/settings/*");
  const conversationMatch = useMatch("/conversations/:conversationId");
  const automationDetailMatch = useMatch("/automations/:automationId");
  const [addBackendModalOpen, setAddBackendModalOpen] = React.useState(false);
  const [manageBackendsModalOpen, setManageBackendsModalOpen] =
    React.useState(false);

  const personalWorkspaceLabel = t(I18nKey.BACKEND$PERSONAL_WORKSPACE);

  const options = React.useMemo(
    () =>
      buildOptions(
        backends,
        personalWorkspaceLabel,
        cloudOrgs,
        currentUserIds,
        healthByBackendId,
      ),
    [
      backends,
      personalWorkspaceLabel,
      cloudOrgs,
      currentUserIds,
      healthByBackendId,
    ],
  );

  const activeValue = makeOptionValue(active.backend.id, active.orgId);
  const activeOption = options.find((o) => o.value === activeValue);
  const isSettingsActive = Boolean(settingsMatch || settingsSubrouteMatch);

  const someCloudLoading = Object.values(cloudOrgs).some((c) => c.isLoading);

  // Self-heal a malformed `(cloudBackendId, null)` selection.
  //
  // Once a cloud backend's orgs resolve, the dropdown only renders
  // per-org rows for it — the `(backendId, null)` row disappears, so
  // selecting that shape would drift from what the dropdown can render
  // (UI says "Local", APIs hit cloud). When we detect the drift, snap
  // the selection onto the personal-workspace org (or, lacking a /me
  // result, the first org). The selection is recorded locally only;
  // the SaaS request scope follows from the API key's bound org and the
  // X-Org-Id header sent by `callCloudProxy`, so the cloud UI's
  // org choice is never mutated as a side effect.
  React.useEffect(() => {
    if (active.backend.kind !== "cloud" || active.orgId) return;
    const { backend } = active;
    const entry = cloudOrgs[backend.id];
    if (!entry || entry.orgs.length === 0) return;

    const userId = currentUserIds[backend.id]?.userId ?? null;
    const personal = userId
      ? entry.orgs.find((o) => o.id === userId)
      : undefined;
    const target = personal ?? entry.orgs[0];
    if (target) {
      setActive(backend.id, target.id);
    }
  }, [active, cloudOrgs, currentUserIds, setActive]);

  const openAddBackendModal = React.useCallback(() => {
    if (onOpenAddBackend) {
      onOpenAddBackend();
      onSelectOption?.();
      return;
    }
    setAddBackendModalOpen(true);
  }, [onOpenAddBackend, onSelectOption]);

  const openManageBackendsModal = React.useCallback(() => {
    if (onOpenManageBackends) {
      onOpenManageBackends();
      onSelectOption?.();
      return;
    }
    setManageBackendsModalOpen(true);
  }, [onOpenManageBackends, onSelectOption]);

  const preventDropdownMenuClose = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const addBackendFooter = (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        data-testid="add-backend-menu-item"
        onMouseDown={preventDropdownMenuClose}
        onClick={openAddBackendModal}
        className="flex w-full items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer text-white hover:bg-[#5C5D62]"
      >
        <Plus width={16} height={16} className="text-white shrink-0" />
        {t(I18nKey.BACKEND$ADD)}
      </button>
      <button
        type="button"
        data-testid="manage-backends-menu-item"
        onMouseDown={preventDropdownMenuClose}
        onClick={openManageBackendsModal}
        className="flex w-full items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer text-white hover:bg-[#5C5D62]"
      >
        <Settings width={16} height={16} className="text-white shrink-0" />
        {t(I18nKey.BACKEND$MANAGE)}
      </button>
    </div>
  );

  const handleSelectBackend = React.useCallback(
    async (value: string) => {
      if (value === activeValue) return;

      const { backendId, orgId } = parseOptionValue(value);
      const target = backends.find((b) => b.id === backendId);
      if (!target) return;

      triggerEnvironmentSwitch(
        options.find((option) => option.value === value)?.label ?? target.name,
      );
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ENVIRONMENT_SWITCH_SETACTIVE_DELAY_MS);
      });

      if (conversationMatch) navigate("/conversations");
      else if (automationDetailMatch) navigate("/automations");

      setActive(target.id, orgId);
      onSelectOption?.();
    },
    [
      activeValue,
      backends,
      conversationMatch,
      automationDetailMatch,
      navigate,
      options,
      setActive,
      t,
      onSelectOption,
    ],
  );

  return (
    <>
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 min-w-0">
          <Dropdown
            testId="backend-selector"
            key={`${activeValue}-${activeOption?.label ?? ""}`}
            defaultValue={
              activeOption ?? {
                value: activeValue,
                label: active.backend.name,
                prefix: buildStatusPrefix(healthByBackendId[active.backend.id]),
              }
            }
            footer={addBackendFooter}
            openUpward={openUpward}
            hideTrigger={hideTrigger}
            defaultOpen={defaultOpen}
            openOnHover={!hideTrigger}
            onChange={(item) => {
              if (!item) return;
              void handleSelectBackend(item.value);
            }}
            placeholder={active.backend.name}
            loading={someCloudLoading}
            options={options}
            className="bg-transparent border-transparent hover:bg-[#1f1f1f99] focus-within:bg-[#1f1f1f99]"
          />
        </div>
        {!hideTrigger ? (
          <button
            type="button"
            data-testid="backend-selector-settings-link"
            aria-label={t(I18nKey.SIDEBAR$SETTINGS)}
            onClick={() => navigate("/settings")}
            className={
              isSettingsActive
                ? "inline-flex items-center justify-center shrink-0 w-9 h-9 rounded-md bg-[#1f1f1f99] text-white font-medium transition-colors"
                : "inline-flex items-center justify-center shrink-0 w-9 h-9 rounded-md text-[#8C8C8C] hover:text-white hover:bg-[#1f1f1f99] transition-colors"
            }
          >
            <Settings width={16} height={16} />
          </button>
        ) : null}
      </div>
      {addBackendModalOpen ? (
        <AddBackendModal onClose={() => setAddBackendModalOpen(false)} />
      ) : null}
      {manageBackendsModalOpen ? (
        <ManageBackendsModal
          onClose={() => setManageBackendsModalOpen(false)}
        />
      ) : null}
    </>
  );
}
