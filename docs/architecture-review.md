# Architecture and code-quality review

This document records the architecture review for the Agent Canvas Incubator status-change request. Final status changes still require OpenHands Tech Council approval through the incubator-program process.

## Review scope

Reviewed areas:

- Repository structure and package metadata.
- Runtime architecture and backend boundaries.
- Development and production launch paths.
- Test and CI coverage.
- Documentation and support surfaces.
- Security-sensitive local and self-hosted deployment behavior.

## Summary

Agent Canvas is suitable to request Incubator review. It has a clear product boundary, an active owner, a support channel, strong automated quality gates, and documentation for users, contributors, and operators.

The main architectural risk is inherent to the product: local agent execution can grant agents access to user files. The project mitigates this with Docker sandbox workflows, direct-host warnings, and self-hosting hardening documentation.

## Architecture findings

### Clear system boundary

Agent Canvas is a frontend and launcher layer. It does not execute agent actions itself; execution is delegated to the OpenHands Agent Server and optional automation/cloud services. This boundary keeps the UI package focused on rendering, state management, API adaptation, and packaging.

### Backend abstraction

The API layer is separated under `src/api/`, with adapters for local Agent Server, cloud, git, settings, skills, automations, and backend registry behavior. This keeps hosted-only and local-only behavior from leaking across the UI.

### Runtime service discovery

Development launchers publish service topology through `VITE_RUNTIME_SERVICES_INFO`. The frontend forwards that topology into conversation context so agents use declared service URLs instead of probing unknown ports. This is a useful safety and reliability pattern.

### Packaging model

The package supports both a standalone app and library entrypoints. The CI workflow builds both surfaces and runs `npm pack --dry-run`, reducing release risk for npm consumers.

## Code-quality findings

### Strengths

- TypeScript, ESLint, Prettier, and React Router type generation are wired into `npm run lint`.
- Unit and component tests cover API services, hooks, routes, stores, UI components, and scripts.
- End-to-end coverage includes regression, snapshot, and optional live QA paths.
- GitHub Actions runs lint, tests, app build, library build, and package verification.
- Dependabot is configured for npm and GitHub Actions updates.
- Documentation covers quickstart, development workflows, self-hosting, architecture, and Incubator readiness.

### Risks and follow-ups

| Risk | Impact | Mitigation / follow-up |
|---|---|---|
| Direct host mode gives agents filesystem access | High if users run it casually | README warns about direct mode; Docker sandbox remains the safer laptop workflow; self-hosting docs include hardening guidance. |
| Multiple runtime modes increase support complexity | Medium | Keep runtime-service metadata centralized and test launcher behavior. |
| Large adapted frontend surface can drift from upstream OpenHands UI | Medium | Continue CI coverage and isolate Agent Server adaptation under `src/api/`. |
| Visual snapshots depend on CI-generated baselines | Low/medium | Existing snapshot workflow stores baselines as artifacts and documents update behavior. |

## Review conclusion

No blocker was found that should prevent requesting Incubator status after the formal OpenHands incubator-program process is followed. The project should proceed with a status-change request that includes this review, the readiness checklist, CI evidence, and confirmation from the named project owner.
