import React from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { useMatch, useNavigate } from "react-router";
import { Plus, Settings } from "lucide-react";
import { Dropdown } from "#/ui/dropdown/dropdown";
import { DropdownOption } from "#/ui/dropdown/types";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useAllCloudOrganizations } from "#/hooks/query/use-cloud-organizations";
import { useCloudCurrentUserId } from "#/hooks/query/use-cloud-current-user-id";
import { useSwitchCloudOrganization } from "#/hooks/mutation/use-switch-cloud-organization";
import { I18nKey } from "#/i18n/declaration";
import type { Backend } from "#/api/backend-registry/types";
import {
  dismissEnvironmentSwitch,
  ENVIRONMENT_SWITCH_SETACTIVE_DELAY_MS,
  triggerEnvironmentSwitch,
} from "#/components/features/backends/environment-switch-overlay";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { AddBackendModal } from "./add-backend-modal";
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

function buildOptions(
  registered: Backend[],
  personalWorkspaceLabel: string,
  cloudOrgs: ReturnType<typeof useAllCloudOrganizations>,
  currentUserIds: ReturnType<typeof useCloudCurrentUserId>,
): DropdownOption[] {
  const options: DropdownOption[] = [];

  const locals = registered.filter((b) => b.kind === "local");
  const clouds = registered.filter((b) => b.kind === "cloud");

  for (const b of locals) {
    options.push({ value: makeOptionValue(b.id, null), label: b.name });
  }

  for (const b of clouds) {
    const entry = cloudOrgs[b.id];
    if (!entry || entry.orgs.length === 0) {
      options.push({ value: makeOptionValue(b.id, null), label: b.name });
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
        });
      }
    }
  }

  return options;
}

interface BackendSelectorProps {
  /** Render the menu above the trigger (e.g. when pinned to bottom of sidebar). */
  openUpward?: boolean;
}

export function BackendSelector({
  openUpward = false,
}: BackendSelectorProps = {}) {
  const { t } = useTranslation("openhands");
  const { backends, active, setActive } = useActiveBackendContext();
  const cloudOrgs = useAllCloudOrganizations();
  const currentUserIds = useCloudCurrentUserId();
  const { mutateAsync: switchOrg, isPending: isSwitching } =
    useSwitchCloudOrganization();
  const navigate = useNavigate();
  const conversationMatch = useMatch("/conversations/:conversationId");
  const automationDetailMatch = useMatch("/automations/:automationId");
  const [addBackendModalOpen, setAddBackendModalOpen] = React.useState(false);
  const [manageBackendsModalOpen, setManageBackendsModalOpen] =
    React.useState(false);

  const personalWorkspaceLabel = t(I18nKey.BACKEND$PERSONAL_WORKSPACE);

  const firstLocalBackendId = React.useMemo(
    () => backends.find((b) => b.kind === "local")?.id ?? null,
    [backends],
  );

  const options = React.useMemo(
    () =>
      buildOptions(backends, personalWorkspaceLabel, cloudOrgs, currentUserIds),
    [backends, personalWorkspaceLabel, cloudOrgs, currentUserIds],
  );

  const activeValue = makeOptionValue(active.backend.id, active.orgId);
  const activeOption = options.find((o) => o.value === activeValue);

  const someCloudLoading = Object.values(cloudOrgs).some((c) => c.isLoading);

  // Self-heal a malformed `(cloudBackendId, null)` selection.
  //
  // Once a cloud backend's orgs resolve, the dropdown only renders
  // per-org rows for it — the `(backendId, null)` row disappears, so
  // selecting that shape would drift from what the dropdown can render
  // (UI says "Local", APIs hit cloud). When we detect the drift, snap
  // the selection onto the personal-workspace org (or, lacking a /me
  // result, the first org). Pre-switch the SaaS-side current_org BEFORE
  // touching active state so queries refetch (via key change) only
  // once and against the correct org context.
  React.useEffect(() => {
    let cancelled = false;

    if (active.backend.kind === "cloud" && !active.orgId) {
      const { backend } = active;
      const entry = cloudOrgs[backend.id];

      if (entry && entry.orgs.length > 0) {
        const userId = currentUserIds[backend.id]?.userId ?? null;
        const personal = userId
          ? entry.orgs.find((o) => o.id === userId)
          : undefined;
        const target = personal ?? entry.orgs[0];

        if (target) {
          const syncActiveOrg = async () => {
            try {
              await switchOrg({ orgId: target.id, backend });
              if (!cancelled) {
                setActive(backend.id, target.id);
              }
            } catch {
              if (!cancelled && firstLocalBackendId) {
                setActive(firstLocalBackendId, null);
              }
            }
          };

          syncActiveOrg();
        }
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    active,
    firstLocalBackendId,
    cloudOrgs,
    currentUserIds,
    setActive,
    switchOrg,
  ]);

  const openAddBackendModal = React.useCallback(() => {
    setAddBackendModalOpen(true);
  }, []);

  const openManageBackendsModal = React.useCallback(() => {
    setManageBackendsModalOpen(true);
  }, []);

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

  return (
    <>
      <Dropdown
        testId="backend-selector"
        key={`${activeValue}-${activeOption?.label ?? ""}`}
        defaultValue={
          activeOption ?? { value: activeValue, label: active.backend.name }
        }
        footer={addBackendFooter}
        openUpward={openUpward}
        onChange={async (item) => {
          if (!item || item.value === activeValue) return;
          const { backendId, orgId } = parseOptionValue(item.value);
          const target = backends.find((b) => b.id === backendId);
          if (!target) return;

          triggerEnvironmentSwitch(item.label);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, ENVIRONMENT_SWITCH_SETACTIVE_DELAY_MS);
          });

          if (orgId && target.kind === "cloud") {
            try {
              await switchOrg({ orgId, backend: target });
            } catch (error) {
              dismissEnvironmentSwitch();

              if (!axios.isAxiosError(error)) {
                console.error("Unexpected error during org switch:", error);
                displayErrorToast(t(I18nKey.ERROR$GENERIC));
                return;
              }

              displayErrorToast(
                retrieveAxiosErrorMessage(error) || t(I18nKey.ERROR$GENERIC),
              );
              return;
            }
          }

          if (conversationMatch) navigate("/conversations");
          else if (automationDetailMatch) navigate("/automations");

          setActive(target.id, orgId);
        }}
        placeholder={active.backend.name}
        loading={someCloudLoading || isSwitching}
        options={options}
        className="bg-[#1F1F1F66] border-[#242424]"
      />
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
