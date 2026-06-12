# Critical Carl review

Scope: repository review of `agent-canvas` using the [Critical Carl](https://codeberg.org/dheater/carl/src/branch/main/rules/00-CRITICAL-CARL.md) lens.

Carl's rule is simple: **delete first, simplify second, reuse third, add last.** This is a working, well-tested frontend, so the obvious failures are not here — the test surface and docs are strong. What Carl finds instead is structural: a handful of oversized control-plane files, vendor-specific behavior leaking into generic layers, a junk-drawer `utils.ts`, and a large and growing compatibility/legacy surface that keeps dead concepts alive.

The problem is not missing capability. It is too many layers, too many compatibility shims, and a few files that have quietly become application controllers.

## Strongest findings

### 1. `ConversationWebSocketProvider` is a god object

- `src/contexts/conversation-websocket-context.tsx` is **1086 lines** in a single component/provider.
- It reaches into **~29** external stores, clients, and query hooks (`grep -cE 'use[A-Z][a-zA-Z]*Store|useQueryClient|usePostHog'`): event store, error store, optimistic-message store, conversation-state store, command store, browser store, conversation store, PostHog, React Query, plus file/metric helpers.
- It runs **two parallel connections** (main + planning sub-agent) whose message handlers are near-duplicate blocks: `handleMainMessage` (`:458-643`) and `handlePlanningMessage` (`:644-855`).
- A single message handler mixes JSON parsing, dedup, LLM-switch detection, error routing, screenshot decoding, metrics extraction, plan-file tracking, and conversation-metadata writes.

**Carl verdict:** this is not a transport provider anymore — it is the conversation runtime's control plane wearing a `Context`.

**Delete / simplify first:**
- Collapse the duplicated main/planning handlers into one parameterized message pipeline instead of two copies.
- Split message handling into named stages with one job each: parse → dedup → route → side effects.
- Stop letting one provider own metrics, screenshots, plan-file state, and metadata persistence; those are separable subscribers.

**Tracking comparison:** not covered by any spec under `specs/`. Untracked.

### 2. `agent-server-adapter.ts` is a second control plane

- `src/api/agent-server-adapter.ts` is **988 lines** and owns ~25 functions spanning four unrelated concerns:
  - conversation-start request building (`buildStartConversationRequest` `:839`, `buildConfigured*Settings` `:648-838`),
  - the `<RUNTIME_SERVICES>` markdown renderer / DSL (`buildRuntimeServicesSystemSuffix` `:185-272`),
  - tool gating and vendor naming (`getAgentTools` `:488`, `shouldIncludeTool` `:473`, hardcoded tool-name constants `:77-87`),
  - ACP-agent resolution (`isAcpAgent` / `resolveAcpCommand` / `buildConfiguredAcpAgentSettings` `:621-707`).
- `getDeploymentMode()` (`:173`) is exported from here purely so a generic MCP util can ask "are we in docker?" (see finding 4).

**Carl verdict:** "adapter" has become a junction box. Four reasons to change this file pull in four directions.

**Delete / simplify first:**
- Move the runtime-services renderer to its own module; it has nothing to do with conversation payloads.
- Move ACP settings assembly next to the other ACP code (`src/constants/acp-providers.ts`).
- Keep the adapter to one job: turn settings into a start-conversation request.

**Tracking comparison:** untracked.

### 3. `utils.ts` is a junk drawer

- `src/utils/utils.ts` is **859 lines** with **37 exports** that share nothing but the filename: DOM height math (`getStyleHeightPx` `:46`), device detection (`isMobileDevice` `:70`), git-provider URL construction (`constructPullRequestUrl` `:270`, `constructBranchUrl` `:412`), hardcoded LLM **prompt-template builders** (`getGitPushPrompt` `:466`, `getCreatePRPrompt` `:478`, `getRepoMdCreatePrompt` `:558`), task-group math (`getLimitedTaskGroups` `:512`), and status label/icon/color/text (`:585-859`).

**Carl verdict:** a file named `utils` that does 37 unrelated things is where complexity hides. Nobody can reason about its surface; everyone imports from it.

**Delete / simplify first:**
- Split by concern: `git-urls.ts`, `prompts.ts`, `status.ts`, `dom.ts`. No new behavior — just stop pretending these are one thing.
- The prompt builders are user-facing English strings assembled in code; they belong with the other prompt/i18n surface, not in `utils`.

**Tracking comparison:** untracked.

### 4. Vendor-specific transport policy leaked into the generic MCP catalog

- `src/utils/mcp-marketplace-utils.ts` runs every catalog entry through `patchLinearEntry` (`:83`) and `patchGitHubEntry` (`:117`), each guarded on a hardcoded `entry.id` (`"linear"`, `"github"`).
- `patchGitHubEntry` additionally branches on `getDeploymentMode() === "docker"` and rewrites the entry's transport command from `docker` to a baked-in `github-mcp-server` binary (`:117-145`).

**Carl verdict:** generic catalog code should not know Linear's endpoint quirks or GitHub's docker-vs-binary transport. This is exactly the leak Carl warns about — once two vendors get special-cased in the generic layer, every vendor will.

**Delete / simplify first:**
- Push these quirks into the `@openhands/extensions` catalog data (or per-entry metadata), not into runtime `.map()` patches.
- If the patches must stay temporarily, treat them as a known debt with a deletion target, not a permanent pattern (AGENTS.md currently teaches the pattern as the way to add more).

**Tracking comparison:** untracked, and currently documented as an approved extension point rather than debt.

### 5. The compatibility / legacy surface keeps growing

- **83** references to `legacy` / `deprecated` / `obsolete` / `backward-compat` across `src` (`grep -rniE` count).
- Concrete dead-concept carriers:
  - `BUNDLED_BACKEND_ID = "default-local"` — the "bundled backend" concept was removed, but the name and special id persist through the backend registry.
  - `src/api/backend-registry/storage.ts:11` `LEGACY_AGENT_SERVER_CONFIG_STORAGE_KEY` plus `readLegacyBackend` / `clearLegacyBackendConfig` migration paths.
  - `src/api/settings-service/legacy-app-preferences-migration.ts` — an entire module migrating two retired localStorage keys on every first `getSettings()`.
  - `src/routes/mcp-settings.tsx` + `mcp-settings-redirect.tsx` — a compatibility route/redirect for the old `/settings/mcp` location plus a re-export to keep a published symbol shape.
  - `services.vite` accepted as a legacy alias for `services.frontend` in the runtime-services renderer.
  - `resend_all` kept alive only for the planning sub-conversation.

**Carl verdict:** every compatibility shim is a permanent tax. Contributors now have to remember that `default-local` means "the seeded backend", that `/settings/mcp` is really `/mcp`, and that two localStorage keys still need draining.

**Delete / simplify first:**
- Put an expiry on each migration: drain-once, then delete the reader. `legacy-app-preferences-migration.ts` and `readLegacyBackend` are prime deletion candidates after one release.
- Rename `BUNDLED_BACKEND_ID` to what it is now (a seeded default) instead of carrying the old word.
- Drop the `/settings/mcp` redirect and the `services.vite` alias once internal callers are migrated.

**Tracking comparison:** untracked as cleanup; AGENTS.md documents the shims but no spec schedules their removal.

### 6. Controller components and duplicated form state

- `src/components/features/backends/backend-form-modal.tsx` (**877 lines**) defines the same `name` / `host` / `apiKey` / `connectionError` / `isSubmitting` state plus a `handleSubmit` **twice** — once in `BackendForm` (`:336-376`) and again in `ManualConnectionColumn` (`:563-577`) — alongside host inference, address classification, URL validation, connection testing, and a status badge with its own query.
- `src/components/features/conversation-panel/conversation-panel.tsx` (**781 lines**) and `src/routes/agent-settings.tsx` show the same shape: the latter `flatMap`s every schema section and `find`s a single field by key (`:97`, `:67`) as a workaround for not knowing which section the backend exposes it in.

**Carl verdict:** these are controllers wearing JSX, with copy-pasted form state Carl would reuse rather than duplicate.

**Delete / simplify first:**
- Extract one `useBackendForm()` hook and delete the duplicate state block in `ManualConnectionColumn`.
- Move per-section query/mutation glue out of the big panel components into dedicated hooks.

**Tracking comparison:** untracked.

## Comparison against the current tracking set (`specs/`)

The repo tracks behavior contracts under `specs/` (`backend-management.md`, `llm-defaults.md`, `workspace-upload-path.md`) and an extensive `AGENTS.md`. Both are strong for **describing** current behavior. Neither schedules **deletion** of the complexity above.

### Already handled well
- Behavior contracts and regression coverage (specs + the mock-LLM/live E2E frameworks).
- Documentation of the shims (AGENTS.md explains every legacy path in detail).

### Still missing
1. **De-god the websocket provider** — collapse the duplicated main/planning handlers (`conversation-websocket-context.tsx:458-855`).
2. **Split `agent-server-adapter.ts`** — separate the runtime-services renderer and ACP assembly from request building.
3. **Break up `utils.ts`** — by concern; move prompt builders out.
4. **Remove vendor `entry.id` patches** from `mcp-marketplace-utils.ts` into catalog data.
5. **Schedule deletion of the legacy surface** — give `legacy-app-preferences-migration.ts`, `readLegacyBackend`, the `/settings/mcp` redirect, and the `services.vite` alias drain-once-then-delete expiries.

## Bottom line

`agent-canvas` does not have the easy failures. The Carl-grade problems are structural: a 1086-line websocket god object, a 988-line adapter doing four jobs, an 859-line `utils` junk drawer, vendor trivia in generic catalog code, and an 83-reference compatibility surface that documentation explains but nothing schedules for removal. The current tracking set is excellent at describing behavior and weak at subtracting code. The highest-leverage next work is deletion, not more documentation.
