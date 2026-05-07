# Visual verification — Issue #134 (app-settings polish)

## Frames in `demo.gif`

1. **`01-app-settings-en.png`** — `Settings → Application` page rendered by
   `npm run dev`. The Git Username and Git Email inputs are emptied so
   their placeholders are visible. Both placeholders now resolve through
   `t(I18nKey.SETTINGS$GIT_USERNAME_PLACEHOLDER)` and
   `t(I18nKey.SETTINGS$GIT_EMAIL_PLACEHOLDER)` instead of the previous
   hardcoded English strings.
2. **`03-mcp-timeout-label.png`** — `Settings → MCP` with the "Add MCP
   Server" form open and `Server Type = SHTTP`. The "Timeout (seconds)"
   label now resolves through `t(I18nKey.SETTINGS$MCP_TIMEOUT_LABEL)`
   instead of the previous hardcoded English label.

The page boots, all related queries succeed, and the new keys round-trip
through `make-i18n`'s declaration generator with no missing translations.

## Functional verification

- `npm run typecheck` — clean.
- `npm run build` — clean (`build/server/index.js  1,136.20 kB`).
- `npx vitest run __tests__/routes/app-settings.test.tsx __tests__/routes/mcp-settings.test.tsx __tests__/components/features/settings/mcp-settings/` — **10 / 10 passed**.
- `make-i18n` regenerates `src/i18n/declaration.ts` with the three new
  enum entries (`SETTINGS$GIT_USERNAME_PLACEHOLDER`,
  `SETTINGS$GIT_EMAIL_PLACEHOLDER`, `SETTINGS$MCP_TIMEOUT_LABEL`).

## On the sandbox-grouping half (#14291)

Upstream PR #14291 drops the `ENABLE_SANDBOX_GROUPING()` feature-flag
gate around the sandbox-grouping-strategy dropdown in
`app-settings.tsx`. That dropdown — and the `sandbox_grouping_strategy`
setting it edits — was already stripped from agent-canvas during the
original OSS port (the field is not present in `src/types/settings.ts`,
not exposed by either `/api/settings/agent-schema` or
`/api/settings/conversation-schema` on `openhands-agent-server` 1.20.1,
and `feature-flags.ts` no longer carries the `SANDBOX_GROUPING` flag).

Per the issue's own acceptance criteria ("if the field isn't part of
the schema, gate on schema presence rather than re-introducing the
flag"), this PR is a no-op for #14291: there is nothing to ungate.
