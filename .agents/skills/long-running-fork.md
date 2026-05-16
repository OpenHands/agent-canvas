---
name: long-running-fork
description: Repo-specific guidance for the long-running personal fork `smolpaws/agent-canvas` of `OpenHands/agent-canvas`. Auto-loaded for any task on the fork's `main` branch so changes stay easy to rebase onto upstream.
triggers:
- smolpaws/agent-canvas
- long-running fork
- merge upstream
- rebase upstream
---

# Long-Running Fork — `smolpaws/agent-canvas`

This repository is checked out from **`smolpaws/agent-canvas`**, a long-running
personal fork of `OpenHands/agent-canvas` maintained by smolpaws (for Engel Nyst).
The fork's default branch is **`main`**, which intentionally **diverges from
upstream `main`** — it carries customizations on top of upstream and is rebased
onto upstream periodically.

### Remote setup

- `origin` → `smolpaws/agent-canvas` — the fork. Push here.
- `upstream` → `OpenHands/agent-canvas` — canonical. Fetch only.

### The fork's #1 constraint

**Stay easy to rebase onto upstream `main`.** Every change must minimize
merge-conflict surface area.

## Core Principles

1. **Mark every fork-local edit** with a `smolpaws-mod:` comment in the
   source so it can be grepped. Example:
   ```ts
   label: "Conversations", /* smolpaws-mod: was "Home" */
   ```

2. **Update the MODLOG in the same commit** as the fork-local code change.

3. **Prefer additive changes** (new files, new config entries, appended
   items) over in-place edits to upstream files.

4. **Never reformat upstream code** — it creates false-positive conflicts.

5. **One logical change per commit** for clean cherry-pick and revert.

## MODLOG — Live Fork-Local Modifications

_Empty — no fork-local modifications yet._

## SYNCLOG — Upstream Sync History

| Date | Upstream commit | Notes |
|------|----------------|-------|
| 2026-05-16 | `558b4bd` | Initial fork creation, branch point = upstream main HEAD |

## Rebase Recipe

```sh
git fetch upstream
git rebase upstream/main
# Resolve conflicts, keeping smolpaws-mod markers
# Update SYNCLOG with new upstream HEAD
git push origin main --force-with-lease
```

## Escalation

If the same upstream file conflicts on **2+ rebases** with the same
structural edit, open an upstream issue proposing an extensibility hook
(config flag, render slot, theme key, etc.). See the `create-fork` skill
for the issue template.
