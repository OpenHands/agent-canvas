#!/usr/bin/env python3
"""Select which mock-LLM E2E test specs to run based on changed files.

Spins up an OpenHands SDK Agent with terminal + file_editor tools,
pointed at the checked-out repository.  The agent discovers available
test specs by reading the repo, inspects changed source files as
needed, then writes its selection to a JSON file.

No hardcoded spec catalog — the agent finds and reads specs at runtime,
so newly added tests are picked up automatically.

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

import glob
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

SPEC_DIR = "tests/e2e/mock-llm"


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
# Discover available spec files from the repo checkout
# ---------------------------------------------------------------------------
def discover_specs(workspace: str) -> list[str]:
    pattern = os.path.join(workspace, SPEC_DIR, "*.spec.ts")
    return sorted(os.path.basename(p) for p in glob.glob(pattern))


# ---------------------------------------------------------------------------
# Build the user prompt
# ---------------------------------------------------------------------------
def build_prompt(
    changed_files: list[str],
    available_specs: list[str],
    output_path: str,
) -> str:
    specs_text = "\n".join(f"  - {s}" for s in available_specs)
    files_text = "\n".join(f"  - {f}" for f in changed_files[:200])

    return f"""\
You have access to the full repository checkout in your working directory.
Your task: decide which E2E test specs should be run for this pull request.

You SHOULD use the terminal and file_editor tools to read changed source
files and test specs to understand what they do.  Do NOT modify any files.

Available E2E test specs (in {SPEC_DIR}/):
{specs_text}

To understand what each spec tests, read its source — for example:
  file_editor view {SPEC_DIR}/<spec-name>.spec.ts

Files modified in this PR:
{files_text}

Rules:
- Pick ONLY the specs whose covered areas are affected by the changed files.
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

    available_specs = discover_specs(workspace)
    if not available_specs:
        print(json.dumps({
            "specs": [],
            "reason": f"No *.spec.ts files found in {SPEC_DIR}/.",
            "mode": "llm",
        }))
        return

    print(f"Discovered {len(available_specs)} spec(s) in {SPEC_DIR}/", file=sys.stderr)

    # The agent writes its selection here; we read it after the run.
    output_fd, output_path = tempfile.mkstemp(
        prefix="e2e-selection-", suffix=".json"
    )
    os.close(output_fd)

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

    prompt = build_prompt(changed_files, available_specs, output_path)
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

    # Validate specs — only keep filenames that actually exist.
    specs = [s for s in result.get("specs", []) if s in available_specs]
    reason = result.get("reason", "LLM selection")

    print(json.dumps({"specs": specs, "reason": reason, "mode": "llm"}, indent=2))

    cost = llm.metrics.accumulated_cost
    print(f"LLM cost: ${cost:.4f}", file=sys.stderr)


if __name__ == "__main__":
    main()
