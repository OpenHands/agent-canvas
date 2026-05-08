import React from "react";
import { useTranslation } from "react-i18next";
import { useMatch, useNavigate } from "react-router";
import { Dropdown } from "#/ui/dropdown/dropdown";
import { DropdownOption } from "#/ui/dropdown/types";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { useAllCloudOrganizations } from "#/hooks/query/use-cloud-organizations";
import { useCloudCurrentUserId } from "#/hooks/query/use-cloud-current-user-id";
import { useSwitchCloudOrganization } from "#/hooks/mutation/use-switch-cloud-organization";
import { I18nKey } from "#/i18n/declaration";
import type { Backend } from "#/api/backend-registry/types";
import {
  ENVIRONMENT_SWITCH_SETACTIVE_DELAY_MS,
  triggerEnvironmentSwitch,
} from "#/components/features/backends/environment-switch-overlay";

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

export function BackendSelector() {
  const { t } = useTranslation("openhands");
  const { backends, bundledBackend, active, setActive } =
    useActiveBackendContext();
  const cloudOrgs = useAllCloudOrganizations();
  const currentUserIds = useCloudCurrentUserId();
  const { mutateAsync: switchOrg, isPending: isSwitching } =
    useSwitchCloudOrganization();
  const navigate = useNavigate();
  const conversationMatch = useMatch("/conversations/:conversationId");
  const automationDetailMatch = useMatch("/automations/:automationId");

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

  return (
    <Dropdown
      testId="backend-selector"
      key={`${activeValue}-${activeOption?.label ?? ""}`}
      defaultValue={activeOption ?? { value: activeValue, label: bundledLabel }}
      onChange={async (item) => {
        if (!item || item.value === activeValue) return;
        const { backendId, orgId } = parseOptionValue(item.value);
        const target = backends.find((b) => b.id === backendId);

        // Show the environment-switch overlay immediately so the user
        // gets feedback before any /switch network call. The overlay
        // auto-dismisses on its own 980ms timer regardless of whether
        // the switch succeeds or fails.
        triggerEnvironmentSwitch(item.label);

        // Hold the active swap for ~400ms — placing it in the middle
        // of the content-fade-to-black window so React Query refetches
        // happen while the layout is invisible behind the overlay,
        // rather than thrashing visibly before the fade.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, ENVIRONMENT_SWITCH_SETACTIVE_DELAY_MS);
        });

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

        // The current conversation/automation belongs to the previous
        // backend and is no longer reachable under the new one — redirect
        // BEFORE flipping the active selection so the route change and
        // backend change land in the same render batch. Otherwise the
        // detail page re-renders once with the new backend (its query
        // key includes `active.backend.id`) and react-query fires a
        // fetch for the previous backend's id against the new backend.
        if (conversationMatch) navigate("/");
        else if (automationDetailMatch) navigate("/automations");

        // Pure backend swap (local-↔-bundled or backend-only cloud
        // selection without an org) skips `/switch` and updates active
        // directly; cloud-with-org falls through here after `/switch`.
        setActive(backendId, orgId);
      }}
      placeholder={bundledLabel}
      loading={someCloudLoading || isSwitching}
      options={options}
      className="bg-[#1F1F1F66] border-[#242424]"
    />
  );
}
