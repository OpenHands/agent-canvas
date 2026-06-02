# Using ACP agents

Agent Canvas can drive your conversations with the built-in **OpenHands** agent or
with an external **ACP agent** — Claude Code, Codex, or Gemini CLI. This guide
explains what ACP agents are, how to onboard one, and how to switch agents or
models later.

## What is an ACP agent?

The [Agent Client Protocol (ACP)](https://agentclientprotocol.com/protocol/overview)
is a standard for talking to coding agents over JSON-RPC on stdio. Instead of
Agent Canvas calling an LLM directly, the Agent Server spawns the agent's own CLI
as a subprocess and relays each turn to it. The external agent manages its own
LLM, tools, and execution; Agent Canvas sends messages and renders what comes
back.

```mermaid
flowchart LR
    canvas["Agent Canvas<br/>(this UI)"]
    server["Agent Server"]
    acp["ACP subprocess<br/>(e.g. claude-agent-acp)"]
    llm["LLM provider<br/>(Anthropic / OpenAI / Google)"]
    canvas -- "PATCH /api/settings<br/>(agent_kind, acp_*)" --> server
    canvas -- "conversation turns" --> server
    server -- "spawn + JSON-RPC over stdio" --> acp
    acp -- "API calls" --> llm
```

The Agent Server owns the subprocess and the credentials; Agent Canvas only
records *which* agent to run and surfaces a form for the secrets it needs. The
agent choice is stored per backend, so switching backends can switch agents.

## Supported providers

The provider list is sourced from the SDK registry
(`openhands.sdk.settings.acp_providers`, mirrored into
`@openhands/typescript-client`) and enriched with Canvas UI metadata in
[`src/constants/acp-providers.ts`](../src/constants/acp-providers.ts). Adding or
changing a provider happens upstream in the SDK, not here.

| Provider | Default command |
|---|---|
| **Claude Code** | `npx -y @agentclientprotocol/claude-agent-acp` |
| **Codex** | `npx -y @zed-industries/codex-acp` |
| **Gemini CLI** | `npx -y @google/gemini-cli --acp` |

See [Authentication](#authentication) for how each one authenticates.

## Authentication

> [!IMPORTANT]
> ACP agents authenticate **two ways: a subscription login, or an API key** — and
> the onboarding fields are optional. If you're already signed in to the
> provider's CLI on the machine the agent runs on, it reuses that login
> automatically, so locally you often don't need a key at all. **The login takes
> priority over an API key:** while you're signed in, a key set in the
> environment isn't used — so the onboarding key fields do nothing and can be
> left blank.

A "subscription login" is the credential the provider's own CLI stores when you
sign in once — a file in your home directory, or, for Claude Code on macOS, the
system **Keychain**. When the Agent Server runs **on that same machine** (a local
or self-hosted backend), the provider CLI finds that login automatically — no API
key required. On a clean cloud sandbox there's no stored login, so an API key is
needed instead.

| Provider | Subscription login (auto-detected) | API key |
|---|---|---|
| **Claude Code** | A Claude Code login (Pro/Max), from Claude Code's own credential store: the **macOS Keychain**, or `~/.claude/.credentials.json` on Linux | `ANTHROPIC_API_KEY` *(onboarding)* |
| **Codex** | A ChatGPT login (`codex login`) cached at `~/.codex/auth.json` | `OPENAI_API_KEY` *(onboarding)* |
| **Gemini CLI** | Your Google login (`gemini`/`gemini --acp`) cached at `~/.gemini/oauth_creds.json` | `GEMINI_API_KEY` *(onboarding)* |

All three collect an *optional* API key (+ base URL) in onboarding. As noted
above, **a subscription / OAuth login takes priority over an API key** — when the
provider's CLI is signed in, a key set in the environment is not used. Verified
per provider:

- **Codex** — `codex login status` keeps reporting the ChatGPT login even with
  `OPENAI_API_KEY` set.
- **Gemini CLI** — uses the OAuth auth type chosen at `gemini` login;
  `GEMINI_API_KEY` is only consulted if you switch the auth type. The free Google
  login is the common no-key path locally — sign in once and it **just works**.
- **Claude Code** — with both present, `claude auth status` reports it is
  authenticated via the subscription (`claude.ai`), not the key. The login is
  auto-detected from the macOS Keychain (or `~/.claude/.credentials.json` on
  Linux); `CLAUDE_CONFIG_DIR` is **not** required for it — it only relocates
  Claude Code's config directory (settings/history, not the token; e.g. for
  containers or multiple accounts) and signals the SDK to strip a conflicting
  `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL`.

The one exception is the **base URL** (`*_BASE_URL`): a custom value points the
CLI at a different endpoint (a proxy or gateway) and *does* take effect even
under a login — for Gemini it rides the ACP `gateway` param. It's an advanced
override, not needed for normal use.

## Onboarding an ACP agent

First-time users get a four-step onboarding modal. To onboard an ACP agent:

1. **Choose agent** — pick Claude Code, Codex, or Gemini CLI instead of
   OpenHands. The choice is saved immediately to your backend's settings.
2. **Check backend** — confirms Agent Canvas can reach the Agent Server.
3. **Set up credentials** — enter the provider's API key (and, optionally, a
   custom base URL for a proxy or gateway). All three providers — Claude Code,
   Codex, and Gemini CLI — collect these here, and every field is optional.
4. **Say hello** — creates your first conversation and closes the modal.

> [!NOTE]
> Every credential field is optional and the step is skippable. Leave a field
> blank to reuse a key already set on the backend, or to authenticate the agent
> through a subscription / OAuth login instead.

### How credentials reach the agent

Each credential you enter is saved as a **global secret** whose name is exactly
the environment variable the Agent Server exports into the ACP subprocess (e.g.
`ANTHROPIC_API_KEY`). Saving in onboarding is identical to adding the secret
under **Settings → Secrets**, where you can edit or remove it anytime. Keeping
the secret name equal to the env var is what makes a saved key actually reach the
provider CLI.

## Switching agent or model later

Open **Settings → Agent** at any time:

- **Agent** — switch between **OpenHands** and **ACP**.
- **Preset** — pick a built-in provider (Claude Code, Codex, Gemini CLI) or
  **Custom** to point at any other ACP server.
- **Command** — the command line used to spawn the subprocess. Selecting a preset
  fills this in; editing it to match another preset re-detects that provider.
  API keys are *not* entered here — they live in the Secrets panel.
- **Model** — choose a suggested model for the provider or enter a custom model
  override. Built-in providers save a concrete model rather than leaving it
  blank.

Saving writes an `agent_settings_diff` (`agent_kind`, `acp_server`,
`acp_command`, `acp_model`) to `PATCH /api/settings`. A running conversation
keeps the agent it started with; the new choice applies to conversations you
start afterward.

## Custom ACP servers

Any stdio ACP server works: choose **Custom** in Settings → Agent and enter its
launch command. Custom servers have no curated model list, so enter the model ID
the server expects (if any) as a custom model. Pass credentials by adding the
env vars the server reads as global secrets under **Settings → Secrets**.
