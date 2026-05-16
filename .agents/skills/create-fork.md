---
name: create-fork
description: How to create and maintain a long-running *personal* fork of a GitHub project — the kind that intentionally diverges from upstream `main` to carry personal preferences and gets rebased onto upstream periodically. Default starting target is `OpenHands/agent-sdk`. Use when the user wants to fork a repo for sustained customizations, NOT for one-off "fork → branch → PR back upstream" contributions.
triggers:
- create fork
- create-fork
- long-running fork
- personal fork
- maintain a fork
- diverging fork
---

# Creating and Maintaining a Long-Running Personal Fork

This skill walks through setting up a *long-running personal fork* of an
upstream repo, and the discipline that keeps it cheap to maintain
indefinitely.

**Use this skill when** the user wants to carry personal customizations
(theming, layout tweaks, dev-loop helpers, default flips, …) on top of an
active upstream codebase, and re-sync with upstream periodically. The
fork's customized line lives on its **default branch** and intentionally
diverges from upstream's default branch.

**Do NOT use this skill** for normal "fork to make a PR" workflows. For
those, just use `gh repo fork --remote` and open the PR.

## Default starting target

When the user invokes this skill without naming a specific upstream,
default to **`OpenHands/agent-sdk`** as the upstream to fork. Confirm
the user's GitHub login first (the fork will land in that account):

```sh
curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["login"])'
```

If the user names a different upstream, substitute that everywhere
`OpenHands/agent-sdk` appears below. The procedure is identical.

For reference, an existing fork built this way is
[`rbren/agent-canvas`](https://github.com/rbren/agent-canvas) — its
`.agents/skills/long-running-fork.md` is a fully fleshed-out example
of the per-repo skill this guide tells you to create.

## Fork model: divergent `main`, no separate branch

The recommended structure is:

- **The fork's default branch is `main`** (whatever upstream calls its
  default — usually `main`, sometimes `master`).
- **The fork's `main` intentionally diverges from upstream's `main`.** It
  is *not* a mirror; it carries the personal customizations on top.
- **There is no separate "my changes" branch on the fork.** The fork
  *itself* plays that role. Keeping a parallel branch like `rbren` is
  redundant — you'd just have to keep it in sync with `main`.
- Worktrees branched off `main` naturally start on the customized line,
  which is usually what you want.

Reject any plan that involves "mirror upstream `main`, put customizations
on a side branch on the fork" unless the user explicitly insists — it
creates a permanent two-branch reconciliation tax.

## Step 1 — Create the fork on GitHub

Use the GitHub REST API (or `gh repo fork`). Do **not** set
`default_branch_only: true` — let all branches come along, you can prune
later if you want.

```sh
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/OpenHands/agent-sdk/forks \
  -d '{"default_branch_only": false}'
```

Wait a few seconds for GitHub to copy branches. The fork's default
branch will start out as a mirror of upstream's default branch tip.

Verify:

```sh
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/<your-login>/agent-sdk \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["default_branch"], d["fork"], d["parent"]["full_name"])'
```

## Step 2 — Clone locally with proper remotes

Use **ssh:// URLs for both remotes**. Don't embed GitHub tokens in remote
URLs (they leak into `git config`, shell history, error messages).

```sh
git clone ssh://git@github.com/<your-login>/agent-sdk.git
cd agent-sdk

# Origin is already the fork; just normalize the URL form if needed.
git remote set-url origin ssh://git@github.com/<your-login>/agent-sdk.git

# Add upstream as a second remote. Fetch-only in practice.
git remote add upstream ssh://git@github.com/OpenHands/agent-sdk.git
git fetch upstream
```

The convention: `origin` = the fork (the one you push to); `upstream` =
the canonical project (read-only for your purposes). Never push to
`upstream`.

Confirm SSH auth works (`ssh -T git@github.com` should greet the user by
their GitHub login). If they don't have SSH keys set up, stop and ask
— don't fall back to HTTPS+token without explicit consent.

## Step 3 — Add the `long-running-fork` skill to the fork

Every long-running fork needs an in-repo skill at
`.agents/skills/long-running-fork.md` so future agents working on the
fork auto-load the maintenance discipline. **You write this file
yourself, in the new fork, as your first fork-local commit.**

The skill must include the following sections:

### 3a. Frontmatter

```yaml
---
name: long-running-fork
description: Repo-specific guidance for the long-running personal fork `<your-login>/<repo>` of `<upstream-owner>/<repo>`. Auto-loaded for any task on the fork's `main` branch (which diverges from upstream `main`).
triggers:
- <your-login>
- <your-login>/<repo>
- long-running fork
- merge upstream
- rebase upstream
---
```

### 3b. Intro + Remote setup

Identifies the fork, names the maintainer, states the divergence-from-
upstream-main model, and documents the two SSH remotes (`origin` = fork,
`upstream` = canonical). Include a "fix-up" recipe (`git remote set-url
origin ssh://…`) for clones made before the fork existed.

### 3c. MODLOG — inventory of fork-local divergences

This is the **canonical inventory of every divergence from upstream
`main`** that currently exists on the fork. It is **NOT a timeline**
— it is a grouped-by-topic list of the current final state.

Rules:
- One entry per piece of fork-local behavior. Don't merge conceptually
  distinct edits even if they touch the same file.
- Each entry describes the **current** state, lists touched files, and
  records the *original* introducing commit as a historical anchor.
- **Adjustments** to an existing fork-local change update the entry's
  description; they do *not* add a new commit hash.
- **Reverts** (fork-local change fully removed) → delete the entry.
- **Adopted upstream** (upstream now provides what the fork used to
  override) → delete the entry on the rebase commit that retires the
  local code.
- Group entries under `####` topic subheadings (Branding, Theming,
  Sidebar, Dev meta, …). Re-group / re-title freely; the groups are a
  navigation aid, not a contract.

Entry format:

```
- **<area>** — <one-line description of the *current* final state>.
  Files: `<path>`[, `<path>` …]
  Introduced: <short commit hash>
  Upstream proposal: <issue/PR url, if filed; omit otherwise>
```

Start the MODLOG empty. Populate it as customizations land — in the
**same commit** as the change.

### 3d. SYNCLOG — chronological upstream-sync record

Unlike the MODLOG, the SYNCLOG **is** a timeline. Append-only,
chronological, newest at the bottom. One entry per sync operation
(merge or rebase from `upstream/main`), regardless of how many upstream
commits it absorbed.

The **first entry** is the upstream commit the fork was originally
branched from (no sync happened — it's the starting point of all later
diffs).

Entry format:

```
- **YYYY-MM-DD** — synced upstream `main` at `<short hash>` ("<commit title>")
  - Sync commit: `<short hash on the fork's main>` (omit for the initial branch point)
  - Conflicts: <comma-separated files / paths>, or "None"
  - Notes: <one-paragraph summary of breakages, fork-local fix-ups,
            or behavior shifts that landed in the sync commit>. Use
            "None" for clean merges.
```

Even clean syncs get an entry — that's the evidence the fork was
up-to-date at that point in time. Don't retroactively edit historical
entries; add new ones for follow-ups.

### 3e. Marker convention

Pick one literal token that every fork-local source edit carries as a
comment, so they can be grepped trivially.

A good token:
- Is unique enough to not collide with anything upstream (`fork:` is too
  generic; `<your-login>'s mod:` or `<your-login>-fork:` is fine).
- Includes a `:` so it can be greped without false positives against the
  word in prose.
- Is documented as **the single canonical form** — don't allow variants
  (`mything:`, `mything branch:`, `mything fork:`). Variants defeat the
  grep.

Document the rename procedure: if you ever need to change the token, do
it as a coordinated sweep across the whole tree in one commit, and
update this skill in the same commit.

### 3f. Core principles

Keep these short. The standard set:

1. **Additive, not invasive.** Prefer new files / new entries / new
   variants over editing shared files in place. New files never conflict
   on merge; edits to shared files often do.
2. **Smallest possible diff to shared files.** One-line edits at the
   bottom of a file rebase cleanly; reorganizing the file doesn't.
3. **Mark every fork-local edit clearly** with the marker comment
   (Section 3e).
4. **Quarantine fork-local code** in files that exist only on the fork
   (e.g. under `.agents/skills/`, a new file under `src/themes/`, a new
   script under `scripts/`).
5. **Don't reformat shared files** (no drive-by prettier passes, import
   reordering, comment cleanups). Every reformatted line is a future
   conflict.
6. **Don't rename or move shared files.** Renames are the worst-case
   conflict — git often can't follow them across an upstream rebase.

### 3g. Rebase recipe + force-push to origin

Document the canonical sync command:

```sh
git fetch upstream
git rebase upstream/main
git grep -n "<marker>:" -- ':(exclude).agents/skills/long-running-fork.md'  # sanity check
git push --force-with-lease origin main
```

Always `--force-with-lease`, never plain `--force` (long-running branches
deserve the safety net). Never push to `upstream`.

### 3h. Conflict-recurrence escalation

Document the "open an upstream issue" trigger and template (see Step 7
below).

## Step 4 — Seed the MODLOG and SYNCLOG

Even before any customizations exist, **commit the empty skill** with:

- An empty MODLOG (just the section header + maintenance rules + empty
  "Current entries").
- A SYNCLOG with exactly **one entry**: the initial branch point.

```
### Entries

- **YYYY-MM-DD** — branched from `<upstream-tip-hash>` ("<commit title>")
  on upstream `main`.
  - Conflicts: N/A (initial branch point, not a sync)
  - Notes: starting commit of the long-running fork.
```

That commit becomes the historical anchor for the fork. After it lands,
the MODLOG-self-entry can be added when the first real customization
goes in.

## Step 5 — Optional: rebrand the README header

If the user wants the fork to feel like its own thing (UI title, sidebar
wordmark, etc.), add a fork-local header section at the top of
`README.md`:

```md
# <repo> — <fork-display-name>

> [!NOTE]
> **<fork-display-name>** is a **long-running personal fork** of
> [`<upstream-owner>/<repo>`](https://github.com/<upstream-owner>/<repo>)
> maintained by **<user-name>** at
> [`<your-login>/<repo>`](https://github.com/<your-login>/<repo>).
> The fork's default branch — this `main` — intentionally diverges from
> upstream `main` to carry personal preferences. It is rebased onto
> upstream periodically and is not guaranteed to be stable between
> rebases. If you are looking for the canonical project, use
> [`<upstream-owner>/<repo>`](https://github.com/<upstream-owner>/<repo>).

> [!IMPORTANT]
> **Maintainers and agents working on <fork-display-name>:** read
> [`.agents/skills/long-running-fork.md`](.agents/skills/long-running-fork.md)
> first. It documents the merge-friendly editing discipline, the remote
> layout, the **MODLOG**, the **SYNCLOG**, and the marker convention.

---

## Upstream README

<original README content preserved verbatim>
```

Add a MODLOG entry for the README divergence.

## Step 6 — Periodic sync from upstream

On a cadence the user chooses (weekly, on upstream release, "when
something I want lands"), pull upstream changes into the fork's `main`:

```sh
cd <fork-checkout>
git fetch upstream
git --no-pager log --oneline HEAD..upstream/main   # preview what's coming
git rebase upstream/main
# Resolve conflicts. Use the marker comments to identify fork-local lines.
git push --force-with-lease origin main
```

Then **append a SYNCLOG entry** in the same rebase commit (or a tiny
follow-up commit) recording:
- Upstream tip synced to.
- Conflicts touched (or "None").
- Any breakages and how they were fixed.

If a rebase hits a conflict in a file that only contains marker comments,
prefer re-applying the marker on top of the new upstream content rather
than blindly keeping the fork-local version. The marker is the contract;
the surrounding lines belong to upstream.

## Step 7 — Pushing select fixes back to upstream

When a fork-local commit turns out to be a genuine bug fix or a
generally-useful improvement (not just a personal preference), port it
upstream as a regular PR:

1. Branch off `upstream/main` (**not** the fork's `main`):
   ```sh
   git fetch upstream
   git checkout -b upstream-pr/<descriptive-name> upstream/main
   ```
2. Cherry-pick the relevant commit and scrub it of fork-local-only
   context (drop the marker comments, drop MODLOG edits, etc.):
   ```sh
   git cherry-pick <fork-local-commit-sha>
   # then edit to remove fork-local markers / MODLOG entries
   ```
3. Push to the fork on a non-`main` branch and open a PR against
   `upstream/main`:
   ```sh
   git push origin upstream-pr/<descriptive-name>
   gh pr create --repo <upstream-owner>/<repo> --base main \
     --head <your-login>:upstream-pr/<descriptive-name> \
     --title "<concise upstream-friendly title>" \
     --body "<rationale — no fork-local framing>"
   ```
4. Once the PR merges upstream, **drop the equivalent fork-local commit
   on the next rebase**. That is the win condition — the fork carries
   one fewer commit and one fewer rebase risk.

Always include an AI-disclosure line in PR descriptions (per the github
skill's standard).

## Step 8 — When conflicts recur, propose upstream extensibility hooks

The cheapest fork-local change is the one you don't have to maintain. If
the same upstream file (or small cluster of files) conflicts on the fork
across **two or more** rebases, and the fork-local edit is structurally
the same each time (a label swap, a default flip, a feature toggle, a
color, a route entry, …), **open an upstream issue proposing an
extensibility hook**.

File one when **two or more** of these are true:

- Same upstream file has conflicted on the fork ≥2 rebases.
- The fork-local edit is structurally the same each time.
- The change generalizes — other fork maintainers would plausibly want
  it too. (Not "my idiosyncratic preference".)
- You can describe a concrete hook that lets upstream keep its
  opinionated defaults while letting forks override cleanly: a config
  flag, a render slot, a registry entry, a theme key, an env var, a
  prop with the current value as default, etc.

If only one is true, just keep the local edit and move on.

### Issue template

Title: `Proposal: make <X> configurable to reduce fork-rebase friction`

Body:

```
### Context
This came up while maintaining the long-running `<your-login>/<repo>`
fork of `<upstream-owner>/<repo>`, where a fork-local tweak to
<FILE / FEATURE> has conflicted on <N> consecutive rebases of upstream
`main` into the fork's `main`.

### Current behavior
<What upstream currently does — link the exact lines / file.>

### Why this causes rebase friction on forks
<Why the fork has to keep editing this same spot, e.g. hardcoded
label / hardcoded default theme / hardcoded route list.>

### Proposed extensibility hook
<Concrete proposal, kept minimal. Examples:
- a new optional prop / config field with the current value as default,
- moving a hardcoded literal into a small registry/constants module,
- exposing a render slot,
- reading a value from a config / env var with current behavior as fallback.>

### Backward compatibility
<Confirm the proposal preserves current default behavior so it is a
pure additive change for non-fork consumers.>

### Out of scope
<Explicitly state this issue is *not* asking upstream to adopt the
fork-local value — only to expose the seam. Forks remain responsible
for their own values.>
```

Always include the standard AI-disclosure line at the end of the body
(per the github skill):

> _This issue was opened by an AI agent (OpenHands) on behalf of
> @<your-login> while maintaining the long-running `<your-login>/<repo>`
> fork._

After filing, drop the issue URL into a one-line comment alongside the
fork-local edit:

```ts
label: "Code", /* <marker>: was "New"; upstream proposal: <upstream-owner>/<repo>#NNN */
```

If upstream lands the hook, your next rebase should **delete** the
fork-local edit and switch to consuming the new hook. Win condition,
documented retirement path.

### What *not* to do

- Don't file an issue asking upstream to adopt your preferred value
  (theme color, label text, default route). Upstream owns defaults; the
  fork owns overrides.
- Don't open a PR against upstream with the fork-local change directly.
  File the issue first; let maintainers decide on the seam shape before
  any PR.
- Don't bundle multiple unrelated proposals into one issue — one
  extensibility hook per issue.

## Final checklist

After running this skill end-to-end the user should have:

- [ ] A fork at `<your-login>/<upstream-repo>`, default branch `main`.
- [ ] A local clone with `origin` = fork (ssh://) and `upstream` =
      canonical (ssh://).
- [ ] An initial fork-local commit on `main` containing
      `.agents/skills/long-running-fork.md` with: intro, remote setup,
      empty MODLOG (with maintenance rules), seeded SYNCLOG (one entry =
      initial branch point), marker convention, core principles, rebase
      recipe, escalation guidance.
- [ ] (Optional) Rebranded README header + a MODLOG entry for it.
- [ ] `origin/main` pushed.

Future agents working on the fork will auto-load
`long-running-fork.md` and follow its discipline. Your job in this skill
is done as soon as the scaffolding is in place — the first real
customization is its own task.
