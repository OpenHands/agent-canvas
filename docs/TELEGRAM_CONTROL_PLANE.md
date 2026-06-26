# Telegram Agent Control Plane PRD and Architecture

Updated: 2026-06-26
Status: v0 implementation plan

## Summary

Build a Telegram-first, open-source agent control plane on top of Hermes,
OpenHands Agent Server, Agent Canvas, OpenHands Automations, and Spotwise's
verification contracts.

The product lets a team tag an agent where work already starts, watch the run,
inspect durable evidence, approve it, and promote it to a draft PR or another
controlled next step.

Short form:

> Tag it in chat. It does scoped work. It shows proof. It stops when trust runs
> out.

## Goals

1. Make Telegram the first useful intake surface for coding and non-coding work.
2. Keep Agent Canvas as the visual cockpit for runs, evidence, approvals,
   promotion state, and kill switches.
3. Reuse the existing evidence contracts instead of inventing a parallel approval
   system:
   - `.checks/result.json` — verified result and evidence bundle.
   - `.checks/approval.json` — durable operator approval.
   - `.checks/pr.json` — durable draft-PR promotion record.
4. Keep the first release safe on the current shared VM/worktree architecture.
5. Make every unattended loop auditable and stoppable.

## Non-goals for MVP

- No auto-merge.
- No broad production credentials installed silently.
- No arbitrary public Telegram install flow.
- No multi-tenant sandbox rewrite before threshold triggers.
- No in-cockpit clone of Hermes model routing, voice, CDP browsing, or mobile
  operator clients.
- No per-user metered cost dashboard until model usage moves away from
  subscription-OAuth and real cost data exists.

## Primary users

### Operator / founder

Starts work from private chat or team chat, checks what is blocked, approves
verified evidence, and gets ready-for-review digests.

### Engineer / reviewer

Receives draft PRs with linked checks, videos, traces, and decision logs. Uses
Agent Canvas for deeper inspection.

### Team member in group chat

Mentions the bot with a request, receives progress and final evidence, but does
not need to understand OpenHands internals.

### Admin

Controls allowed chats, users, projects, tool scopes, budgets, GitHub app
permissions, and emergency kill switches.

## Product surfaces

### 1. Telegram team chats

Jobs to be done:

- `@spotwise fix this bug`
- `@spotwise triage this report`
- `@spotwise review PR 123`
- `@spotwise run QA on the latest build`
- `@spotwise research this competitor`
- `@spotwise generate a product image from this thread`

Behavior:

- Parse message, thread, quoted messages, links, and attachments.
- Map chat to org/project/repo policy.
- Ask a short clarifying question only when project/repo/scope is ambiguous.
- Start a scoped run.
- Post progress checkpoints in the originating thread.
- Stop for approval when governance requires it.
- Return durable evidence links, not only prose.

### 2. Telegram private chats

Jobs to be done:

- `/runs` — list active and recently completed runs.
- `/blocked` — show runs waiting on a human.
- `/approve <run>` — approve green evidence.
- `/reject <run>` — reject or request changes.
- `/kill <run>` — stop a run.
- `/status <run>` — summarize state and next action.
- `grill me on this plan` — planning conversation.
- `review branch X against spec Y` — review route.

Behavior:

- Prefer concise command responses.
- Link to Agent Canvas for deep inspection.
- Never expose secret values in chat.
- Support owner-specific views and approvals.

### 3. Telegram report channels

Jobs to be done:

- Daily/weekly project digest.
- Failed verification digest.
- Blocked-work queue.
- Ready-for-review queue.
- Production health summary.

Behavior:

- Post summaries only, with links to evidence and cockpit views.
- Group by project, owner, and status.
- Avoid chat spam; batch routine reports.

### 4. Agent Canvas cockpit

Agent Canvas remains the system of record for visual inspection:

- all conversations/runs
- project and owner filters
- row-level verification and approval badges
- Checks tab evidence
- approval state
- PR promotion state
- durable videos/traces/logs
- decision log
- budget/policy state
- kill switch and audit timeline

## Current foundation

Already available in Agent Canvas production as of `agent-canvas@1baf6a56`:

- Row-level check result trust from `.checks/result.json`.
- Badge jump into the Checks tab.
- Durable media URL allowlist and media publisher seam.
- Approval button writing `.checks/approval.json`.
- Row-level approved verification badge.
- Draft-PR promotion after approved green evidence.
- `.checks/pr.json` written after promotion.
- Production image: `ghcr.io/spotwiseai/agent-canvas:sha-1baf6a5`.

## System architecture

```text
Telegram
  │
  ▼
Telegram Gateway
  - webhook/polling adapter
  - user/chat/project identity mapping
  - command parser
  - message renderer
  - approval button callback handler
  │
  ▼
Hermes Orchestrator
  - classify request type
  - choose project/repo/agent profile
  - enforce policy and budget
  - start OpenHands/Agent Canvas or non-coding route
  - subscribe to status/evidence events
  │
  ├──────────────► OpenHands Agent Server / Agent Canvas
  │                 - coding work
  │                 - isolated worktree/workspace
  │                 - verification runner
  │                 - `.checks/result.json`
  │                 - `.checks/approval.json`
  │                 - `.checks/pr.json`
  │
  ├──────────────► OpenHands Automations
  │                 - scheduled/event loops
  │                 - triage/reproduce/fix/verify pipelines
  │                 - PR review and QA loops
  │
  ├──────────────► Non-coding Tool Adapters
  │                 - image generation
  │                 - web research
  │                 - report/document generation
  │
  ▼
Governance and Audit Layer
  - identities
  - scoped permissions
  - budgets
  - escalation rules
  - kill switch
  - append-only audit log
```

## Component responsibilities

### Telegram Gateway

Owns Telegram-specific concerns only:

- Receives updates.
- Verifies allowed chat/user policy.
- Normalizes messages into work requests.
- Preserves thread/message IDs for replies.
- Stores callback tokens for approval/rejection buttons.
- Renders progress, evidence, approval, rejection, and report messages.

It should not own agent planning, repo policy, or verification logic.

### Hermes Orchestrator

Owns request interpretation and routing:

- Classify work type: coding, review, QA, research, imagegen, report, plan,
  admin.
- Resolve project/repo from chat mapping, links, or explicit arguments.
- Choose agent profile and tool policy.
- Enforce per-run budget and escalation rules.
- Start the correct execution backend.
- Emit audit events.

### Agent Canvas / OpenHands execution

Owns coding and visual evidence:

- Launch coding conversations.
- Attach repo/workspace context.
- Run terminal/file/browser tools.
- Produce or read `.checks/result.json`.
- Let an operator approve `.checks/approval.json`.
- Promote approved work and write `.checks/pr.json`.

### OpenHands Automations

Owns recurring/event-driven loops:

- PR opened/updated review.
- QA verification after changes.
- Failed-check retry loop.
- Scheduled reports.
- Bug-report triage.

Automation must use the same evidence and approval contracts as manually started
runs.

### Non-coding adapters

Initial adapters:

- Research: retrieval, synthesis, citations, report artifacts.
- Image generation: prompt refinement, asset generation, provenance.
- Document/tutorial generation: thread-to-doc and spec-to-doc routes.

Non-coding outputs still need status, audit, and approval where consequential.

### Governance and audit

Must exist from the first Telegram MVP, even if backed by simple config files:

- Allowed chats and users.
- Project/repo policy.
- Per-agent identity and credential scope.
- Per-run budget cap.
- Tool allowlist.
- Approval requirements.
- Global kill switch.
- Append-only audit events.

## Core data model

### WorkRequest

Normalized input from Telegram, Agent Canvas, scheduled automation, or future
chat surfaces.

Required fields:

- `source`: `telegram_group`, `telegram_private`, `report_channel`, `canvas`,
  or `automation`.
- `source_id`: chat/message/thread identifier.
- `requester`: stable user identity.
- `project`: optional project slug.
- `repo`: optional repository identifier.
- `intent`: coding, QA, review, research, imagegen, report, plan, or admin.
- `prompt`: normalized task text.
- `attachments`: URLs/files with provenance.
- `policy`: resolved policy snapshot.

### Run

Execution unit visible in Agent Canvas and Telegram.

Required fields:

- `run_id`
- `conversation_id` or external tool-run ID
- `project`
- `repo`
- `owner`
- `status`
- `budget_limit`
- `budget_used`
- `checks_path`
- `approval_path`
- `promotion_path`
- `audit_refs`

### Audit event

Append-only operational record.

Required fields:

- time
- actor
- action
- target run
- source surface
- policy decision
- evidence reference where relevant

## Trusted run lifecycle

```text
Intake
  → classify and resolve project/repo
  → policy and budget check
  → run starts
  → progress updates
  → verification emits `.checks/result.json`
  → operator approves green evidence into `.checks/approval.json`
  → approved coding run promotes to draft PR and writes `.checks/pr.json`
  → review/QA automations iterate until ready
```

Stop-the-line points:

- Unknown requester or chat.
- Ambiguous project/repo.
- Tool outside policy.
- Budget exhausted.
- Reproduction failed.
- Verification failed.
- Approval rejected.
- PR promotion failed.
- Kill switch engaged.

## MVP sequence

### Slice 0 — production smoke

Objective: prove the current approval-to-PR path works in production.

Acceptance:

- A real run has `.checks/result.json` with a passing verdict.
- Operator approves from Agent Canvas.
- `.checks/approval.json` is written.
- Operator promotes to draft PR.
- `.checks/pr.json` is written.
- PR body links evidence.

### Slice 1 — Telegram gateway skeleton

Objective: trusted private/group command intake without starting dangerous work.

Acceptance:

- Bot receives `/start`, `/help`, `/status`, `/runs`, `/kill`.
- Allowed users/chats are config-gated.
- Unknown users/chats are denied and audited.
- Gateway can render a static run card from existing Agent Canvas state.
- No production credentials beyond bot token and allowlist.

### Slice 2 — Telegram to Agent Canvas coding run

Objective: start a scoped coding run from a Telegram message.

Acceptance:

- Group mention becomes a `WorkRequest`.
- Project/repo are resolved from config or explicit arguments.
- Hermes starts an Agent Canvas/OpenHands conversation.
- Telegram thread receives start/progress/final updates.
- Agent Canvas row is tagged with requester/source/project.

### Slice 3 — Telegram approval buttons

Objective: approve or reject verified evidence from Telegram using the same
contract as the cockpit.

Acceptance:

- Passed `.checks/result.json` renders an approval card.
- Approve writes `.checks/approval.json`.
- Reject writes an audit event and requests correction or stops the run.
- Buttons are permission-gated.
- Agent Canvas reflects the approval state.

### Slice 4 — Telegram PR promotion

Objective: approved green coding work can be promoted from Telegram.

Acceptance:

- Promotion is available only after `.checks/approval.json` exists.
- Promotion creates/updates a draft PR.
- `.checks/pr.json` is written.
- Telegram receives the draft PR link.
- No auto-merge.

### Slice 5 — Report channel digest

Objective: low-noise scheduled visibility.

Acceptance:

- Daily digest posts ready-for-review, failed, blocked, and in-progress runs.
- Digest groups by project and owner.
- Each item links to Agent Canvas and evidence.

### Slice 6 — Trusted automations

Objective: event-driven loops with stop-the-line governance.

Acceptance:

- Bug loop: triage → reproduce → fix → verify → approval.
- PR loop: review → QA → fix-forward → ready notification.
- Every automation emits audit events and evidence.
- Budget and kill switch are enforced.

## Permission model v0

Start with explicit config, not self-serve installation:

- `allowed_private_users`: Telegram user IDs allowed to DM the bot.
- `allowed_group_chats`: Telegram chat IDs where mentions are accepted.
- `admin_users`: users who can kill runs, change budgets, and approve sensitive
  actions.
- `project_bindings`: chat/thread/project/repo mappings.
- `tool_policies`: allowed tool routes per project.
- `budget_defaults`: per-run ceilings by intent/project.

Default policy:

- Unknown chat/user: deny.
- Coding runs: allowed only for configured repos.
- PR promotion: draft-only.
- Approval: only passed evidence by default.
- Imagegen/research: disabled until credentials and policy are configured.

## Human handoff required

Pause and ask for human action before:

- creating or rotating the production Telegram bot token
- adding production chat IDs/admin IDs
- installing or broadening GitHub App permissions
- adding image-generation credentials
- enabling OpenHands Cloud/org-wide automations
- enabling public/self-serve workspace installation

## First implementation tasks

1. Production smoke: approve → draft PR from Agent Canvas.
2. Add Telegram gateway config shape and deny-by-default command skeleton.
3. Add `WorkRequest` normalization and audit event writer.
4. Wire `/runs`, `/blocked`, `/status`, `/kill` to existing Agent Canvas/Hermes
   state.
5. Wire group mention to a dry-run classification response.
6. Wire group mention to actual Agent Canvas conversation start.
7. Add Telegram approval callbacks that write `.checks/approval.json` through the
   existing runtime write path.
8. Add Telegram promotion callback that invokes the existing PR promotion path.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bot starts work for the wrong chat/user | deny-by-default allowlists and audit events |
| Wrong repo/project chosen | explicit project bindings, clarification on ambiguity |
| Agent runs away | per-run budgets, progress checkpoints, kill switch |
| Bad code is promoted | `.checks/result.json` + approval gate + draft-only PR |
| Evidence disappears | durable media URLs and committed check contracts |
| Chat spam | thread replies for active runs, batched report channels |
| Credential leakage | never render secrets; scoped credentials per adapter |
| Shared VM noisy neighbor | current container caps; move to stronger isolation only at thresholds |

## Open decisions

1. Telegram transport: webhook behind existing ingress vs polling service on the
   VM.
2. Storage: config files first vs SQLite event store for audit and run index.
3. Approval authority: admin-only for MVP vs project-owner approval map.
4. Hermes ownership: does Hermes own all orchestration, or do some automations
   call Agent Canvas directly?
5. Telegram message design: one mutable status card vs periodic immutable
   updates.
6. Project source of truth: cockpit registry, Hermes board slug, or a shared
   project config file for MVP.

## Completion definition for MVP

The first MVP is complete when a configured Telegram group can mention the bot to
start a scoped Agent Canvas coding run, the run emits durable check evidence, a
configured approver can approve it from Telegram or Agent Canvas, and the system
can create a draft PR with evidence links while preserving a complete audit trail.
