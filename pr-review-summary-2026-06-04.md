# PRs Merged in the Last 24 Hours — E2E Mock-LLM Coverage Analysis

**Generated:** 2026-06-04T16:28 UTC  
**Window:** 2026-06-03 16:29 UTC → 2026-06-04 16:07 UTC  
**Total PRs:** 19 (excluding CI-only and docs-only)

---

## Summary Table

| PR | Title | Author | Type | Added Mock-LLM E2E? | E2E Coverage Recommended? |
|----|-------|--------|------|---------------------|---------------------------|
| [#1127](https://github.com/OpenHands/agent-canvas/pull/1127) | fix: prevent deletion of the active LLM profile | @tofarr | Bug fix | ❌ No | ✅ Yes |
| [#1123](https://github.com/OpenHands/agent-canvas/pull/1123) | fix: show the correct LLM profile per conversation | @VascoSch92 | Bug fix | ❌ No | ✅ Yes |
| [#1122](https://github.com/OpenHands/agent-canvas/pull/1122) | fix: do not gate skills modal on runtime readiness | @hieptl | Bug fix | ❌ No | ⚠️ Moderate |
| [#1121](https://github.com/OpenHands/agent-canvas/pull/1121) | fix: route automation requests through cloud proxy | @hieptl | Bug fix | ❌ No | ➖ Low (cloud-only) |
| [#1120](https://github.com/OpenHands/agent-canvas/pull/1120) | fix: route every cloud call through /api/cloud-proxy | @chuckbutkus | Bug fix | ❌ No | ➖ Low (cloud-only) |
| [#1109](https://github.com/OpenHands/agent-canvas/pull/1109) | fix: route LLM metadata fetches through cloud proxy | @tofarr | Bug fix | ❌ No | ➖ Low (cloud-only) |
| [#1107](https://github.com/OpenHands/agent-canvas/pull/1107) | fix: keep tmux sockets under ~/.openhands on macOS | @xingyaoww | Bug fix (dev) | ❌ No | ➖ No (dev tooling) |
| [#1106](https://github.com/OpenHands/agent-canvas/pull/1106) | fix: resolve relative working dirs for file upload | @chuckbutkus | Bug fix | ✅ Yes | ✅ Already covered |
| [#1105](https://github.com/OpenHands/agent-canvas/pull/1105) | test: add onboarding regression E2E coverage | @enyst | Test | ✅ Yes | ✅ This IS the coverage |
| [#1104](https://github.com/OpenHands/agent-canvas/pull/1104) | fix: dual-stack binding for static-server (Docker) | @malhotra5 | Bug fix (infra) | ✅ Yes (adjusted) | ✅ Already covered |
| [#1101](https://github.com/OpenHands/agent-canvas/pull/1101) | fix: public mode auth gate bypasses stored keys | @malhotra5 | Bug fix | ✅ Yes | ✅ Already covered |
| [#1100](https://github.com/OpenHands/agent-canvas/pull/1100) | fix: keep modal open on errant outside click | @hieptl | Bug fix | ❌ No | ✅ Covered by #1105 |
| [#1097](https://github.com/OpenHands/agent-canvas/pull/1097) | chore: bump openhands-automation to 1.0.0a6 | @tofarr | Chore | ❌ No | ➖ No (version bump) |
| [#1095](https://github.com/OpenHands/agent-canvas/pull/1095) | Polish onboarding modal flow and final-step UX | @FraterCCCLXIII | Feature/polish | ❌ No | ✅ Yes |
| [#1091](https://github.com/OpenHands/agent-canvas/pull/1091) | fix: expose session key via window global for fresh installs | @chuckbutkus | Bug fix | ✅ Yes | ✅ Already covered |
| [#1089](https://github.com/OpenHands/agent-canvas/pull/1089) | fix: default LLM setup to Anthropic Claude Opus 4.8 | @hieptl | Bug fix | ❌ No | ✅ Covered by #1105 |
| [#1036](https://github.com/OpenHands/agent-canvas/pull/1036) | feat: add posthog events for install, conversation creation, automations | @HeyItsChloe | Feature | ❌ No | ➖ Low (analytics) |
| [#995](https://github.com/OpenHands/agent-canvas/pull/995) | feat: let ACP agents configure MCP servers | @simonrosenberg | Feature | ❌ No | ⚠️ Moderate |
| [#1070](https://github.com/OpenHands/agent-canvas/pull/1070) | Update Docker image version in README | @rbren | Docs | ❌ No | ➖ No (docs only) |
| [#1108](https://github.com/OpenHands/agent-canvas/pull/1108) | ci: skip tests on Windows matrix | @malhotra5 | CI | ❌ No | ➖ No (CI config) |

---

## Detailed Analysis

### PRs That Already Added Mock-LLM E2E Coverage ✅

#### [#1106](https://github.com/OpenHands/agent-canvas/pull/1106) — fix(upload): resolve relative working dirs against /api/file/home
- **Author:** @chuckbutkus
- **What:** File upload path resolution was broken for relative working directories; the upload endpoint now resolves `workspace/project` against `/api/file/home` to get the absolute path.
- **E2E change:** Updated `mock-llm-image-upload.spec.ts` and `mock-llm-server.py` to reflect the new upload path resolution flow.

#### [#1105](https://github.com/OpenHands/agent-canvas/pull/1105) — test: add onboarding regression E2E coverage
- **Author:** @enyst
- **What:** Dedicated test-only PR that added `mock-llm-onboarding-regressions.spec.ts` covering two recent regressions:
  - Modal not dismissible by backdrop click or Escape (regression from #1100)
  - Default LLM should be Anthropic, not OpenHands (regression from #1089)
- **E2E change:** New spec file + shared `onboarding-helpers.ts` support utilities.

#### [#1104](https://github.com/OpenHands/agent-canvas/pull/1104) — fix: dual-stack binding for static-server
- **Author:** @malhotra5
- **What:** Static server and ingress now bind to `::` (dual-stack) so both IPv4 and IPv6 connections work in Docker and CI.
- **E2E change:** Adjusted `mock-llm-cross-connect.spec.ts` and `mock-llm-partial-stack.spec.ts` to work with the new binding.

#### [#1101](https://github.com/OpenHands/agent-canvas/pull/1101) — fix: public mode auth gate bypasses stored backend keys
- **Author:** @malhotra5
- **What:** The public-mode auth screen (`ApiKeyEntryScreen`) was shown even when a valid key was already stored in localStorage. Fixed `root.tsx` to check stored backend keys before gating.
- **E2E change:** Updated `mock-llm-auth-modes.spec.ts` with new test cases for the key-rotation and stale-key recovery scenarios.

#### [#1091](https://github.com/OpenHands/agent-canvas/pull/1091) — fix: expose runtime session key via window global
- **Author:** @chuckbutkus
- **What:** Published `agent-canvas` binary couldn't reach onboarding because the session key wasn't available to `makeDefaultLocalBackend()`. Fixed by adding `window.__AGENT_CANVAS_SESSION_API_KEY__` injection.
- **E2E change:** Updated `mock-llm-auth-modes.spec.ts` to validate the fresh-install flow that uses the window global.

---

### PRs That Need Mock-LLM E2E Coverage 🔴

#### [#1127](https://github.com/OpenHands/agent-canvas/pull/1127) — fix: prevent deletion of the active LLM profile
- **Author:** @tofarr
- **What:** The active LLM profile could be deleted from `/settings/llm`, leaving the app in an inconsistent state. The "Delete" menu item is now hidden for the active profile.
- **Why E2E matters:** The mock-LLM conversation test already creates and activates an LLM profile. Extending it to verify that the active profile's action menu does NOT offer deletion would be a lightweight but valuable regression guard. A deletion of the active profile would break all subsequent conversations.
- **Suggested coverage:**
  - Navigate to `/settings/llm` after profile activation
  - Open the actions menu (⋯) on the active profile
  - Assert that the "Delete" option is not present
  - Open the actions menu on an inactive profile and assert "Delete" IS present

#### [#1123](https://github.com/OpenHands/agent-canvas/pull/1123) — fix: show the correct LLM profile per conversation
- **Author:** @VascoSch92
- **What:** When two profiles share the same underlying model, the chat header displayed the wrong profile name. Fixed by stamping the active profile name on conversation metadata.
- **Why E2E matters:** The existing `mock-llm-model-switch.spec.ts` tests profile switching but with different models. The bug only manifests with same-model profiles. An E2E test would catch regressions in the metadata-stamping logic that unit tests can't exercise (it spans conversation creation, metadata persistence, and UI rendering).
- **Suggested coverage:**
  - Create two profiles with the **same** mock LLM model but different names (e.g. `profile-alpha` and `profile-beta`)
  - Activate `profile-beta`, start a conversation
  - Assert the chat-header profile pill shows `profile-beta` (not `profile-alpha`)
  - Reload the page — assert the pill still shows `profile-beta`

#### [#1095](https://github.com/OpenHands/agent-canvas/pull/1095) — Polish onboarding modal flow and final-step UX
- **Author:** @FraterCCCLXIII
- **What:** Major onboarding UX rework: preview-step support, modal-close handling changes, backend save/next flow, "Say Hello" step with OR separator layout, suppressed settings-saved toast during embedded onboarding, hide Skip on final step.
- **Why E2E matters:** This PR touches the entire onboarding flow across 4 steps. The existing `mock-llm-onboarding-regressions.spec.ts` only covers specific regressions (backdrop click, LLM default), NOT the full happy path. The "Say Hello" final step launches a no-workspace conversation — testing this end-to-end would validate the complete onboarding-to-first-conversation pipeline.
- **Suggested coverage:**
  - Complete the full onboarding flow: backend step → LLM setup → "Say Hello"
  - Verify the "Skip" button is hidden on the final step
  - Verify the "Say Hello" step launches a conversation and navigates to it
  - Verify the settings-saved toast does NOT appear during onboarding

---

### PRs Where Coverage Would Be Moderately Useful ⚠️

#### [#1122](https://github.com/OpenHands/agent-canvas/pull/1122) — fix: do not gate skills modal on runtime readiness
- **Author:** @hieptl
- **What:** Skills modal showed an infinite spinner on the home page because it waited for a runtime that would never start. Removed the vestigial gate.
- **Why moderate:** The core fix is a UI gating removal. A mock-LLM test could open the skills modal from the home page and verify it renders the catalog, but the risk of regression is relatively low since the gate was fully removed rather than adjusted.
- **Suggested coverage:** Open the `+` menu → "Show Available Skills" from the home page, verify the catalog renders.

#### [#995](https://github.com/OpenHands/agent-canvas/pull/995) — feat: let ACP agents configure MCP servers
- **Author:** @simonrosenberg
- **What:** ACP agents (Claude Code, Codex, Gemini CLI) can now use MCP servers through the existing MCP page. Previously gated off for ACP.
- **Why moderate:** Mock-LLM tests use the standard OpenHands agent, not ACP. Testing ACP + MCP would require ACP-specific mock infrastructure (different agent kind, different SDK call patterns). The MCP page itself for standard agents is also not currently covered by mock-LLM tests.
- **Suggested coverage (if ACP mock infra is added):** Configure an MCP server, start an ACP conversation, verify the agent receives `mcp_config`.

---

### PRs Where E2E Coverage Is Not Needed ➖

| PR | Reason |
|----|--------|
| [#1121](https://github.com/OpenHands/agent-canvas/pull/1121) | Cloud-only proxy routing — mock-LLM tests run local backends |
| [#1120](https://github.com/OpenHands/agent-canvas/pull/1120) | Cloud-only CORS fix — same reasoning |
| [#1109](https://github.com/OpenHands/agent-canvas/pull/1109) | Cloud-only LLM metadata routing — same reasoning |
| [#1108](https://github.com/OpenHands/agent-canvas/pull/1108) | CI workflow change (skip Windows tests) |
| [#1107](https://github.com/OpenHands/agent-canvas/pull/1107) | Dev tooling fix (tmux sockets on macOS) |
| [#1097](https://github.com/OpenHands/agent-canvas/pull/1097) | Dependency version bump (automation) |
| [#1070](https://github.com/OpenHands/agent-canvas/pull/1070) | Docs-only (README Docker version) |
| [#1036](https://github.com/OpenHands/agent-canvas/pull/1036) | PostHog analytics events — should NOT fire in E2E; unit tests are the right level |

---

## Coverage Gap Summary

### High Priority — Now Covered ✅

The following gaps have been addressed with new mock-LLM E2E tests:

1. **Active profile deletion guard** (#1127) → `mock-llm-profile-management.spec.ts` — Verifies Delete is disabled on the active profile and enabled on inactive profiles.

2. **Same-model profile identity** (#1123) → `mock-llm-profile-management.spec.ts` — Creates two same-model profiles, activates one, starts a conversation, and asserts the profile switcher shows the correct name. Also verifies persistence across page reloads.

3. **Full onboarding happy path** (#1095) → `mock-llm-onboarding-happy-path.spec.ts` — Exercises all 4 onboarding steps end-to-end, validates Skip button visibility per step, conversation creation via Say Hello, modal dismissal, localStorage flag, and agent response.

### Already Well Covered ✅

- File upload path resolution (#1106) — image upload spec updated
- Onboarding backdrop/escape regression (#1100) — covered by #1105
- Default LLM provider regression (#1089) — covered by #1105
- Public-mode auth gate (#1101) — auth-modes spec updated
- Session key window global (#1091) — auth-modes spec updated
- Dual-stack binding (#1104) — cross-connect + partial-stack specs updated
