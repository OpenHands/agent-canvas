import React from "react";
import { useTranslation } from "react-i18next";
import { useMatch, useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { Dropdown } from "#/ui/dropdown/dropdown";
import { DropdownOption } from "#/ui/dropdown/types";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useAllCloudOrganizations } from "#/hooks/query/use-cloud-organizations";
import { useCloudCurrentUserId } from "#/hooks/query/use-cloud-current-user-id";
import { useSwitchCloudOrganization } from "#/hooks/mutation/use-switch-cloud-organization";
import { I18nKey } from "#/i18n/declaration";
import type { Backend } from "#/api/backend-registry/types";
import { AddBackendModal } from "./add-backend-modal";

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
  bundled: Backend,
  registered: Backend[],
  bundledLabel: string,
  personalWorkspaceLabel: string,
  cloudOrgs: ReturnType<typeof useAllCloudOrganizations>,
  currentUserIds: ReturnType<typeof useCloudCurrentUserId>,
): DropdownOption[] {
  const options: DropdownOption[] = [
    { value: makeOptionValue(bundled.id, null), label: bundledLabel },
  ];

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

export function BackendSelector({ openUpward = false }: BackendSelectorProps = {}) {
  const { t } = useTranslation("openhands");
  const { backends, bundledBackend, active, setActive } =
    useActiveBackendContext();
  const cloudOrgs = useAllCloudOrganizations();
  const currentUserIds = useCloudCurrentUserId();
  const { mutateAsync: switchOrg, isPending: isSwitching } =
    useSwitchCloudOrganization();
  const navigate = useNavigate();
  const conversationMatch = useMatch("/conversations/:conversationId");
  const [addBackendModalOpen, setAddBackendModalOpen] = React.useState(false);

  const bundledLabel = t(I18nKey.BACKEND$LOCAL_ROW);
  const personalWorkspaceLabel = t(I18nKey.BACKEND$PERSONAL_WORKSPACE);

  const options = React.useMemo(
    () =>
      buildOptions(
        bundledBackend,
        backends,
        bundledLabel,
        personalWorkspaceLabel,
        cloudOrgs,
        currentUserIds,
      ),
    [
      bundledBackend,
      backends,
      bundledLabel,
      personalWorkspaceLabel,
      cloudOrgs,
      currentUserIds,
    ],
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
    if (active.backend.kind !== "cloud" || active.orgId) return;
    const { backend } = active;
    const entry = cloudOrgs[backend.id];
    if (!entry || entry.orgs.length === 0) return;
    const userId = currentUserIds[backend.id]?.userId ?? null;
    const personal = userId
      ? entry.orgs.find((o) => o.id === userId)
      : undefined;
    const target = personal ?? entry.orgs[0];
    if (!target) return;
    switchOrg({ orgId: target.id, backend })
      .then(() => setActive(backend.id, target.id))
      .catch(() => {
        // Error is surfaced by the mutation cache's global handler.
      });
  }, [active, cloudOrgs, currentUserIds, setActive, switchOrg]);

  const addBackendFooter = (
    <button
      type="button"
      data-testid="add-backend-menu-item"
      onClick={() => setAddBackendModalOpen(true)}
      className="flex w-full items-center gap-2 px-2 py-2 rounded-md text-sm cursor-pointer text-white hover:bg-[#5C5D62]"
    >
      <Plus width={16} height={16} className="text-white shrink-0" />
      {t(I18nKey.BACKEND$ADD)}
    </button>
  );

  return (
    <>
    <Dropdown
      testId="backend-selector"
      key={`${activeValue}-${activeOption?.label ?? ""}`}
      defaultValue={activeOption ?? { value: activeValue, label: bundledLabel }}
      footer={addBackendFooter}
      openUpward={openUpward}
      onChange={async (item) => {
        if (!item || item.value === activeValue) return;
        const { backendId, orgId } = parseOptionValue(item.value);
        const target = backends.find((b) => b.id === backendId);

        // Cloud + org pick: fire `/switch` FIRST against the explicit
        // target backend, then update the active selection after it
        // resolves. This ensures the SaaS-side `current_org_id` is
        // already in place before any of our backend-keyed queries
        // refetch — they fire exactly once, with the correct context.
        //
        // We use `mutateAsync` + `await` (rather than `mutate(... ,
        // { onSuccess })`) because per-call onSuccess callbacks were
        // observed not to run reliably for this hook in practice; the
        // promise-based shape is unambiguous.
        if (orgId && target?.kind === "cloud") {
          try {
            await switchOrg({ orgId, backend: target });
          } catch {
            // Error is surfaced by the mutation cache's global handler.
            return;
          }
        }

        // Pure backend swap (local-↔-bundled or backend-only cloud
        // selection without an org) skips `/switch` and updates active
        // directly; cloud-with-org falls through here after `/switch`.
        setActive(backendId, orgId);

        // The current conversation belongs to the previous backend
        // and is no longer reachable under the new one — redirect home
        // so the user lands on a coherent screen.
        if (conversationMatch) navigate("/conversations");
      }}
      placeholder={bundledLabel}
      loading={someCloudLoading || isSwitching}
      options={options}
      className="bg-[#1F1F1F66] border-[#242424]"
    />
    {addBackendModalOpen ? (
      <AddBackendModal onClose={() => setAddBackendModalOpen(false)} />
    ) : null}
    </>
  );
}
