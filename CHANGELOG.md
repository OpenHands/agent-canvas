# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Work mode MVP (local): Code/Work toggle, Work Runtime sidecar, folder setup,
  restricted Work task creation, `/work/tasks/:id` chat, and tag-filtered task
  lists. See [specs/work-mode.md](./specs/work-mode.md).
- Work tool policy: manifest defaults for optional tools (e.g. browser/internet),
  in-conversation toggles, and agent `<WORK_TOOL_REQUEST/>` permit flow.
- **Work Settings** tab under Settings (`/settings/work`) for workspace folders,
  deliverables path, default tools, and Work Runtime status.

## [1.0.0-alpha.2] - 2025-05-11

### Added

- Initial npm package release of `@openhands/agent-canvas`
- CLI entry point (`npx @openhands/agent-canvas`) to run full stack locally
- Library build mode with component barrel exports
- Subpath exports for modular imports:
  - `@openhands/agent-canvas/browser`
  - `@openhands/agent-canvas/conversation`
  - `@openhands/agent-canvas/files`
  - `@openhands/agent-canvas/settings`
  - `@openhands/agent-canvas/sidebar`
  - `@openhands/agent-canvas/terminal`
  - `@openhands/agent-canvas/i18n`
- TypeScript type declarations
- GitHub Actions workflow for automated npm publishing (OIDC trusted publishing)

[Unreleased]: https://github.com/OpenHands/agent-canvas/compare/v1.0.0-alpha.2...HEAD
[1.0.0-alpha.2]: https://github.com/OpenHands/agent-canvas/releases/tag/v1.0.0-alpha.2
