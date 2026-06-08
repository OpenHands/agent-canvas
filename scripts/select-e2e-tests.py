#!/usr/bin/env python3
"""Select which mock-LLM E2E test specs to run based on changed files.

Spins up an OpenHands SDK Agent with terminal + file_editor tools,
pointed at the checked-out repository.  The agent reads source files
and test specs as needed, then writes its selection to a JSON file.
Agent events are streamed to stderr for CI visibility; the final
JSON result is printed to stdout.

Usage:
    # From the repo root, pipe changed file paths:
    git diff --name-only origin/main | python scripts/select-e2e-tests.py

    # Or pass as arguments:
    python scripts/select-e2e-tests.py src/routes/automations.tsx ...

Environment variables:
    LLM_API_KEY   – required
    LLM_BASE_URL  – optional, defaults to https://llm-proxy.app.all-hands.dev
    LLM_MODEL     – optional, defaults to openhands/gpt-5.1
    WORKSPACE     – optional, repo root (defaults to cwd)

Output (stdout): JSON object with keys:
    specs   – list of spec filenames to run (empty ⇒ no E2E needed)
    reason  – human-readable explanation
    mode    – "llm"
"""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile

from pydantic import SecretStr

from openhands.sdk import LLM, Agent, Conversation, Event, Tool
from openhands.sdk.conversation.visualizer import ConversationVisualizerBase
from openhands.tools.file_editor import FileEditorTool
from openhands.tools.terminal import TerminalTool

# Suppress noisy SDK / litellm logs — our visualizer handles output.
logging.getLogger().setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Spec catalog – the agent receives this so it can reason about coverage.
# ---------------------------------------------------------------------------
SPEC_CATALOG: dict[str, str] = {
    "mock-llm-acp-agent.spec.ts": (
        "ACP (Agent Client Protocol) agent configuration via Settings UI, "
        "ACP conversation lifecycle, agent_kind=acp payload."
    ),
    "mock-llm-auth-modes.spec.ts": (
        "Session API key injection, key rotation recovery, public-mode "
        "auth gate (ApiKeyEntryScreen), localStorage key sync."
    ),
    "mock-llm-automation.spec.ts": (
        "Full automation lifecycle: create cron automation via terminal "
        "curl, dispatch a run, verify automation list/detail pages, "
        "automation backend integration."
    ),
    "mock-llm-conversation.spec.ts": (
        "Core conversation flow: LLM profile creation, settings API, "
        "terminal tool call, bash execution, agent reply, sidebar resume."
    ),
    "mock-llm-cross-connect.spec.ts": (
        "Frontend-only ↔ backend-only cross-connect, multi-backend "
        "switching, manage-backends modal, backend registry."
    ),
    "mock-llm-image-upload.spec.ts": (
        "Image attachment via file input, base64 encoding in LLM "
        "completion payload, image_urls in user message event."
    ),
    "mock-llm-model-switch.spec.ts": (
        "/model slash command mid-conversation, LLM profile switching, "
        "switchLLM API, chat header profile display."
    ),
    "mock-llm-onboarding-happy-path.spec.ts": (
        "Full onboarding wizard: agent selection, backend check, LLM "
        "setup, hello message. OnboardingModal flow."
    ),
    "mock-llm-onboarding-regressions.spec.ts": (
        "Onboarding edge cases: modal dismiss behavior, default model "
        "selection, backdrop/Escape handling."
    ),
    "mock-llm-partial-stack.spec.ts": (
        "Partial stack modes: --frontend-only (503 for backend), "
        "--backend-only (503 for frontend), port conflict detection. "
        "bin/agent-canvas.mjs, static-server, ingress."
    ),
    "mock-llm-preset-automation.spec.ts": (
        "Preset automation cards, slash commands from home page, "
        "skill activation via slash command."
    ),
    "mock-llm-profile-management.spec.ts": (
        "Active profile deletion + reconciliation, same-model profile "
        "identity, litellm_proxy base_url preservation."
    ),
    "mock-llm-skills.spec.ts": (
        "Project skills (.agents/skills/), user skills (~/.openhands/skills/), "
        "skill deletion, keyword-triggered activation."
    ),
    "mock-llm-ui-regressions.spec.ts": (
        "CSS isolation scoping, critic results rendering, event "
        "pagination on scroll-up, workspace selection persistence."
    ),
}


# ---------------------------------------------------------------------------
# Visualizer — streams every agent event to stderr for CI visibility
# ---------------------------------------------------------------------------
class CIVisualizer(ConversationVisualizerBase):
    """Prints agent events to stderr so CI logs show the full reasoning."""

    def on_event(self, event: Event) -> None:
        name = type(event).__name__
        dump = event.model_dump_json()[:800]
        print(f"[agent] {name}: {dump}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Build the user prompt
# ---------------------------------------------------------------------------
def build_prompt(changed_files: list[str], output_path: str) -> str:
    catalog_text = "\n".join(
        f"  - {name}: {desc}" for name, desc in sorted(SPEC_CATALOG.items())
    )
    files_text = "\n".join(f"  - {f}" for f in changed_files[:200])

    return f"""\
You have access to the full repository checkout in your working directory.
Your task: decide which E2E test specs should be run for this pull request.

You can use the terminal and file_editor tools to read any source files or
test specs if you need to understand what the changed code does.  Do NOT
modify any repository files.

Available test specs (in tests/e2e/mock-llm/) and what they cover:
{catalog_text}

Files modified in this PR:
{files_text}

Rules:
- Pick ONLY the specs whose covered areas are affected by the changed files.
  If you are unsure whether a file is relevant, read it first.
- If no spec is relevant (e.g. only docs, CI configs, or unit tests changed),
  return an empty "specs" list — we will skip E2E entirely.
- If the changes are very broad (package.json, vite.config.ts, tsconfig,
  root layout, core shared utilities) and could affect anything, return
  ALL spec filenames.

When you have decided, write your result as a JSON file to:
  {output_path}

The JSON must have exactly these keys:
  {{"specs": ["spec-filename.spec.ts", ...], "reason": "one sentence explanation"}}

Then call the `finish` tool."""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    if len(sys.argv) > 1:
        changed_files = sys.argv[1:]
    else:
        changed_files = [line.strip() for line in sys.stdin if line.strip()]

    if not changed_files:
        print(json.dumps({"specs": [], "reason": "No changed files provided.", "mode": "llm"}))
        return

    api_key = os.environ.get("LLM_API_KEY", "")
    if not api_key:
        raise RuntimeError("LLM_API_KEY is required but not set.")

    base_url = os.environ.get("LLM_BASE_URL", "https://llm-proxy.app.all-hands.dev")
    model = os.environ.get("LLM_MODEL", "openhands/gpt-5.1")
    workspace = os.environ.get("WORKSPACE", os.getcwd())

    # The agent writes its selection here; we read it after the run.
    output_file = tempfile.NamedTemporaryFile(
        prefix="e2e-selection-", suffix=".json", delete=False
    )
    output_path = output_file.name
    output_file.close()

    llm = LLM(
        model=model,
        api_key=SecretStr(api_key),
        base_url=base_url,
        usage_id="e2e-selector",
    )
    agent = Agent(
        llm=llm,
        tools=[
            Tool(name=TerminalTool.name),
            Tool(name=FileEditorTool.name),
        ],
    )

    conversation = Conversation(
        agent=agent,
        workspace=workspace,
        visualizer=CIVisualizer(),
        max_iteration_per_run=30,
    )

    prompt = build_prompt(changed_files, output_path)
    conversation.send_message(prompt)
    conversation.run()

    # Read the agent's output file.
    try:
        with open(output_path) as f:
            result = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        raise RuntimeError(
            f"Agent did not write valid JSON to {output_path}: {e}"
        ) from e
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)

    # Validate specs against the catalog.
    specs = [s for s in result.get("specs", []) if s in SPEC_CATALOG]
    reason = result.get("reason", "LLM selection")

    print(json.dumps({"specs": specs, "reason": reason, "mode": "llm"}, indent=2))

    cost = llm.metrics.accumulated_cost
    print(f"LLM cost: ${cost:.4f}", file=sys.stderr)


if __name__ == "__main__":
    main()
