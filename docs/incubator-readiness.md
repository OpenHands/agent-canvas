# Incubator readiness

Agent Canvas is being prepared for an OpenHands Incubator status-change request. The source of truth for lifecycle requirements is the [OpenHands Incubator Program](https://github.com/OpenHands/incubator-program).

## Current status

- **Current lifecycle status**: Sandbox.
- **Requested lifecycle status**: Incubator.
- **Project owner**: Ash Clarke.
- **Support channel**: `#proj-agent-canvas`.
- **Repository**: `OpenHands/agent-canvas`.
- **Package**: `@openhands/agent-canvas`.

The README should keep the Sandbox badge until Tech Council approves the status change. After approval, replace it with the official Incubator badge from the incubator-program documentation.

## Requirement checklist

| Requirement | Status | Evidence |
|---|---:|---|
| Project lives in the OpenHands organization | ✅ | Repository metadata and package links point to `OpenHands/agent-canvas`. |
| `LICENSE` present | ✅ | Root `LICENSE` file; `package.json` declares MIT. |
| `README` present | ✅ | Root `README.md` includes overview, quickstart, architecture summary, support channel, and documentation links. |
| Status badge in README | ✅ | README displays the official Sandbox badge while awaiting Incubator approval. |
| Tests added | ✅ | Unit, component, route, API, script, regression, snapshot, and live E2E test suites exist under `__tests__/` and `tests/e2e/`. |
| Documentation added in `docs/` | ✅ | This directory contains project docs and links to development and self-hosting guides. |
| Slack `#proj-` channel created | ✅ | README links to the `#proj-agent-canvas` support channel. |
| Clear project owner | ✅ | README and this document list Ash Clarke as project owner. |
| Architecture review completed | ✅ | Initial review recorded in [architecture-review.md](./architecture-review.md); Tech Council final approval is still required. |
| Tech Council approval | ⏳ | Pending status-change request in `OpenHands/incubator-program`. |

## Code quality evidence

The repository has a broad automated quality surface:

- `npm run lint` runs type generation, TypeScript checks, ESLint, and Prettier checks.
- `npm test` runs the Vitest unit and component suites.
- `npm run build` verifies the standalone app build.
- `npm run build:lib` verifies package library entrypoints.
- `npm pack --dry-run` verifies package contents before publishing.
- Visual snapshot tests run through the `Snapshot Tests` workflow.
- Optional live E2E tests can be triggered for PRs that need real backend validation.

The main CI workflow runs the core checks on pull requests and pushes to `main`, with an additional Windows build/test leg on `main` pushes.

## User value evidence

Agent Canvas gives OpenHands users a self-hostable interface for:

- Starting and monitoring agent conversations.
- Switching between local, remote, and hosted agent backends.
- Running agents in Docker-sandboxed or direct host modes.
- Connecting optional automation workflows.
- Embedding Agent Canvas UI modules through package entrypoints.

The project is published as `@openhands/agent-canvas` and has a public support channel for feedback.

## Remaining steps before requesting Incubator status

1. Open a status-change issue in `OpenHands/incubator-program` using the status-change template.
2. Include this evidence in the request:
   - Project owner: Ash Clarke.
   - Slack channel: `#proj-agent-canvas`.
   - CI quality gates and latest successful checks.
   - Test suite summary.
   - Links to `docs/architecture.md`, `docs/architecture-review.md`, `DEVELOPMENT.md`, and `SELF_HOSTING.md`.
3. After Tech Council approval, update the README badge to the official Incubator badge and add Agent Canvas to the incubator-program active projects table.
