# Migrating from OpenHands Local GUI to Agent Canvas

Agent Canvas is the replacement for the OpenHands OSS Local GUI (`OpenHands/OpenHands`).
This guide covers what migrates automatically, what needs manual reconfiguration, and
how to prepare your existing data before launching Agent Canvas for the first time.

## Before you start: back up `~/.openhands`

Agent Canvas uses the same `~/.openhands` persistence directory as the old Local GUI.
**Back it up before your first Agent Canvas launch:**

```sh
cp -r ~/.openhands ~/.openhands.backup.$(date +%Y%m%d)
```

## What migrates automatically

Agent Canvas (via `openhands-agent-server`) reads from the old `settings.json` and
`secrets.json` files in `~/.openhands` by default. The following fields are reused:

| Old Local GUI data                     | Agent Canvas behavior                                                                                                                                                  |
|----------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `settings.json.agent_settings`         | Reused. Legacy fields are canonicalized (e.g. `agent_kind: "llm"` → `"openhands"`).                                                                                   |
| `settings.json.conversation_settings`  | Reused. SDK migration v0 → v1 is applied automatically.                                                                                                               |
| `secrets.json.custom_secrets` (names and descriptions) | Loaded into the new `Secrets` model. Names and descriptions are preserved.                                                                              |

## What does NOT migrate automatically

### LLM API keys in `agent_settings.llm.api_key`

Agent Canvas generates a default `OH_SECRET_KEY` and uses it for encryption. Old
plaintext API keys stored in `settings.json` cannot be decrypted by the new cipher
and will be lost.

**Fix:** After launching Agent Canvas, re-enter your LLM API key in the Settings UI
or create an LLM profile with the key.

### Custom secret values in `secrets.json`

The same encryption mismatch applies: plaintext values in old `secrets.json`
entries become `None` in Agent Canvas. Names and descriptions are preserved but
value lookups will return 404.

**Fix:** Re-enter secret values through the Agent Canvas UI or API after launch.

### LLM profiles (`settings.json.llm_profiles`)

Agent Canvas stores LLM profiles as individual JSON files under
`~/.openhands/profiles/*.json`, not inside `settings.json`. Old embedded
`llm_profiles` are not imported.

**Fix:** Recreate LLM profiles in the Agent Canvas Settings → LLM Profiles UI.
Profile names must match the regex `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`.

> **Note:** If `llm_api_key_is_set` is true on the loaded settings, Agent Canvas
> auto-creates one default profile on first `/api/profiles` access. With old
> plaintext keys and a generated `OH_SECRET_KEY`, this condition is **false**, so
> no profile is auto-created.

### Provider tokens (`secrets.json.provider_tokens`)

The old `provider_tokens` for Git/OAuth providers are ignored by the local
agent-server used by Agent Canvas. The new `Secrets` model stores custom secrets
only and does not include provider tokens.

**Fix:** Reconfigure repository integrations (GitHub tokens, etc.) through the
Agent Canvas UI.

### App preferences

The following old `settings.json` fields are **not** reused. Agent Canvas persists
these in browser `localStorage`:

| Old field                       | Agent Canvas localStorage key                    |
|---------------------------------|--------------------------------------------------|
| `language`                      | `openhands-agent-server-app-preferences`         |
| `enable_sound_notifications`    | `openhands-agent-server-app-preferences`         |
| `user_consents_to_analytics`    | `openhands-agent-server-app-preferences`         |
| `git_user_name`                 | `openhands-agent-server-app-preferences`         |
| `git_user_email`                | `openhands-agent-server-app-preferences`         |

**Fix:** Reconfigure these in the Agent Canvas Settings UI.

### Disabled skills

Stored in browser `localStorage` under `openhands-agent-server-disabled-skills`,
not imported from old `settings.json`.

**Fix:** Disable skills again through the Agent Canvas Skills UI.

### Old conversation history

Agent Canvas uses its own conversation store at
`~/.openhands/agent-canvas/conversations`. Old Local GUI conversations
(`v1_conversations/` and SQL-backed metadata) are not automatically listed or imported.

**Fix:** Old conversations remain readable in `~/.openhands.backup.*` but are not
available in Agent Canvas. Export any data you need before migrating.

### `config.toml`

Not read by Agent Canvas or `openhands-agent-server`. Old TOML-based configuration
for headless/CLI defaults has no effect.

**Fix:** Use environment variables instead. See the [environment variable mapping](#environment-variable-mapping) below.

### Other old settings not imported

These fields from the old app-server model are not present in Agent Canvas and
are not reused: `search_api_key`, `sandbox_api_key`, `max_budget_per_task`,
`remote_runtime_resource_factor`, `sandbox_grouping_strategy`, and email fields.

## Environment variable mapping

| OpenHands Local GUI env / config             | Agent Canvas equivalent                                                                                                                                                |
|----------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `OH_PERSISTENCE_DIR`                         | Still honored by `openhands-agent-server`. Agent Canvas defaults it to `~/.openhands`.                                                                                 |
| `FILE_STORE_PATH`                            | Old Local GUI fallback only. Use `OH_PERSISTENCE_DIR` for Agent Canvas.                                                                                                |
| `SESSION_API_KEY`                            | Legacy fallback. Agent Canvas launchers use `LOCAL_BACKEND_API_KEY` and pass it as `OH_SESSION_API_KEYS_0`.                                                            |
| `VITE_BACKEND_BASE_URL="localhost:3000"`     | Agent Canvas default entry point is `http://localhost:8000`. Frontend-only setups use `VITE_BACKEND_BASE_URL`.                                                          |
| `VITE_BACKEND_HOST="127.0.0.1:3000"`         | Agent Canvas Vite proxy defaults to `127.0.0.1:8000`.                                                                                                                  |
| `WORKSPACE_BASE`, `workspace_base` in config | Agent Canvas uses `VITE_WORKING_DIR`, stored local workspaces, per-conversation working dirs, and Docker `/projects` mounts.                                           |
| `RUNTIME` / `SANDBOX_*` / `AGENT_SERVER_*`   | Agent Canvas talks directly to `openhands-agent-server`. Npm/local mode runs without a sandbox; Docker mode is the isolated option.                                    |
| `TAVILY_API_KEY` / `SEARCH_API_KEY`          | Agent Canvas exposes search/MCP through the `/mcp` page and marketplace entries. Tavily is configured as an MCP server entry.                                          |
| `OPENHANDS_PROVIDER_BASE_URL` / `LLM_BASE_URL` | Configured through LLM Profiles in the Agent Canvas UI.                                                                                                             |
| `VITE_ENABLE_BROWSER_TOOLS`                  | Agent Canvas-specific. Set to `false` to omit `browser_tool_set` from new conversations.                                                                               |
| `VITE_LOAD_PUBLIC_SKILLS`                    | Agent Canvas-specific. Set to `false` to stop loading public skills from `OpenHands/extensions`.                                                                       |
| `LOCAL_BACKEND_API_KEY`                      | Agent Canvas user-facing API key. Required in `--public` mode; auto-generated/persisted in local mode.                                                                 |
| `OH_SECRET_KEY`                              | Critical for Agent Canvas. Generated/persisted by default. Controls encryption of secrets and API keys.                                                                |

## Launch and behavior changes

### Launch commands

| Old Local GUI                     | Agent Canvas                                                                   |
|-----------------------------------|--------------------------------------------------------------------------------|
| `make run`                        | `npm install -g @openhands/agent-canvas && agent-canvas`                       |
| `make docker-run`                 | `docker run -p 8000:8000 ghcr.io/openhands/agent-canvas:1.1.0`                 |
| Source: `127.0.0.1:3000` (backend) | `http://localhost:8000` (single entry point)                                  |

Agent Canvas supports split modes:

```sh
agent-canvas --frontend-only  # static frontend + ingress only
agent-canvas --backend-only   # agent server + automation backend + ingress
```

### Port and service changes

| Service               | Old Local GUI | Agent Canvas        |
|-----------------------|---------------|---------------------|
| Main entry            | `:3001`       | `:8000`             |
| Agent server          | app-managed   | `:18000`            |
| Automation backend    | N/A           | `:18001`            |
| Vite dev server       | N/A           | `:3001` (dev only)  |

### Other behavior changes

- Agent Canvas talks directly to `openhands-agent-server`, not the full OpenHands app backend.
- Hosted/account/org management UI is removed or hidden in the OSS Agent Canvas path.
- Local mode auto-generates and injects a session API key. Public mode (`--public`) requires `LOCAL_BACKEND_API_KEY`.
- Npm/local mode runs **without a sandbox** and has host filesystem access. Docker mode is the isolated path.
- The Terminal tab is a read-only transcript of agent events, not an interactive shell.
- The Browser tab shows screenshot/URL state from browser-tool events, not a manually-driven browser.
- Agent Canvas adds the `canvas_ui` tool and conditionally includes `browser_tool_set` / `task_tool_set`.
- MCP servers (including Tavily) are configured through the `/mcp` page and marketplace.
- Default model: Agent Canvas frontend defaults to `openhands/minimax-m2.7`. Configure through LLM Profiles.

## Manual migration checklist

1. [ ] Back up `~/.openhands` (see [Before you start](#before-you-start-back-up-openhands)).
2. [ ] Launch Agent Canvas.
3. [ ] Re-enter LLM API key in Settings, or create an LLM profile with the key.
4. [ ] Recreate LLM profiles under Settings → LLM Profiles.
5. [ ] Re-enter custom secrets.
6. [ ] Reconfigure repository integrations (GitHub tokens, etc.).
7. [ ] Review app preferences in Settings (language, sound, analytics, git identity).
8. [ ] Review disabled skills.
9. [ ] Update any scripts that reference old environment variables or ports.

## Related documents

- [Architecture](./architecture.md)
- [Development guide](./DEVELOPMENT.md)
- [Self-hosting guide](./SELF_HOSTING.md)
