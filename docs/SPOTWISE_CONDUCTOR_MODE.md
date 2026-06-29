# Spotwise Conductor Mode

Spotwise runs Agent Canvas as an internal background-coding cockpit. The fork aims to keep OpenHands' subscription-friendly ACP/Codex runtime while moving the product shape closer to Conductor: repository-first task launch, isolated workspaces, visible status, checks, and PR handoff.

## Fork strategy decision

Decision: keep the Spotwise fork for now, but keep shrinking the fork surface.

The fork is justified by durable product primitives that upstream Agent Canvas does not yet provide:

- verification trust contracts: `.checks/result.json`, `.checks/approval.json`, `.checks/pr.json`
- Checks tab, row verification badges, approval gate, and draft-PR promotion
- project/repository scoping for operator-launched work (`tags.project`, source badges, project registry)
- Conductor/firehose cockpit behavior: attention, ownership, mute/archive/unread, project filters, and row actions
- production self-host hardening for `agents.spotwise.ai`: static session-key self-heal, OAuth/public-mode fixes, Spotwise image/deploy workflows
- Telegram/trusted-loop integration points that make evidence and PR handoff visible in Agent Canvas

The fork is **not** justified by generic UI drift, scattered style changes, or permanent local patches for issues that should live upstream. Generic fixes should be upstreamed or deleted once upstream has an equivalent. Spotwise-only behavior should move behind plugins, config, or narrowly named modules where possible.

Practical rule: preserve fork code that supports verification, project-scoped operator control, production stability, or trusted-loop evidence. Push everything else toward upstream, plugins, or removal.

## Non-negotiable workspace model

Every task launched from a local/self-hosted backend must use an isolated git worktree.

Current Agent Server behavior for `worktree: true`:

- source checkout: selected repository/workspace path, e.g. `/projects/spotwise-ui`
- task worktree: `/tmp/conversation-worktrees/<conversation_id>/<repo>`
- task branch: `openhands/<conversation_id>`
- agent guidance: appended server-side, instructing the agent to work in that worktree/branch

The fork therefore treats the selected repo path as a **source checkout**, not the edit target.

## Milestone 1 — repository-first worktree launch

Implemented in this branch:

- Local home launcher opens **Repository or Workspace** instead of only folders.
- GitHub repositories are listed from the backend using `GITHUB_TOKEN` or mounted `~/.git-credentials`.
- Private clones use the backend's configured git credentials; no model/API keys are involved.
- Repositories clone/reuse into `/projects/<repo>`.
- Launching a local task passes `workspaceMode: "new_worktree"`.
- The worktree mode chip is locked in the home launcher for local selections.

This gives the minimum viable Conductor behavior: pick repo → task prompt → dedicated worktree/branch.

## Milestone 1.5 — plugin extension surface

OpenHands' upstream plugin support is a good fit for Conductor mode. Use plugins as the default extension seam for Spotwise-specific launch affordances, command-menu actions, repo/operator packs, verification shortcuts, and optional integrations that should not be hardcoded into core navigation or provider logic.

Boundary rule:

- **plugins**: UI commands, repo-specific helpers, governed launch affordances, optional integrations
- **skills**: agent behavior, repo context, policy/context instructions
- **core fork code**: durable product primitives only — project scoping, checks contracts, approval gates, PR promotion, worktree launch guarantees

First candidate: a Spotwise operator/plugin pack that exposes trusted-loop entry points, common repo tasks, `.checks/*` helpers, and links to the installed operator skills.

## Milestone 2 — workspace status cards

Goal: sidebar/home should show task cards grouped by repository with at-a-glance status.

Data sources:

- `AppConversation.execution_status`
- `AppConversation.workspace.working_dir`
- client metadata: `selected_workspace`, `workspace_mode`, `selected_repository`, `selected_branch`
- local git probes for repo/branch fallback

Proposed UI:

- repo group header: `SpotwiseAI/spotwise-ui`
- card metadata: branch, agent kind, model/profile, runtime state
- badges: Running, Waiting, Finished, Dirty, PR Opened, Checks Failed
- actions: Open, Stop, Archive, Create PR

## Milestone 3 — checks tab

Goal: each task has an explicit verification surface, not just terminal logs.

Proposed source of check commands:

1. repo config: `.openhands/checks.json` or `.agents/checks.json`
2. package manager detection fallback:
   - `npm test`, `npm run lint`, `npm run typecheck`
   - `pnpm`, `yarn`, `uv`, `pytest`, etc. as detected
3. manual per-task command entry

Implementation options:

- first slice: frontend sends bash commands to the conversation workspace and stores the latest result in local metadata
- later: Agent Server/Automation backend persists structured check runs

## Milestone 4 — draft PR button

Goal: one click from finished worktree to draft PR.

Backend assumptions:

- GitHub App installation token is refreshed on the host and mounted as git credentials.
- The task branch starts as `openhands/<conversation_id>`.

Proposed flow:

1. inspect current worktree status
2. require clean staged/committed state or offer generated commit step
3. push task branch
4. create draft PR against the source checkout's default branch
5. persist PR URL in conversation metadata

First implementation can shell out to `git` + GitHub REST API through the existing runtime command endpoint. Later implementation should become a typed local GitHub service.

## Milestone 5 — Linear issue to workspace

Goal: create a task directly from a Linear issue and preserve traceability.

Proposed flow:

1. paste/select Linear issue ID
2. fetch issue title/description/comments through Hermes or Linear token
3. choose repository from Spotwise mapping rules
4. launch Agent Canvas conversation with:
   - initial prompt from issue context
   - selected repo source checkout
   - isolated worktree mode
   - metadata: Linear issue ID, URL, team/project
5. optional PR title/body generated from Linear issue

Hermes remains the better intake brain for Slack/WhatsApp/voice/Linear routing; Agent Canvas should provide the cockpit once coding starts.

## Deployment direction

The Azure pilot should run images from Azure Container Registry (ACR). This repo owns the image build/push workflow in `.github/workflows/azure-container.yml`; the remote-coding-agent setup repo should own:

- image tag pinning
- GitHub App token refresh/mounts
- Agent Canvas service restart
- smoke test: repo list → clone → start worktree conversation

GitHub configuration for the ACR workflow is set on `SpotwiseAI/agent-canvas`:

- repository variables:
  - `AZURE_CONTAINER_REGISTRY_NAME=spotwiseapp`
  - `AZURE_CONTAINER_REGISTRY_LOGIN_SERVER=spotwiseapp.azurecr.io`
  - `AZURE_IMAGE_NAME=agent-canvas`
- repository secrets for Azure OIDC login:
  - `AZURE_CLIENT_ID` — Azure app `spotwise-agent-canvas`
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID`

The Azure app/service principal has `AcrPush` on `spotwiseapp` and a federated credential for the GitHub environment subject `repo:SpotwiseAI/agent-canvas:environment:azure-production`. The workflow pushes per-architecture tags plus multi-arch manifests for `sha-<short>`, `main`, release versions, and `latest` on stable `v*` tags.
