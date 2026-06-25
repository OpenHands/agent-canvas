# Work Mode

> **Status:** In progress on branch `feat/work-mode-scaffold`. The Code/Work toggle,
> capability resolver, and placeholder `/work` home exist. Work Runtime, task flows,
> folder grants, and apps are not built yet.

Work mode is a Cowork-style surface for knowledge work on the user's machine (or,
later, in cloud-provisioned volumes). **Code mode** stays the existing agent-canvas
experience: repos, sandboxes, terminal, git.

This document is the source of truth while the feature is being built. Update it
when behavior, routes, or capability rules change.

---

## Code vs Work

| | Code mode | Work mode |
|---|-----------|-----------|
| Primary job | Software development | Desktop knowledge work |
| Workspace | Repo / sandbox path | User-granted folders + deliverables |
| Agent tools | Full dev stack (shell, git, …) | Restricted profile (no shell/git) |
| Home route | `/conversations` | `/work` |
| Runtime (target) | Active backend (local or cloud sandbox) | Work Runtime (`local` or `hosted`) |

Mode preference is stored in the client (`localStorage` key `openhands-app-mode`).
Backend selection is separate: the user can keep a cloud backend active for Code
while Work runs elsewhere when configured (see [Hybrid cloud](#hybrid-cloud-code-on-cloud-work-on-device)).

---

## Mode and backend are orthogonal

```
App mode (Code | Work)     ← what kind of work the user wants
        ×
Active backend (Local | Cloud)  ← where Code conversations run
        ×
Work execution (local | hosted | none)  ← where Work runs when allowed
```

Agent Canvas already uses a similar split today: when cloud is the active backend,
many GUI services still talk to the **local agent-server** via
`getEffectiveLocalBackend()` (`src/api/backend-registry/active-store.ts`), and
cloud API calls go through the local **cloud-proxy** (`src/api/cloud/proxy.ts`).

Work mode extends that idea: **Code follows the active backend; Work follows the
resolved execution target**, not necessarily the same host.

---

## Work execution targets

Defined in `src/types/work-mode-capabilities.ts`:

| Value | Meaning |
|-------|---------|
| `local` | Work Runtime on the user's machine — folder grants, local apps, deliverables on disk |
| `hosted` | Work Runtime in cloud-provisioned volumes (future) |
| `none` | Work mode disabled for this backend/context |

### Why allow cloud Work at all?

Local Work is the v1 wedge (real Finder paths, privacy, no upload). Hosted Work
matters later for:

- Web-only / locked-down laptops (no install)
- Multi-device continuity and org-shared workspaces
- Always-on scheduled Work without the laptop awake
- Enterprise audit, DLP, and data residency on org-owned volumes

Both targets can share the same Work **UI and task model**; only the runtime
host changes.

---

## Capability resolution

Single resolver: `resolveWorkModeCapabilities()` in
`src/utils/app-mode-capabilities.ts`.

**Inputs** (`WorkModeCapabilityContext`):

- `backendKind` — active backend `local` | `cloud`
- `workExecution` — optional per-backend override (`Backend.workExecution`)
- `hasLocalBackend` — whether a registered local backend exists (needed for hybrid)

**Outputs** (`ResolvedWorkModeCapabilities`):

- `execution` — where Work would run
- `allowed` — whether the Work toggle and `/work` routes are usable

### Default policy (v1, no override)

| Active backend | `workExecution` | Registered local backend | Work allowed | Execution |
|----------------|-----------------|--------------------------|--------------|-----------|
| local | *(unset)* | — | yes | `local` |
| cloud | *(unset)* | any | no | `none` |

### Override policy (configure later)

Set `workExecution` on a backend registry entry
(`src/api/backend-registry/types.ts`):

| Active backend | `workExecution` | Registered local backend | Work allowed | Execution |
|----------------|-----------------|--------------------------|--------------|-----------|
| cloud | `local` | yes | yes | `local` (hybrid) |
| cloud | `local` | no | no | `local` |
| cloud | `hosted` | — | yes | `hosted` |
| any | `none` | — | no | `none` |
| local | `none` | — | no | `none` |

There is **no backend form field for `workExecution` yet**. Overrides are for
tests, manual registry edits, or future org/API policy until UI exists.

Example hybrid cloud backend (future):

```json
{
  "id": "cloud-team",
  "name": "Team Cloud",
  "kind": "cloud",
  "host": "https://app.all-hands.dev",
  "apiKey": "...",
  "workExecution": "local"
}
```

---

## Hybrid cloud (Code on cloud, Work on device)

When `workExecution: "local"` is set on a cloud backend **and** a local backend
is registered:

- **Code** conversations, org, billing → cloud (unchanged)
- **Work** tasks → local Work Runtime (folder grants on the device)
- The sidebar toggle can switch Code ↔ Work without switching the active backend
- UI should eventually label both hosts explicitly (e.g. “Code on: Cloud · Work on: This device”)

When Work is not allowed, the app **does not** silently run Work on cloud sandboxes.
Cloud coding sandboxes cannot access the user's desktop folders.

---

## Current UI behavior (scaffold)

### WM-001: Code/Work toggle in sidebar
- [x] Toggle appears in the sidebar header (hidden when collapsed).
- [x] Persists mode in `openhands-app-mode`.
- [x] Logo and `/` redirect use **effective** mode (respects capabilities).

### WM-002: Work disabled when capabilities say so
- [x] Work option disabled with tooltip when `allowed === false`.
- [x] Selecting Work while disallowed is a no-op.

### WM-003: Backend/mode sync
- [x] If persisted mode is `work` but Work becomes disallowed (e.g. switch to
  cloud with default policy), mode falls back to `code`, user sees a toast, and
  navigation leaves `/work`.

### WM-004: Cloud guard on `/work`
- [x] When Work is disallowed, `/work` shows an explanation banner.
- [x] If a local backend is registered, offer **Switch to local backend**; always
  offer **Back to Code**.

### WM-005: Placeholder Work home
- [x] `/work` route renders a scaffold home screen (`src/routes/work-home.tsx`).

---

## Key implementation files

| Area | Path |
|------|------|
| App mode type | `src/types/app-mode.ts` |
| Work execution types | `src/types/work-mode-capabilities.ts` |
| Backend optional override | `src/api/backend-registry/types.ts` → `Backend.workExecution` |
| Capability resolver | `src/utils/app-mode-capabilities.ts` |
| Mode store | `src/stores/app-mode-store.ts` |
| Capability context hook | `src/hooks/use-work-mode-availability.ts` |
| Backend/mode sync | `src/hooks/use-app-mode-backend-sync.ts` |
| Sidebar toggle | `src/components/features/sidebar/app-mode-toggle.tsx` |
| Cloud guard | `src/components/features/work/work-mode-cloud-guard.tsx` |
| Tests | `__tests__/utils/app-mode-capabilities.test.ts` |

Hooks and routes should use `useWorkModeCapabilityContext()` (or
`useWorkModeAvailability()`) instead of checking `backend.kind === "local"` directly,
so override policy stays centralized.

---

## Not built yet

- **Work Runtime** service (sibling to Automation Server)
- **Work workspace manifest** (granted folders, deliverables path, app entitlements)
- Task creation, folder picker, `/work/tasks/:id`, apps marketplace
- Restricted agent profile for Work (no shell/git)
- Routing Work API calls by `execution` (`local` vs `hosted`)
- Backend/org UI to set `workExecution`
- Sidebar copy for dual-host (“Code on … / Work on …”)
- Org policy (e.g. forbid `workExecution: "local"` for compliance)

When implementing Work Runtime calls, branch on `capabilities.execution`:

- `local` → local agent-server / Work Runtime on device (same machine as
  `getEffectiveLocalBackend()`)
- `hosted` → cloud Work API + provisioned volumes (TBD)

---

## Related specs

- Backend selection and local fallback: [backend-management.md](./backend-management.md)
- Local vs cloud agent-server routing: `getEffectiveLocalBackend()` in
  `src/api/backend-registry/active-store.ts`

---

## Changelog

Document user-visible Work mode changes in `CHANGELOG.md` under `[Unreleased]`
when merging behavior beyond this scaffold.
