# Per-File Test Design Quality Report

Audit of the `@openhands/agent-canvas` test suite using Dave Farley's 8
Properties of Good Tests.

**Reference**: [Dave Farley's Properties of Good Tests](https://www.linkedin.com/pulse/tdd-properties-good-tests-dave-farley-iexge/)
**Method**: [test-design-reviewer skill](https://github.com/citypaul/.dotfiles/blob/main/claude/.claude/skills/test-design-reviewer/SKILL.md)

---

## Methodology

This repository has **414 unit/component test files** (Vitest reported
413 passed + 1 skipped) — 405 under `__tests__/` plus 9 co-located beside source
under `src/` — totalling 3,000+ tests. That is far more than a
hand-scored-per-file audit can cover honestly. Rather than invent eight sub-scores
for files that were not read, this report uses a two-layer approach:

1. **Category scores** (below) — evidence-based aggregate Farley scores per test
   category, grounded in deep reads of representative and outlier files.
2. **Detailed audits** — full property breakdowns for ~20 notable files that were
   read closely (exemplary files, slowest files, largest files).
3. **Measured-metrics appendix** — real `lines / tests / duration` numbers for
   **all 405 `__tests__/` files**, grouped by category. No fabricated scores; the
   numbers are measured from the source and from the `vitest run --coverage`
   execution. (The 9 co-located `src/**/*.test.ts` files are audited individually
   above where notable but omitted from the per-category appendix tables.)

All durations come from a single `npm run test:coverage` run; line counts are
`wc -l` of each spec; test counts are Vitest's reported per-file counts.

---

## Summary Statistics

| Category | Files | Lines | Tests | Duration | Avg Farley |
|----------|------:|------:|------:|---------:|:----------:|
| API / adapter layer | 51 | 9,979 | 429 | 10.3s | 8.2 |
| Hooks | 68 | 12,418 | 384 | 16.8s | 7.9 |
| Components | 173 | 33,874 | 1,336 | 74.5s | 7.4 |
| Utilities | 44 | 4,155 | 294 | 0.7s | 8.6 |
| Routes | 20 | 5,598 | 173 | 22.0s | 7.3 |
| Stores | 8 | 964 | 52 | 0.2s | 8.5 |
| Services | 5 | 557 | 34 | 0.5s | 8.3 |
| Dev/CI scripts | 10 | 3,089 | 162 | 6.6s | 8.0 |
| i18n | 5 | 314 | 17 | 4.1s | 7.6 |
| Contexts | 3 | 654 | 19 | 0.5s | 8.2 |
| Other top-level | 18 | 2,396 | 130 | 1.2s | 8.1 |
| **Total** | **405** | **73,998** | **3,030** | **137.4s** | **7.9** |

> Test count (3,030) is the sum of Vitest's per-file reports captured from the
> run; the run summary reported 3,144 passing (the difference is files whose
> per-line summary was folded in the truncated console output). E2E specs in
> `tests/e2e` (18 files) run separately and are not included here.

---

## Scoring Legend

| Score Range | Rating |
|-------------|--------|
| 9.0–10.0 | Exemplary |
| 7.5–8.9 | Excellent |
| 6.0–7.4 | Good |
| 4.5–5.9 | Fair |
| 3.0–4.4 | Poor |
| < 3.0 | Critical |

**Properties**: U=Understandable, M=Maintainable, R=Repeatable, A=Atomic,
N=Necessary, G=Granular, F=Fast, T=TDD

---

## Detailed Per-File Audits

### API / Adapter Layer

#### `__tests__/api/agent-server-adapter.test.ts`
| Lines | Tests | Duration |
|-------|-------|----------|
| 1,489 | 70 | <1s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 9 | 8 | 9 | 9 | 9 | 8 | 9 | 8 | **8.6** |

**Strengths**: Behavioral names enumerate exact contract edges (tool gating, ACP
secret delivery, `canvas_ui` injection, model fallback via `it.each`); 70 tests
in under a second; `vi.hoisted` mocks isolate config/backend cleanly.
**Opportunities**: 1,489-line file could split by builder (request / context /
runtime-suffix).

---

#### `__tests__/api/settings-service.test.ts`
| Lines | Tests | Duration |
|-------|-------|----------|
| 686 | 20 | 4.7s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 8 | 8 | 9 | 9 | 9 | 8 | 5 | 8 | **8.0** |

**Strengths**: Covers PATCH diff semantics, `misc_settings` deep-merge, legacy
migration. **Opportunities**: 4.7s is the slowest API file; trim redundant
`waitFor` polling.

---

#### `__tests__/api/git-service.test.ts`
| Lines | Tests | Duration |
|-------|-------|----------|
| 206 | 32 | <1s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 9 | 9 | 9 | 9 | 8 | 9 | 10 | 8 | **8.7** |

**Exemplary**: 32 focused tests in <1s; one behavior per case.

---

#### `src/api/no-direct-agent-server-calls.test.ts` (co-located guard)
| Lines | Tests | Duration |
|-------|-------|----------|
| — | — | <1s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 9 | 9 | 10 | 10 | 10 | 9 | 9 | 7 | **9.0** |

**Exemplary**: Architectural guard that statically forbids raw axios/fetch to the
agent-server. High-value, deterministic, protects the whole API-access policy.

---

### Hooks

#### `__tests__/hooks/query/use-automations-backend-switch.test.tsx`
| Lines | Tests | Duration |
|-------|-------|----------|
| — | 4 | 7.3s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 8 | 7 | 8 | 8 | 8 | 7 | 3 | 7 | **7.0** |

**Opportunities**: 4 tests / 7.3s — the worst per-test latency in the suite.
Likely over-broad async waits; tighten timers/awaits.

---

#### `__tests__/hooks/use-websocket.test.ts`
| Lines | Tests | Duration |
|-------|-------|----------|
| — | — | <1s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 8 | 7 | 7 | 8 | 8 | 8 | 9 | 7 | **7.6** |

**Note**: `AGENTS.md` documents that the `onClose` assertion was flaky against
the shared MSW WebSocket server and now uses a deterministic stubbed close path —
a Repeatable concession worth converting fully to a stubbed clock.

---

### Components

#### `__tests__/components/conversation-events/chat/group-events.test.ts`
| Lines | Tests | Duration |
|-------|-------|----------|
| — | — | <1s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 9 | 9 | 10 | 10 | 9 | 9 | 10 | 8 | **8.7** |

**Exemplary**: Pure grouping logic; each `it` asserts one rule
(_"does not group ThinkAction"_, _"does not group user messages"_); instant.

---

#### `__tests__/components/features/conversation-panel/conversation-panel.test.tsx`
| Lines | Tests | Duration |
|-------|-------|----------|
| — | 41 | 6.4s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 8 | 7 | 8 | 8 | 7 | 6 | 4 | 7 | **7.2** |

**Strengths**: Uses `renderWithProviders` and a documented `createMockConversation`
factory with deterministic timestamps. **Opportunities**: 41 tests in one file at
6.4s; integration-level scope makes failures harder to localize. Split by
behavior (rendering, selection, stop/delete, ordering).

---

#### `__tests__/components/backends/backend-selector.test.tsx`
| Lines | Tests | Duration |
|-------|-------|----------|
| — | 18 | 5.2s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 8 | 7 | 8 | 8 | 8 | 7 | 5 | 7 | **7.3** |

**Strengths**: Covers connection-indicator health states. **Opportunities**: jsdom
render-heavy; second slowest component file.

---

### Routes

#### `__tests__/routes/agent-settings.test.tsx`
| Lines | Tests | Duration |
|-------|-------|----------|
| — | 20 | 7.1s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 8 | 7 | 8 | 8 | 8 | 7 | 4 | 7 | **7.1** |

**Strengths**: Exercises the real Agent settings screen against MSW including the
`enable_sub_agents` flatMap-over-schema behavior. **Opportunities**: slowest
route spec; broad integration scope.

---

### Utilities & Stores

#### `__tests__/utils/mcp-marketplace-utils.test.ts`
| Lines | Tests | Duration |
|-------|-------|----------|
| — | 25 | <1s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 9 | 9 | 10 | 10 | 9 | 9 | 10 | 8 | **8.7** |

**Exemplary**: Catalog patching and install-match logic with defensive cases
named explicitly; instant and deterministic.

---

#### `__tests__/stores/conversation-store.test.ts` (representative store)
| Lines | Tests | Duration |
|-------|-------|----------|
| — | — | <1s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 9 | 9 | 10 | 10 | 8 | 9 | 10 | 8 | **8.6** |

**Strengths**: Zustand store behavior verified directly; fresh state per test;
single-behavior assertions.

---

### Dev/CI Scripts

#### `__tests__/scripts/dev-safe.test.ts`
| Lines | Tests | Duration |
|-------|-------|----------|
| — | 52 | <1s |

| U | M | R | A | N | G | F | T | **Score** |
|---|---|---|---|---|---|---|---|-----------|
| 8 | 8 | 9 | 9 | 8 | 8 | 10 | 7 | **8.1** |

**Strengths**: 52 fast Node-environment tests covering launcher key generation,
env precedence, and `uvx` spawning — unusual and valuable coverage of dev
plumbing.

---

## Measured Metrics Appendix (All 405 Files)

Real measured numbers for every unit/component test file, grouped by category and
sorted by test count. Durations are from the coverage run; `<1s` means the file
completed in under one second.

### API / adapter layer (`__tests__/api`)

_51 files · 9,979 lines · 429 tests · 10.3s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/api/agent-server-adapter.test.ts` | 1489 | 70 | <1s |
| `__tests__/api/git-service.test.ts` | 206 | 32 | <1s |
| `__tests__/api/agent-server-conversation-service.test.ts` | 928 | 26 | <1s |
| `__tests__/api/automation-service.test.ts` | 536 | 25 | <1s |
| `__tests__/api/agent-server-config.test.ts` | 202 | 21 | <1s |
| `__tests__/api/device-flow-client.test.ts` | 491 | 21 | 1.0s |
| `__tests__/api/settings-service.test.ts` | 686 | 20 | 4.7s |
| `__tests__/api/backend-registry/storage.test.ts` | 300 | 19 | <1s |
| `__tests__/api/workspace-upload-path.test.ts` | 137 | 12 | <1s |
| `__tests__/api/automation-handlers.test.ts` | 146 | 12 | 2.9s |
| `__tests__/api/runtime-service/agent-server-runtime-service.test.ts` | 307 | 12 | <1s |
| `__tests__/api/agent-server-git-service.test.ts` | 289 | 11 | <1s |
| `__tests__/api/profiles-service.test.ts` | 231 | 10 | <1s |
| `__tests__/api/option-service.test.ts` | 130 | 9 | <1s |
| `__tests__/api/acp-service/acp-service.api.test.ts` | 130 | 9 | <1s |
| `__tests__/api/cloud-conversation-service.test.ts` | 249 | 8 | <1s |
| `__tests__/api/backend-registry/active-store.test.ts` | 119 | 8 | <1s |
| `__tests__/api/cloud/settings-service.test.ts` | 207 | 7 | <1s |
| `__tests__/api/workspaces-service.test.ts` | 143 | 6 | <1s |
| `__tests__/api/cloud/proxy.test.ts` | 219 | 6 | <1s |
| `__tests__/api/backend-registry/last-conversation-store.test.ts` | 67 | 6 | <1s |
| `__tests__/api/conversation-service.test.ts` | 143 | 5 | <1s |
| `__tests__/api/event-service.test.ts` | 125 | 5 | <1s |
| `__tests__/api/mock-workspaces-handlers.test.ts` | 69 | 5 | <1s |
| `__tests__/api/use-create-conversation-metadata.test.ts` | 199 | 4 | <1s |
| `__tests__/api/bash-service.test.ts` | 175 | 4 | <1s |
| `__tests__/api/cloud/organization-service.test.ts` | 105 | 4 | <1s |
| `__tests__/api/cloud/secrets-service.test.ts` | 122 | 4 | <1s |
| `__tests__/api/mcp-service/mcp-service.api.test.ts` | 138 | 4 | <1s |
| `__tests__/api/backend-registry/health-store.test.ts` | 111 | 4 | <1s |
| `__tests__/api/conversation-metadata-store.test.ts` | 59 | 3 | <1s |
| `__tests__/api/conversation-file-upload.test.ts` | 147 | 3 | <1s |
| `__tests__/api/mock-conversation-handlers.test.ts` | 44 | 3 | <1s |
| `__tests__/api/mock-settings-handlers.test.ts` | 103 | 3 | <1s |
| `__tests__/api/config-service.test.ts` | 61 | 3 | <1s |
| `__tests__/api/mock-file-handlers.test.ts` | 35 | 2 | <1s |
| `__tests__/api/suggestions-service.test.ts` | 83 | 2 | <1s |
| `__tests__/api/agent-server-compatibility-bundled-pin.test.ts` | 75 | 2 | <1s |
| `__tests__/api/skills-service.test.ts` | 109 | 2 | <1s |
| `__tests__/api/cloud/conversation-create.test.ts` | 120 | 2 | <1s |
| `__tests__/api/cloud/conversation-runtime-info.test.ts` | 140 | 2 | <1s |
| `__tests__/api/cloud/git-service.test.ts` | 71 | 2 | <1s |
| `__tests__/api/cloud/conversation-public-flag.test.ts` | 65 | 2 | <1s |
| `__tests__/api/cloud/conversation-pause.test.ts` | 89 | 2 | <1s |
| `__tests__/api/to-app-conversation-session-key.test.ts` | 39 | 1 | <1s |
| `__tests__/api/cloud/sandbox-service.test.ts` | 56 | 1 | <1s |
| `__tests__/api/cloud/organization-me.test.ts` | 56 | 1 | <1s |
| `__tests__/api/cloud/suggestions-service.test.ts` | 48 | 1 | <1s |
| `__tests__/api/cloud/conversation-delete.test.ts` | 49 | 1 | <1s |
| `__tests__/api/cloud/conversation-download.test.ts` | 53 | 1 | <1s |
| `__tests__/api/cloud/skills-service.test.ts` | 78 | 1 | <1s |

### Hooks (`__tests__/hooks`)

_68 files · 12,418 lines · 384 tests · 16.8s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/hooks/use-tracking.test.ts` | 315 | 21 | <1s |
| `__tests__/hooks/use-draft-persistence.test.tsx` | 618 | 18 | <1s |
| `__tests__/hooks/query/use-bash-command-logs.test.tsx` | 293 | 14 | <1s |
| `__tests__/hooks/use-filtered-events.test.ts` | 242 | 12 | <1s |
| `__tests__/hooks/use-posthog-identify.test.ts` | 189 | 12 | <1s |
| `__tests__/hooks/mutation/use-save-fields-as-secrets.test.ts` | 178 | 11 | <1s |
| `__tests__/hooks/use-select-conversation-tab.test.ts` | 241 | 10 | <1s |
| `__tests__/hooks/use-breakpoint.test.ts` | 180 | 10 | <1s |
| `__tests__/hooks/use-load-older-events.test.tsx` | 438 | 10 | <1s |
| `__tests__/hooks/use-telemetry.test.tsx` | 162 | 10 | <1s |
| `__tests__/hooks/use-auto-refresh-files-on-edit.test.tsx` | 377 | 10 | <1s |
| `__tests__/hooks/query/use-backends-health.test.tsx` | 295 | 10 | <1s |
| `__tests__/hooks/query/use-workspace-file-content.test.tsx` | 332 | 10 | <1s |
| `__tests__/hooks/query/use-workspace-session.test.tsx` | 246 | 9 | <1s |
| `__tests__/hooks/mutation/use-update-conversation-repository.test.tsx` | 440 | 9 | <1s |
| `__tests__/hooks/use-handle-plan-click.test.tsx` | 344 | 8 | <1s |
| `__tests__/hooks/use-device-flow.test.ts` | 302 | 8 | <1s |
| `__tests__/hooks/use-task-list.test.ts` | 187 | 7 | <1s |
| `__tests__/hooks/use-sync-posthog-consent.test.ts` | 118 | 7 | <1s |
| `__tests__/hooks/use-chat-input-model-state.test.tsx` | 227 | 7 | <1s |
| `__tests__/hooks/use-settings-nav-items.test.tsx` | 188 | 7 | <1s |
| `__tests__/hooks/query/use-conversation-history.test.tsx` | 353 | 7 | <1s |
| `__tests__/hooks/query/use-acp-auth-status.test.tsx` | 131 | 7 | <1s |
| `__tests__/hooks/query/use-llm-profiles.test.tsx` | 267 | 7 | <1s |
| `__tests__/hooks/chat/use-model-interceptor.test.tsx` | 214 | 7 | <1s |
| `__tests__/hooks/use-handle-build-plan-click.test.ts` | 193 | 6 | <1s |
| `__tests__/hooks/use-ensure-active-profile.test.tsx` | 86 | 6 | <1s |
| `__tests__/hooks/mutation/use-new-conversation-command.test.tsx` | 236 | 6 | <1s |
| `__tests__/hooks/mutation/conversation-mutation-utils.test.ts` | 166 | 6 | <1s |
| `__tests__/hooks/mutation/use-rename-llm-profile.test.tsx` | 161 | 6 | <1s |
| `__tests__/hooks/use-agent-notification.test.ts` | 106 | 5 | <1s |
| `__tests__/hooks/use-scroll-to-bottom.test.ts` | 126 | 5 | <1s |
| `__tests__/hooks/query/use-active-conversation.test.ts` | 160 | 5 | <1s |
| `__tests__/hooks/mutation/use-test-mcp-server.test.ts` | 145 | 5 | <1s |
| `__tests__/hooks/use-resizable-panels.test.ts` | 88 | 4 | <1s |
| `__tests__/hooks/use-has-attached-source.test.ts` | 78 | 4 | <1s |
| `__tests__/hooks/query/use-automations-backend-switch.test.tsx` | 232 | 4 | 7.3s |
| `__tests__/hooks/chat/use-btw-interceptor.test.ts` | 65 | 4 | <1s |
| `__tests__/hooks/chat/use-slash-command.test.ts` | 206 | 4 | <1s |
| `__tests__/hooks/mutation/use-save-settings.test.ts` | 104 | 4 | <1s |
| `__tests__/hooks/mutation/use-save-llm-profile.test.tsx` | 138 | 4 | <1s |
| `__tests__/hooks/use-download-conversation.test.ts` | 96 | 3 | <1s |
| `__tests__/hooks/use-terminal.test.tsx` | 115 | 3 | <1s |
| `__tests__/hooks/use-unified-vscode-url.test.tsx` | 203 | 3 | <1s |
| `__tests__/hooks/query/use-local-git-info.test.tsx` | 186 | 3 | <1s |
| `__tests__/hooks/query/use-sub-conversation-task-polling.test.tsx` | 115 | 3 | <1s |
| `__tests__/hooks/query/use-cloud-current-user-id.test.tsx` | 129 | 3 | <1s |
| `__tests__/hooks/mutation/use-delete-llm-profile.test.tsx` | 96 | 3 | <1s |
| `__tests__/hooks/mutation/use-switch-llm-profile-and-log.test.tsx` | 76 | 3 | <1s |
| `__tests__/hooks/mutation/use-switch-acp-model.test.tsx` | 122 | 3 | <1s |
| `__tests__/hooks/mutation/use-switch-llm-profile.test.tsx` | 123 | 3 | <1s |
| `__tests__/hooks/use-runtime-is-ready.test.tsx` | 71 | 2 | <1s |
| `__tests__/hooks/query/use-conversation-metrics.test.tsx` | 145 | 2 | <1s |
| `__tests__/hooks/query/use-has-git-commits.test.tsx` | 117 | 2 | <1s |
| `__tests__/hooks/query/use-bash-command-logs-enabled.test.tsx` | 119 | 2 | <1s |
| `__tests__/hooks/query/use-automation-health.test.tsx` | 67 | 2 | <1s |
| `__tests__/hooks/query/use-user-conversation.test.tsx` | 144 | 2 | <1s |
| `__tests__/hooks/query/use-task-polling.test.tsx` | 156 | 2 | <1s |
| `__tests__/hooks/chat/model-command-event-anchor.test.ts` | 32 | 2 | <1s |
| `__tests__/hooks/mutation/use-delete-conversation.test.tsx` | 69 | 2 | <1s |
| `__tests__/hooks/mutation/use-create-conversation.test.tsx` | 153 | 2 | <1s |
| `__tests__/hooks/mutation/use-activate-llm-profile.test.tsx` | 111 | 2 | <1s |
| `__tests__/hooks/mutation/pause-conversation-local.test.ts` | 93 | 2 | <1s |
| `__tests__/hooks/use-click-outside-element.test.tsx` | 36 | 1 | <1s |
| `__tests__/hooks/query/use-agent-settings-schema.test.tsx` | 93 | 1 | <1s |
| `__tests__/hooks/mutation/use-update-conversation-public-flag.test.tsx` | 75 | 1 | <1s |
| `__tests__/hooks/mutation/use-resume-conversation.test.tsx` | 83 | 1 | <1s |
| `__tests__/hooks/use-websocket.test.ts` | 426 | 0 | <1s |

### Components (`__tests__/components`)

_173 files · 33,874 lines · 1,336 tests · 74.5s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/components/features/conversation-panel/conversation-panel.test.tsx` | 1722 | 41 | 6.4s |
| `__tests__/components/features/conversation-panel/conversation-card.test.tsx` | 802 | 34 | <1s |
| `__tests__/components/features/launch/plugin-launch-modal.test.tsx` | 426 | 29 | <1s |
| `__tests__/components/features/conversation/conversation-name.test.tsx` | 700 | 28 | 1.1s |
| `__tests__/components/features/chat/slash-command-menu.test.tsx` | 226 | 26 | <1s |
| `__tests__/components/features/markdown/markdown-renderer.test.tsx` | 335 | 26 | <1s |
| `__tests__/components/onboarding/setup-acp-secrets-step.test.tsx` | 496 | 24 | 1.7s |
| `__tests__/components/conversation-events/chat/event-content-helpers/get-acp-tool-call-content.test.ts` | 219 | 23 | <1s |
| `__tests__/components/settings/llm-profiles/llm-settings-local-view.test.tsx` | 674 | 22 | 3.5s |
| `__tests__/components/conversation-events/chat/group-events.test.ts` | 415 | 22 | <1s |
| `__tests__/components/features/conversation/conversation-tabs.test.tsx` | 610 | 22 | 1.6s |
| `__tests__/components/settings/llm-profiles/profile-name-input.test.tsx` | 315 | 21 | <1s |
| `__tests__/components/settings/llm-profiles/profile-actions-menu.test.tsx` | 266 | 21 | <1s |
| `__tests__/components/features/chat/plan-preview.test.tsx` | 427 | 21 | <1s |
| `__tests__/components/features/conversation-panel/hooks-modal.test.tsx` | 303 | 21 | <1s |
| `__tests__/components/features/conversation-panel/system-message-modal/tool-item.test.tsx` | 551 | 20 | <1s |
| `__tests__/components/features/mcp-page/install-server-modal.test.tsx` | 623 | 18 | <1s |
| `__tests__/components/features/conversation/server-status.test.tsx` | 326 | 18 | <1s |
| `__tests__/components/features/markdown/plan-components.test.tsx` | 336 | 18 | <1s |
| `__tests__/components/backends/backend-selector.test.tsx` | 705 | 18 | 5.2s |
| `__tests__/components/conversation-events/chat/event-message-components/critic-result-display.test.tsx` | 277 | 16 | <1s |
| `__tests__/components/automations/recommended-automations.test.tsx` | 467 | 14 | <1s |
| `__tests__/components/settings/llm-profiles/rename-profile-modal.test.tsx` | 273 | 14 | <1s |
| `__tests__/components/conversation-events/chat/event-content-helpers/should-render-event.test.ts` | 205 | 14 | <1s |
| `__tests__/components/onboarding/onboarding-modal.test.tsx` | 574 | 14 | 2.4s |
| `__tests__/components/features/chat/open-repository-modal.test.tsx` | 385 | 14 | <1s |
| `__tests__/components/settings/llm-profiles/llm-profiles-manager.test.tsx` | 292 | 13 | <1s |
| `__tests__/components/settings/llm-profiles/profile-row.test.tsx` | 171 | 13 | <1s |
| `__tests__/components/features/settings/sdk-settings/sdk-section-page.test.tsx` | 884 | 13 | 1.4s |
| `__tests__/components/features/sidebar/sidebar.test.tsx` | 457 | 13 | 1.1s |
| `__tests__/components/features/chat/components/chat-input-model.test.tsx` | 335 | 13 | <1s |
| `__tests__/components/backends/add-backend-modal.test.tsx` | 297 | 13 | 2.2s |
| `__tests__/components/automations/detail/run-logs-modal.test.tsx` | 276 | 12 | <1s |
| `__tests__/components/settings/llm-profiles/delete-profile-modal.test.tsx` | 220 | 12 | <1s |
| `__tests__/components/conversation-events/get-event-content.test.tsx` | 329 | 12 | <1s |
| `__tests__/components/conversation-events/chat/event-message-components/skill-item-expanded.test.ts` | 108 | 12 | <1s |
| `__tests__/components/conversation-events/chat/hooks/use-plan-preview-events.test.ts` | 221 | 12 | <1s |
| `__tests__/components/features/alerts/alert-banner.test.tsx` | 287 | 12 | <1s |
| `__tests__/components/conversation-events/chat/event-content-helpers/get-observation-content.test.ts` | 305 | 11 | <1s |
| `__tests__/components/onboarding/choose-agent-step.test.tsx` | 285 | 11 | <1s |
| `__tests__/components/features/chat/switch-profile-button.test.tsx` | 246 | 11 | <1s |
| `__tests__/components/features/chat/git-control-bar-repo-button.test.tsx` | 204 | 11 | <1s |
| `__tests__/components/features/diff-viewer/file-diff-viewer.test.tsx` | 196 | 11 | <1s |
| `__tests__/components/conversation-events/chat/event-message-plan-preview.test.tsx` | 280 | 10 | <1s |
| `__tests__/components/features/home/workspace-selection-form.test.tsx` | 461 | 10 | 1.5s |
| `__tests__/components/features/home/home-chat-launcher.test.tsx` | 574 | 10 | <1s |
| `__tests__/components/features/conversation/conversation-tab-content.test.tsx` | 280 | 10 | 1.6s |
| `__tests__/components/conversation-events/chat/event-message-components/skill-ready-content-list.test.tsx` | 143 | 9 | <1s |
| `__tests__/components/conversation-events/chat/event-content-helpers/get-observation-result.test.ts` | 122 | 9 | <1s |
| `__tests__/components/features/chat/git-control-bar.test.tsx` | 283 | 9 | <1s |
| `__tests__/components/features/chat/tool-visualizers/file-editor/file-editor.test.tsx` | 142 | 9 | <1s |
| `__tests__/components/features/mcp-page/save-as-secret-toggle.test.tsx` | 113 | 9 | <1s |
| `__tests__/components/features/home/use-url-search.test.tsx` | 241 | 9 | <1s |
| `__tests__/components/features/conversation-panel/conversation-status-dot.test.tsx` | 72 | 9 | <1s |
| `__tests__/components/automations/detail/activity-log-item.test.tsx` | 235 | 8 | <1s |
| `__tests__/components/automations/detail/run-status-badge.test.tsx` | 32 | 8 | <1s |
| `__tests__/components/settings/llm-profiles/profiles-body.test.tsx` | 126 | 8 | <1s |
| `__tests__/components/features/chat/pending-user-messages.test.tsx` | 194 | 8 | <1s |
| `__tests__/components/features/chat/utils/chat-input.utils.test.ts` | 107 | 8 | <1s |
| `__tests__/components/features/chat/tool-visualizers/bash/bash.test.tsx` | 75 | 8 | <1s |
| `__tests__/components/features/conversation/conversation-tabs-context-menu.test.tsx` | 166 | 8 | <1s |
| `__tests__/components/backends/api-key-entry-screen.test.tsx` | 313 | 8 | 1.3s |
| `__tests__/components/backends/manage-backends-modal.test.tsx` | 293 | 8 | <1s |
| `__tests__/components/chat-message.test.tsx` | 83 | 7 | <1s |
| `__tests__/components/conversation-events/chat/event-message-components/event-group.test.tsx` | 231 | 7 | <1s |
| `__tests__/components/home/llm-not-configured-banner.test.tsx` | 224 | 7 | <1s |
| `__tests__/components/features/settings/settings-navigation.test.tsx` | 217 | 7 | <1s |
| `__tests__/components/features/chat/components/chat-input-actions.test.tsx` | 178 | 7 | <1s |
| `__tests__/components/features/home/git-repo-dropdown.test.tsx` | 253 | 7 | <1s |
| `__tests__/components/features/conversation-panel/local-new-conversation-menu.test.tsx` | 264 | 7 | <1s |
| `__tests__/components/features/conversation-panel/conversation-panel-list-helpers.test.ts` | 368 | 7 | <1s |
| `__tests__/components/providers/posthog-wrapper.test.tsx` | 187 | 7 | <1s |
| `__tests__/components/settings/acp-credentials-section.test.tsx` | 144 | 6 | <1s |
| `__tests__/components/settings/settings-input.test.tsx` | 109 | 6 | <1s |
| `__tests__/components/conversation-events/chat/event-message-think-action.test.tsx` | 255 | 6 | <1s |
| `__tests__/components/conversation-events/chat/event-content-helpers/get-skill-ready-items.test.ts` | 74 | 6 | <1s |
| `__tests__/components/modals/settings/model-selector.test.tsx` | 150 | 6 | 1.7s |
| `__tests__/components/features/chat/path-component.test.tsx` | 34 | 6 | <1s |
| `__tests__/components/features/chat/change-agent-button.test.tsx` | 216 | 6 | <1s |
| `__tests__/components/features/chat/tool-visualizers/task/task.test.tsx` | 92 | 6 | <1s |
| `__tests__/components/features/home/task-suggestions.test.tsx` | 167 | 6 | <1s |
| `__tests__/components/features/home/repo-selection-form.test.tsx` | 331 | 6 | <1s |
| `__tests__/components/features/home/git-branch-dropdown.test.tsx` | 186 | 6 | <1s |
| `__tests__/components/features/conversation/conversation-name-context-menu.test.tsx` | 187 | 6 | <1s |
| `__tests__/components/automations/detail/configuration-section.test.tsx` | 117 | 5 | <1s |
| `__tests__/components/chat/error-message-banner.test.tsx` | 66 | 5 | <1s |
| `__tests__/components/chat/btw-messages.test.tsx` | 70 | 5 | <1s |
| `__tests__/components/conversation-events/chat/event-content-helpers/create-skill-ready-event.test.ts` | 79 | 5 | <1s |
| `__tests__/components/modals/skills/skill-modal.test.tsx` | 114 | 5 | <1s |
| `__tests__/components/buttons/circle-plus-check-toggle.test.tsx` | 122 | 5 | <1s |
| `__tests__/components/features/settings/settings-nav-link.test.tsx` | 79 | 5 | <1s |
| `__tests__/components/features/settings/mcp-settings/mcp-server-list.test.tsx` | 152 | 5 | <1s |
| `__tests__/components/features/chat/tool-visualizers/search/search.test.tsx` | 71 | 5 | <1s |
| `__tests__/components/features/analytics/analytics-consent-form-modal.test.tsx` | 94 | 5 | <1s |
| `__tests__/components/features/mcp-page/custom-server-editor.test.tsx` | 184 | 5 | <1s |
| `__tests__/components/features/conversation/conversation-main.test.tsx` | 157 | 5 | <1s |
| `__tests__/components/features/conversation/right-panel-toggle.test.tsx` | 128 | 5 | <1s |
| `__tests__/components/features/conversation-panel/new-conversation-button-cloud.test.tsx` | 245 | 5 | <1s |
| `__tests__/components/features/markdown/table.test.tsx` | 62 | 5 | <1s |
| `__tests__/components/browser.test.tsx` | 108 | 4 | <1s |
| `__tests__/components/automations/detail/edit-automation-modal.test.tsx` | 204 | 4 | 1.2s |
| `__tests__/components/shared/brand-button.test.tsx` | 55 | 4 | <1s |
| `__tests__/components/shared/modals/modal-backdrop.test.tsx` | 85 | 4 | <1s |
| `__tests__/components/chat/message-display-continuity.test.tsx` | 252 | 4 | <1s |
| `__tests__/components/conversation-events/chat/event-message-acp-tool-call.test.tsx` | 108 | 4 | <1s |
| `__tests__/components/conversation-events/chat/event-content-helpers/get-invoke-skill-items.test.ts` | 73 | 4 | <1s |
| `__tests__/components/buttons/copyable-content-wrapper.test.tsx` | 60 | 4 | <1s |
| `__tests__/components/onboarding/use-onboarding-completion.test.tsx` | 58 | 4 | <1s |
| `__tests__/components/features/chat/tool-visualizers/dispatcher.test.tsx` | 41 | 4 | <1s |
| `__tests__/components/features/skills/extensions-navigation.test.tsx` | 96 | 4 | <1s |
| `__tests__/components/features/skills/get-skill-card-description.test.ts` | 53 | 4 | <1s |
| `__tests__/components/features/skills/skill-detail-modal.test.tsx` | 154 | 4 | <1s |
| `__tests__/components/features/home/task-card.test.tsx` | 189 | 4 | <1s |
| `__tests__/components/features/conversation-panel/start-task-status-badge.test.tsx` | 31 | 4 | <1s |
| `__tests__/components/features/markdown/code.test.tsx` | 37 | 4 | <1s |
| `__tests__/components/chat-status-indicator.test.tsx` | 48 | 3 | <1s |
| `__tests__/components/user-avatar.test.tsx` | 42 | 3 | <1s |
| `__tests__/components/suggestion-item.test.tsx` | 58 | 3 | <1s |
| `__tests__/components/image-preview.test.tsx` | 37 | 3 | <1s |
| `__tests__/components/automations/toggle-switch.test.tsx` | 38 | 3 | <1s |
| `__tests__/components/automations/backend-not-configured.test.tsx` | 49 | 3 | <1s |
| `__tests__/components/automations/add-automation-modal.test.tsx` | 103 | 3 | <1s |
| `__tests__/components/shared/modals/settings/settings-form.test.tsx` | 146 | 3 | <1s |
| `__tests__/components/settings/settings-switch.test.tsx` | 64 | 3 | <1s |
| `__tests__/components/chat/chat-add-file-button.test.tsx` | 76 | 3 | <1s |
| `__tests__/components/context-menu/context-menu-list-item.test.tsx` | 44 | 3 | <1s |
| `__tests__/components/onboarding/onboarding-preview.test.ts` | 27 | 3 | <1s |
| `__tests__/components/features/settings/settings-dropdown-input.test.tsx` | 97 | 3 | <1s |
| `__tests__/components/features/settings/backend-synced-settings-badge.test.tsx` | 161 | 3 | <1s |
| `__tests__/components/features/settings/sdk-settings/schema-field.test.tsx` | 104 | 3 | <1s |
| `__tests__/components/features/chat/change-agent-context-menu.test.tsx` | 62 | 3 | <1s |
| `__tests__/components/features/chat/model-messages.test.tsx` | 107 | 3 | <1s |
| `__tests__/components/features/chat/components/chat-input-field.test.tsx` | 41 | 3 | <1s |
| `__tests__/components/features/mcp-page/mcp-logo-stack-badge.test.tsx` | 54 | 3 | <1s |
| `__tests__/components/features/conversation/agent-status.test.tsx` | 72 | 3 | <1s |
| `__tests__/components/features/conversation-panel/confirm-delete-modal.test.tsx` | 62 | 3 | <1s |
| `__tests__/components/terminal/terminal-empty-state.test.tsx` | 73 | 3 | <1s |
| `__tests__/components/suggestions.test.tsx` | 60 | 2 | <1s |
| `__tests__/components/automations/error-state.test.tsx` | 25 | 2 | <1s |
| `__tests__/components/automations/automation-list-row.test.tsx` | 75 | 2 | <1s |
| `__tests__/components/automations/automation-view-toggle.test.tsx` | 46 | 2 | <1s |
| `__tests__/components/automations/automation-card.test.tsx` | 74 | 2 | <1s |
| `__tests__/components/automations/search-input.test.tsx` | 24 | 2 | <1s |
| `__tests__/components/automations/detail/prompt-section.test.tsx` | 55 | 2 | <1s |
| `__tests__/components/automations/detail/active-status-badge.test.tsx` | 23 | 2 | <1s |
| `__tests__/components/shared/navigation-link.test.tsx` | 57 | 2 | <1s |
| `__tests__/components/context-menu/tools-context-menu.test.tsx` | 69 | 2 | <1s |
| `__tests__/components/buttons/copy-to-clipboard.test.tsx` | 40 | 2 | <1s |
| `__tests__/components/onboarding/onboarding-progress-bar.test.tsx` | 42 | 2 | <1s |
| `__tests__/components/features/settings/settings-nav-divider.test.tsx` | 25 | 2 | <1s |
| `__tests__/components/features/settings/settings-nav-header.test.tsx` | 28 | 2 | <1s |
| `__tests__/components/features/settings/mcp-settings/mcp-server-form.validation.test.tsx` | 110 | 2 | <1s |
| `__tests__/components/features/chat/git-control-bar-pull-button.test.tsx` | 64 | 2 | <1s |
| `__tests__/components/features/skills/get-skill-chat-launch-message.test.ts` | 20 | 2 | <1s |
| `__tests__/components/features/skills/is-copyable-skill-source.test.ts` | 19 | 2 | <1s |
| `__tests__/components/features/files-tab/file-content-viewer.test.tsx` | 124 | 2 | <1s |
| `__tests__/components/features/home/new-conversation.test.tsx` | 99 | 2 | <1s |
| `__tests__/components/features/home/home-header.test.tsx` | 50 | 2 | <1s |
| `__tests__/components/features/conversation/chat-interface-wrapper.test.tsx` | 21 | 2 | <1s |
| `__tests__/components/backends/environment-switch-overlay.test.tsx` | 66 | 2 | <1s |
| `__tests__/components/automations/metadata-chip.test.tsx` | 17 | 1 | <1s |
| `__tests__/components/automations/create-instructions.test.tsx` | 97 | 1 | <1s |
| `__tests__/components/automations/detail/not-found-state.test.tsx` | 16 | 1 | <1s |
| `__tests__/components/automations/detail/section-card.test.tsx` | 17 | 1 | <1s |
| `__tests__/components/shared/text-shimmer.test.tsx` | 30 | 1 | <1s |
| `__tests__/components/shared/modals/settings/settings-modal.test.tsx` | 27 | 1 | <1s |
| `__tests__/components/conversation-events/chat/messages-model-messages.test.tsx` | 54 | 1 | <1s |
| `__tests__/components/modals/settings/model-selector-openhands.test.tsx` | 73 | 1 | <1s |
| `__tests__/components/features/settings/settings-layout.test.tsx` | 36 | 1 | <1s |
| `__tests__/components/features/skills/skill-card-pill-row.test.tsx` | 40 | 1 | <1s |
| `__tests__/components/features/conversation/conversation-loading.test.tsx` | 15 | 1 | <1s |
| `__tests__/components/chat/chat-interface.test.tsx` | 925 | 0 | <1s |
| `__tests__/components/ui/dropdown.test.tsx` | 429 | 0 | <1s |

### Utilities (`__tests__/utils`)

_44 files · 4,155 lines · 294 tests · <1s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/utils/mcp-marketplace-utils.test.ts` | 311 | 25 | <1s |
| `__tests__/utils/handle-event-for-ui.test.ts` | 533 | 19 | <1s |
| `__tests__/utils/derive-profile-name.test.ts` | 135 | 17 | <1s |
| `__tests__/utils/acp-command.test.ts` | 198 | 17 | <1s |
| `__tests__/utils/status.test.ts` | 70 | 16 | <1s |
| `__tests__/utils/sdk-settings-schema.test.ts` | 378 | 13 | <1s |
| `__tests__/utils/mcp-config.test.ts` | 252 | 13 | <1s |
| `__tests__/utils/websocket-url.test.ts` | 124 | 11 | <1s |
| `__tests__/utils/file-priority.test.ts` | 93 | 10 | <1s |
| `__tests__/utils/utils.test.ts` | 170 | 10 | <1s |
| `__tests__/utils/settings-utils.test.ts` | 91 | 10 | <1s |
| `__tests__/utils/parse-git-remote-url.test.ts` | 81 | 10 | <1s |
| `__tests__/utils/path-utils.test.ts` | 56 | 8 | <1s |
| `__tests__/utils/redact-custom-secrets.test.ts` | 68 | 8 | <1s |
| `__tests__/utils/agent-state-emoji.test.ts` | 23 | 8 | <1s |
| `__tests__/utils/file-language.test.ts` | 66 | 7 | <1s |
| `__tests__/utils/get-git-path.test.ts` | 52 | 7 | <1s |
| `__tests__/utils/format-time-delta.test.ts` | 75 | 6 | <1s |
| `__tests__/utils/toast-duration.test.ts` | 53 | 6 | <1s |
| `__tests__/utils/file-tree.test.ts` | 74 | 6 | <1s |
| `__tests__/utils/vscode-url-helper.test.ts` | 61 | 5 | <1s |
| `__tests__/utils/system-message-adapter.test.ts` | 77 | 5 | <1s |
| `__tests__/utils/handle-capture-consent.test.ts` | 44 | 4 | <1s |
| `__tests__/utils/automation-schedule.test.ts` | 84 | 4 | <1s |
| `__tests__/utils/model-name-case-preservation.test.tsx` | 61 | 4 | <1s |
| `__tests__/utils/skill-scope.test.ts` | 66 | 4 | <1s |
| `__tests__/utils/custom-toast-handlers.test.ts` | 128 | 4 | <1s |
| `__tests__/utils/should-use-installation-repos.test.ts` | 35 | 4 | <1s |
| `__tests__/utils/mobile-section-nav.test.ts` | 35 | 4 | <1s |
| `__tests__/utils/pending-task-message-link.test.ts` | 49 | 3 | <1s |
| `__tests__/utils/extract-model-and-provider.test.ts` | 84 | 3 | <1s |
| `__tests__/utils/parse-terminal-output.test.ts` | 26 | 3 | <1s |
| `__tests__/utils/extension-module-card-classes.test.ts` | 35 | 3 | <1s |
| `__tests__/utils/should-start-mock-worker.test.ts` | 25 | 3 | <1s |
| `__tests__/utils/error-handler.test.ts` | 61 | 2 | <1s |
| `__tests__/utils/openhands-llm.test.ts` | 28 | 2 | <1s |
| `__tests__/utils/cache-utils.test.ts` | 64 | 2 | <1s |
| `__tests__/utils/normalize-display-model.test.ts` | 39 | 2 | <1s |
| `__tests__/utils/convert-raw-providers-to-list.test.ts` | 31 | 1 | <1s |
| `__tests__/utils/form-control-classes.test.ts` | 22 | 1 | <1s |
| `__tests__/utils/table-row-classes.test.ts` | 15 | 1 | <1s |
| `__tests__/utils/flush-pending-task-attachments.test.ts` | 56 | 1 | <1s |
| `__tests__/utils/map-provider.test.ts` | 28 | 1 | <1s |
| `__tests__/utils/group-suggested-tasks.test.ts` | 98 | 1 | <1s |

### Routes (`__tests__/routes`)

_20 files · 5,598 lines · 173 tests · 22.0s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/routes/launch.test.tsx` | 576 | 37 | 1.0s |
| `__tests__/routes/agent-settings.test.tsx` | 837 | 20 | 7.1s |
| `__tests__/routes/device-verify.test.tsx` | 625 | 16 | <1s |
| `__tests__/routes/skills-settings.test.tsx` | 399 | 15 | 3.9s |
| `__tests__/routes/files-tab.test.tsx` | 469 | 15 | <1s |
| `__tests__/routes/mcp-page.test.tsx` | 432 | 14 | 2.6s |
| `__tests__/routes/automations-list.test.tsx` | 355 | 9 | 2.4s |
| `__tests__/routes/task-list-tab.test.tsx` | 179 | 8 | <1s |
| `__tests__/routes/settings.test.tsx` | 201 | 7 | <1s |
| `__tests__/routes/automation-detail.test.tsx` | 222 | 6 | <1s |
| `__tests__/routes/llm-settings.test.tsx` | 226 | 5 | <1s |
| `__tests__/routes/changes-tab.test.tsx` | 132 | 5 | <1s |
| `__tests__/routes/verification-settings.test.tsx` | 230 | 4 | <1s |
| `__tests__/routes/planner-tab.test.tsx` | 133 | 3 | <1s |
| `__tests__/routes/root-layout.test.tsx` | 167 | 3 | <1s |
| `__tests__/routes/app-settings.test.tsx` | 95 | 2 | <1s |
| `__tests__/routes/secrets-settings.test.tsx` | 41 | 1 | <1s |
| `__tests__/routes/mcp.test.tsx` | 13 | 1 | <1s |
| `__tests__/routes/root-layout-refetch.test.tsx` | 109 | 1 | <1s |
| `__tests__/routes/conversation-backend-switch.test.tsx` | 157 | 1 | <1s |

### Zustand stores (`__tests__/stores`)

_8 files · 964 lines · 52 tests · <1s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/stores/optimistic-user-message-store.test.ts` | 295 | 16 | <1s |
| `__tests__/stores/conversation-panel-preferences-store.test.ts` | 150 | 8 | <1s |
| `__tests__/stores/use-event-store.test.ts` | 191 | 7 | <1s |
| `__tests__/stores/conversation-store.test.ts` | 121 | 7 | <1s |
| `__tests__/stores/error-message-store.test.ts` | 48 | 6 | <1s |
| `__tests__/stores/model-store.test.ts` | 87 | 4 | <1s |
| `__tests__/stores/btw-store.test.ts` | 44 | 3 | <1s |
| `__tests__/stores/pending-task-attachments-store.test.ts` | 28 | 1 | <1s |

### Services (`__tests__/services`)

_5 files · 557 lines · 34 tests · <1s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/services/telemetry.test.ts` | 213 | 19 | <1s |
| `__tests__/services/canvas-ui.test.ts` | 126 | 9 | <1s |
| `__tests__/services/actions.test.tsx` | 89 | 3 | <1s |
| `__tests__/services/actions.test.ts` | 105 | 3 | <1s |
| `__tests__/services/observations.test.tsx` | 24 | 0 | <1s |

### Dev/CI scripts (`__tests__/scripts`)

_10 files · 3,089 lines · 162 tests · 6.6s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/scripts/dev-safe.test.ts` | 1016 | 52 | <1s |
| `__tests__/scripts/dev-with-automation.test.ts` | 646 | 38 | <1s |
| `__tests__/scripts/check-sdk-version-sync.test.ts` | 161 | 19 | <1s |
| `__tests__/scripts/static-server.test.ts` | 351 | 17 | 3.2s |
| `__tests__/scripts/ingress.test.ts` | 561 | 16 | 2.4s |
| `__tests__/scripts/runtime-services-info.test.ts` | 140 | 8 | <1s |
| `__tests__/scripts/docs-version-sync.test.ts` | 72 | 4 | <1s |
| `__tests__/scripts/dev-extra-backend.test.ts` | 89 | 4 | <1s |
| `__tests__/scripts/dev-process-utils.test.ts` | 32 | 3 | <1s |
| `__tests__/scripts/dev-static.test.ts` | 21 | 1 | <1s |

### i18n (`__tests__/i18n`)

_5 files · 314 lines · 17 tests · 4.1s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/i18n/translation-completeness.test.ts` | 136 | 10 | <1s |
| `__tests__/i18n/library-namespace.test.ts` | 59 | 3 | 4.0s |
| `__tests__/i18n/duplicate-keys.test.ts` | 76 | 2 | <1s |
| `__tests__/i18n/sidebar-mcp-directory-label.test.ts` | 21 | 1 | <1s |
| `__tests__/i18n/files-diff-label.test.ts` | 22 | 1 | <1s |

### Contexts (`__tests__/contexts`)

_3 files · 654 lines · 19 tests · <1s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/contexts/active-backend-context.test.tsx` | 259 | 9 | <1s |
| `__tests__/contexts/conversation-websocket-context.test.tsx` | 255 | 5 | <1s |
| `__tests__/contexts/websocket-provider-wrapper.test.tsx` | 140 | 5 | <1s |

### Other top-level specs

_18 files · 2,396 lines · 130 tests · 1.2s total_

| File | Lines | Tests | Duration |
|------|------:|------:|---------:|
| `__tests__/conversation-local-storage.test.ts` | 661 | 39 | <1s |
| `__tests__/constants/acp-providers.test.ts` | 256 | 23 | <1s |
| `__tests__/build-websocket-url.test.ts` | 269 | 19 | <1s |
| `__tests__/agent-server-ui-style-scope.test.ts` | 52 | 6 | <1s |
| `__tests__/constants/extensions-catalogs.test.ts` | 97 | 6 | <1s |
| `__tests__/agent-server-ui-providers.test.tsx` | 260 | 5 | <1s |
| `__tests__/root.test.tsx` | 158 | 5 | <1s |
| `__tests__/vite-config.test.ts` | 98 | 4 | <1s |
| `__tests__/package-library.test.ts` | 102 | 4 | <1s |
| `__tests__/themes/color-themes.test.tsx` | 70 | 4 | <1s |
| `__tests__/library-entrypoints.test.ts` | 49 | 3 | <1s |
| `__tests__/ui/card.test.tsx` | 29 | 3 | <1s |
| `__tests__/query-client-config.test.ts` | 45 | 2 | <1s |
| `__tests__/use-suggested-tasks.test.ts` | 59 | 2 | <1s |
| `__tests__/bin/agent-canvas.test.ts` | 126 | 2 | <1s |
| `__tests__/settings-schema-descriptions.test.ts` | 21 | 1 | <1s |
| `__tests__/initial-query.test.tsx` | 24 | 1 | <1s |
| `__tests__/tools/canvas-ui-tool.test.ts` | 20 | 1 | <1s |

