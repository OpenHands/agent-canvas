# Test Design Quality Report

Evaluation of the `@openhands/agent-canvas` test suite using Dave Farley's 8
Properties of Good Tests.

**Reference**: [Dave Farley's Properties of Good Tests](https://www.linkedin.com/pulse/tdd-properties-good-tests-dave-farley-iexge/)
**Method**: [test-design-reviewer skill](https://github.com/citypaul/.dotfiles/blob/main/claude/.claude/skills/test-design-reviewer/SKILL.md)

> This report is informational. It was produced to capture a point-in-time
> assessment of test quality; it does not change any product code or tests.

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Farley Score** | **7.9/10 (Excellent)** |
| Tests Passed | 3,144 passed · 5 skipped · 9 todo (3,158) ✅ |
| Unit/Component Test Files Analyzed | 414 (405 `__tests__` + 9 co-located `src`) |
| E2E Spec Files | 18 (`tests/e2e` — mock-LLM, live, ACP) |
| Statement Coverage | 77.56% (14,983 / 19,317) |
| Branch Coverage | 67.82% (9,133 / 13,465) |
| Function Coverage | 75.23% (3,253 / 4,324) |
| Line Coverage | 78.59% (14,338 / 18,242) |
| Unit Suite Test Duration | ~137s (full run ~336s incl. transform/setup/import) |

The agent-canvas unit/component suite demonstrates high-quality engineering
practices: behavior-driven test names that read as specifications, a shared
`renderWithProviders` harness plus per-domain factory helpers, MSW-backed HTTP
isolation, and dedicated WebSocket test infrastructure. Coverage is broad and the
suite is fast per-test (~45ms average across 3,030 measured unit tests). The
main opportunities are reducing heavy `vi.mock` coupling in some component
tests, trimming redundancy across near-identical component variants, and
shoring up the small set of documented flaky-timing spots.

---

## Aggregate Property Scores

| Property | Score | Evidence |
|----------|-------|----------|
| Understandable | 8.5/10 | Behavioral names like _"omits browser_tool_set and task_tool_set when the server does not advertise them"_ and _"does not group user messages"_ read as specs; `describe` blocks group by behavior; non-obvious setup is commented. |
| Maintainable | 8.0/10 | Shared `test-utils.tsx` (`renderWithProviders`, navigation/i18n/query providers), factory helpers (`createMockConversation`, `makeConnector`), MSW handlers, and reusable WebSocket helpers. Offset by heavy `vi.mock` usage (214 of 405 files) that couples some tests to module structure. |
| Repeatable | 8.0/10 | Deterministic jsdom + MSW; `beforeEach` mock resets. A handful of documented timing-sensitive specs (`use-websocket` onClose, i18n namespace timeout, framer-motion teardown) required explicit mitigations rather than being inherently stable. |
| Atomic | 8.5/10 | Fresh `QueryClient` per render, `beforeEach`/`afterEach` resets, isolated store seeding. Serial mock-LLM E2E specs share a live agent-server and rely on `afterEach`/`afterAll` resets for ordering. |
| Necessary | 7.5/10 | 3,030+ unit tests cover critical paths plus valuable guard tests (`no-direct-agent-server-calls`, translation completeness). Some redundancy across many small component-variant tests. |
| Granular | 8.0/10 | Pure-logic suites (`group-events`, `mcp-marketplace-utils`, stores) assert one behavior each; some component integration tests (e.g. `conversation-panel`, 41 tests) span multiple interactions. |
| Fast | 7.0/10 | ~45ms/test average and most files <1s; offset by ~150s of fixed setup/import overhead and a tail of 3–7s jsdom-heavy specs. E2E is correctly isolated from the unit run. |
| First (TDD) | 7.0/10 | Behavior-first naming and `@spec`-tagged tests suggest test-informed design; no explicit commit-history evidence of strict test-first, so scored conservatively. |

**Farley Score Calculation**:

```
(8.5×1.5 + 8.0×1.5 + 8.0×1.25 + 8.5×1.0 + 7.5×1.0 + 8.0×1.0 + 7.0×0.75 + 7.0×1.0) / 9
= (12.75 + 12.0 + 10.0 + 8.5 + 7.5 + 8.0 + 5.25 + 7.0) / 9
= 71.0 / 9
= 7.9
```

---

## Scores by Test Category

| Category | Files | Tests | Duration | Farley | Rating |
|----------|------:|------:|---------:|:------:|--------|
| API / adapter layer (`__tests__/api`) | 51 | 429 | 10.3s | 8.2 | Excellent |
| Utilities (`__tests__/utils`) | 44 | 294 | 0.7s | 8.6 | Excellent |
| Zustand stores (`__tests__/stores`) | 8 | 52 | 0.2s | 8.5 | Excellent |
| Hooks (`__tests__/hooks`) | 68 | 384 | 16.8s | 7.9 | Excellent |
| Components (`__tests__/components`) | 173 | 1,336 | 74.5s | 7.4 | Good |
| Routes (`__tests__/routes`) | 20 | 173 | 22.0s | 7.3 | Good |
| Dev/CI scripts (`__tests__/scripts`) | 10 | 162 | 6.6s | 8.0 | Excellent |
| Services (`__tests__/services`) | 5 | 34 | 0.5s | 8.3 | Excellent |
| i18n (`__tests__/i18n`) | 5 | 17 | 4.1s | 7.6 | Excellent |
| Contexts (`__tests__/contexts`) | 3 | 19 | 0.5s | 8.2 | Excellent |
| E2E (`tests/e2e` mock-LLM/live) | 18 | — | (separate) | 8.0 | Excellent |

---

## Detailed Analysis by Category

### 1. API / Adapter Layer — Farley 8.2 (Excellent)

The strongest part of the suite. Pure builders/services tested through their
public contract with `vi.hoisted` mocks for config and backend lookups.

| Property | Score | Evidence |
|----------|-------|----------|
| Understandable | 9/10 | Names enumerate exact behavior (tool gating, secret delivery, model fallback). |
| Maintainable | 8/10 | `DEFAULT_SETTINGS` fixtures and focused module mocks; some breakage risk if module shapes change. |
| Repeatable | 9/10 | No network; `beforeEach` resets mock return values. |
| Atomic | 9/10 | Each test builds its own payload; no cross-test state. |
| Necessary | 8/10 | Covers contract edges (ACP secrets, encrypted settings, `canvas_ui` injection). |
| Granular | 8/10 | `it.each` for the model-fallback matrix; one behavior per case. |
| Fast | 7/10 | Mostly <1s; `settings-service` (4.7s) and `automation-handlers` (2.9s) are outliers. |
| First | 8/10 | Contract-first naming; `@spec LLD-001` ties tests to specs. |

**Exemplary**: `agent-server-adapter.test.ts` — 70 tests in <1s, behavioral
naming, `it.each` matrices.

### 2. Utilities & Stores — Farley 8.6 / 8.5 (Excellent)

Model unit-test practice: pure functions and Zustand stores with single-behavior
assertions and instant execution (44 util files run in ~0.7s total).

**Exemplary**: `group-events.test.ts`, `mcp-marketplace-utils.test.ts` —
crisp `describe`/`it` structure, defensive cases explicitly named
(_"returns null when servers carry malformed urls (defensive)"_).

### 3. Hooks — Farley 7.9 (Excellent)

React Query and WebSocket hooks tested with `renderHook` + MSW. Mostly fast and
deterministic; a few query/backend-switch specs (up to 7.3s) and the documented
`use-websocket` onClose timing mitigation pull the category down slightly.

### 4. Components — Farley 7.4 (Good)

The largest category (173 files, 1,336 tests). User-centric naming and the
shared `renderWithProviders` harness keep these readable, but they carry the
most `vi.mock` coupling and the slowest jsdom renders (`conversation-panel` 6.4s,
`backend-selector` 5.2s). Some redundancy across near-identical component
variants.

### 5. Routes — Farley 7.3 (Good)

Route-level integration tests (`agent-settings` 7.1s, `skills-settings` 3.9s)
exercise real screens against MSW. Valuable but broad-scoped and the slowest
average per test.

### 6. Dev/CI Scripts & Services — Farley 8.0 / 8.3 (Excellent)

`dev-safe`, `dev-with-automation`, `ingress`, `static-server` are covered with
focused, fast Node-environment tests — unusual and welcome coverage of launcher
plumbing.

---

## Top Recommendations

### 1. Reduce `vi.mock` coupling in component tests (High Impact)
214 of 405 files use `vi.mock`. Where a component only needs HTTP, prefer MSW
handlers over module mocks so tests survive refactors of internal module
boundaries. This most affects the Components category (lowest maintainability).

### 2. Tame the slow tail (Medium Impact)
A handful of specs dominate wall-clock: `use-automations-backend-switch` (7.3s),
`agent-settings` (7.1s), `conversation-panel` (6.4s), `backend-selector` (5.2s),
`settings-service` (4.7s). Split by behavior and trim redundant `waitFor`
polling to recover developer-loop speed.

### 3. Stabilize documented flaky spots (Medium Impact)
`AGENTS.md` already records mitigations for `use-websocket` onClose timing, the
i18n namespace timeout, and framer-motion teardown. Convert these from
"explicit-timeout workaround" to inherently deterministic setups (stubbed clocks,
narrowed imports) so Repeatable rises toward 9.

### 4. Lift coverage on untested modules (Medium Impact)
Several shipped modules sit at 0% statement coverage, e.g.:
- `src/routes/shared-conversation.tsx`
- `src/utils/send-message-with-attachments.ts`
- `src/hooks/use-bash-command-runner.ts` (12.7%)
- `src/hooks/use-drag-resize.ts` (13.8%)
- `src/hooks/chat/use-chat-attachment-upload.ts` (7.7%)

### 5. Trim redundancy across component variants (Low Impact)
Some component suites assert the same rendering branch across many near-identical
cases. Consolidate with `it.each` to keep each test Necessary and Granular.

---

## Files with Exemplary Test Quality

| File | Est. Farley | Notable Patterns |
|------|:-----------:|------------------|
| `__tests__/api/agent-server-adapter.test.ts` | 8.6 | 70 contract tests in <1s; `it.each` matrices |
| `__tests__/components/conversation-events/chat/group-events.test.ts` | 8.7 | Pure logic, one behavior per test |
| `__tests__/utils/mcp-marketplace-utils.test.ts` | 8.6 | Defensive cases named explicitly |
| `__tests__/api/git-service.test.ts` | 8.5 | 32 tests in <1s, focused |
| `__tests__/stores/*` | 8.5 | Deterministic store behavior, instant |

---

## Areas Needing Improvement

| File / Area | Est. Farley | Primary Issue |
|-------------|:-----------:|---------------|
| `__tests__/components/features/conversation-panel/conversation-panel.test.tsx` | 7.2 | Broad scope (41 tests), 6.4s, heavy mocking |
| `__tests__/routes/agent-settings.test.tsx` | 7.1 | Slowest route spec (7.1s) |
| `__tests__/hooks/query/use-automations-backend-switch.test.tsx` | 7.0 | 4 tests / 7.3s — slow per test |
| Components category generally | 7.4 | UI coupling, render speed, redundancy |

---

## Conclusion

The agent-canvas test suite earns an **Excellent** rating (**7.9/10**) on Dave
Farley's framework. Standout strengths:

1. **Behavior-driven naming** that reads as living documentation.
2. **Strong shared infrastructure** — `renderWithProviders`, factories, MSW,
   WebSocket helpers — that keeps tests maintainable at 405-file scale.
3. **Broad, fast unit coverage** (3,000+ tests, ~45ms/test) with E2E correctly
   isolated into mock-LLM and live tiers.

Primary opportunities: reduce `vi.mock` coupling in component tests, tame the
slow jsdom tail, make the documented flaky spots inherently deterministic, and
close the small set of 0%-coverage modules.

See [`TEST_QUALITY_PER_FILE_REPORT.md`](./TEST_QUALITY_PER_FILE_REPORT.md) for
the per-file audit and the full measured metrics appendix.

---

### Reference
This review is based on Dave Farley's Properties of Good Tests:
https://www.linkedin.com/pulse/tdd-properties-good-tests-dave-farley-iexge/
