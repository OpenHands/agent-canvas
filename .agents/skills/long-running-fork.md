---
name: long-running-fork
description: Repo-specific guidance for the long-running personal fork `rbren/agent-canvas` of `OpenHands/agent-canvas`. Auto-loaded for any task on the fork's `main` branch (which diverges from upstream `main`) so changes stay easy to merge from / into upstream.
triggers:
- rbren
- rbren/agent-canvas
- long-running fork
- merge upstream
- rebase upstream
- upstream merge
---

# Long-Running Fork — `rbren/agent-canvas`

This repository is checked out from **`rbren/agent-canvas`**, a long-running
personal fork of `OpenHands/agent-canvas` maintained by Robert Brennan. The
fork's default branch is **`main`**, which intentionally **diverges from
upstream `main`** — it carries personal preferences (theming, layout
tweaks, dev-loop helpers, etc.) on top of upstream and is rebased onto
upstream periodically.

> **The fork is informally called "rbren's mod"** (that's also the
> browser-tab title and sidebar wordmark). There is no `rbren` branch
> here — `main` is the customized line, and fork-local edits in source
> are tagged with a `rbren's mod:` comment marker (see "Mark every
> fork-local edit" in Core Principles).

### Remote setup

This repo is configured with two remotes, both over SSH:

- `origin` → `ssh://git@github.com/rbren/agent-canvas.git` — the fork.
  Default branch `main`. This is where the fork's `main` is pushed.
- `upstream` → `ssh://git@github.com/OpenHands/agent-canvas.git` — the
  canonical repo. Default branch `main`. Fetch from here to sync upstream
  changes; never push to it directly.

If you see `origin` pointed at `OpenHands/agent-canvas` (e.g. on a clone
made before the fork existed), fix it before pushing:

```sh
git remote set-url origin ssh://git@github.com/rbren/agent-canvas.git
git remote add upstream ssh://git@github.com/OpenHands/agent-canvas.git 2>/dev/null || \
  git remote set-url upstream ssh://git@github.com/OpenHands/agent-canvas.git
```

**The fork's #1 maintenance constraint is staying easy to merge with upstream `main`.**
Every change must be made with the question "how painful will this be to rebase
when upstream evolves?" in mind. Optimize for low merge-conflict surface area,
not for elegance in isolation.

## MODLOG — Live Fork-Local Modifications

This section is the **canonical inventory** of everything that diverges from
upstream `main` (i.e. `upstream/main`) on the fork's `main`. Treat it as
authoritative: if a change isn't listed here, it isn't intentionally
fork-local.

Each entry describes the **current final state** of one piece of fork-local
behavior plus the original introducing commit (as a historical anchor — full
history lives in `git log`). One-line descriptions are best; this is a
ledger, not a changelog.

> **The MODLOG is NOT a timeline. It is an unsorted inventory of the
> divergences that currently exist on the fork, grouped by topic for
> readability.** Don't read entry order as chronology. Entries are grouped
> under category subheadings (`#### …`) and may be reordered or moved
> between groups whenever it makes the inventory easier to navigate.
> Chronology lives in `git log` and in the SYNCLOG below.

### Maintenance rules

Update this MODLOG **in the same commit** as the fork-local code change it
describes. Specifically:

1. **New fork-local change** → add a new entry: one-line description of the
   behavior + the introducing commit hash.
2. **Adjustment to an existing fork-local change** → update that entry's
   description to reflect the **new final state**. Do *not* add a new commit
   hash — the entry only ever references the *original* introducing commit
   as a historical anchor. The current state is documented in the
   description; the full history is in `git log`.
3. **Reverted fork-local change** (nothing of the original change survives,
   upstream behavior fully restored) → **remove the entry entirely**. The
   MODLOG only lists divergences that *currently* exist.
4. **Change incorporated upstream** (the fork no longer needs to carry it
   because upstream now does the same thing, or exposes a hook the fork now
   consumes cleanly) → **remove the entry entirely** on the rebase commit
   that retires the fork-local code. If the fork is now *consuming* an
   upstream hook rather than overriding it, that consumption is no longer
   a divergence and doesn't need a MODLOG entry.
5. **Keep entries atomic.** One entry per piece of behavior, so each can be
   retired independently. Don't merge conceptually distinct changes that
   happen to touch the same file (e.g. a sidebar nav-label swap and a
   hypothetical sidebar ordering change should be two separate entries).
6. **Group related entries under topic subheadings.** When you add a new
   entry, place it under the existing `####` subheading that best fits its
   topic (Branding, Theming & Typography, Sidebar, Dev meta, etc.). If no
   group fits, create a new `####` subheading. Feel free to re-group or
   re-title subheadings whenever it improves clarity — the groups are a
   navigation aid, not a contract.

### Entry format

```
- **<area>** — <one-line description of the *current* final state>.
  Files: `<path>`[, `<path>` …]
  Introduced: <commit hash>
  Upstream proposal: <issue/PR url, if filed; omit otherwise>
```

### Current entries

#### Branding & identity ("rbren's mod")

- **README — fork-local header + dockerless-VM install + skill pointer** —
  top of the README declares this is a long-running fork maintained by
  Robert Brennan, documents the dockerless-on-a-VM install path (uv +
  `npm run dev:dangerously-dockerless`), and carries an "IMPORTANT" GitHub
  callout pointing maintainers and agents at the
  `.agents/skills/long-running-fork.md` skill (the canonical source for
  MODLOG / SYNCLOG / merge-friendly editing discipline). Upstream README is
  preserved verbatim below an `---` separator under an "Upstream README"
  heading.
  Files: `README.md`
  Introduced: 82f2bc7

- **Browser-tab title rebranded to "rbren's mod"** — `APP_TITLE` constant
  swapped from `"OpenHands"` to `"rbren's mod"`. Carries through to all
  `<title>` rendering (including conversation-title prefixes and agent-state
  emoji prefixes) since the rest of `useAppTitle` is untouched.
  Files: `src/hooks/use-app-title.ts`
  Introduced: 6d894ef

- **Sidebar logo tinted, wordmark added, tooltip rebranded** — the
  `OpenHandsLogo` SVG in the top-left of the sidebar is tinted with
  `var(--oh-muted)` (matching the inactive color of the Code / Customize /
  Automate nav icons) via a Tailwind arbitrary-selector class that
  overrides the SVG's inline `fill="white"` paths only (the transparent
  face cut-out stays transparent). A `"rbren's mod"` wordmark is rendered
  next to the logo in expanded mode; the component now accepts an optional
  `compact` prop that suppresses the wordmark in the collapsed 64px rail,
  passed from `sidebar-rail-body.tsx` in the collapsed branch. The hover
  tooltip and aria label are hardcoded to `"rbren's mod"` /
  `"rbren's mod logo"`, replacing the upstream
  `t(I18nKey.BRANDING$OPENHANDS{,_LOGO})` calls; the unused
  `useTranslation` / `I18nKey` imports are dropped.
  Files: `src/components/shared/buttons/openhands-logo-button.tsx`,
  `src/components/features/sidebar/sidebar-rail-body.tsx`
  Introduced: 6d894ef

#### Theming & typography

- **`rbren-earth` color theme + default-theme flip** — new fork-local entry
  appended to `COLOR_THEMES` (warm earth-tone dark palette: Sand / Palm Leaf
  / Camel / Olive Wood / Stone Brown across the surface ramp; Toffee Brown
  as the primary accent). `DEFAULT_COLOR_THEME` flipped to `"rbren-earth"`.
  Upstream themes (`openhands-deepsea`, `openhands-neutral`) are untouched.
  Files: `src/themes/color-themes.ts`
  Introduced: 82f2bc7

- **Monospace UI font on `<body>`** — body `font-family` swapped to a
  monospace stack (IBM Plex Mono → JetBrains Mono → Fira Code → system mono
  fallbacks). Applies regardless of selected color theme.
  Files: `src/index.css`
  Introduced: 82f2bc7

#### Sidebar

- **Sidebar nav-label rename** — three left-nav labels swapped: "New" →
  **Code**, "Extensions" → **Customize**, "Automations" → **Automate** (the
  third was previously a `t(I18nKey.SIDEBAR$AUTOMATIONS)` call). Each line
  carries an `rbren's mod:` marker comment.
  Files: `src/components/features/sidebar/sidebar.tsx`
  Introduced: 9d130c4

- **Workspace-picker dropdown on the conversations nav row** — new
  fork-local component `RbrenWorkspacePicker` renders a small
  outline-bordered chevron-down button on the right edge of the
  conversations / "New Chat" nav row. Clicking it opens a popover
  listing "No workspace" at the top followed by every workspace from
  `useResolvedWorkspaces`; selecting any entry immediately starts a new
  conversation in that workspace (via `useCreateConversation`) and
  navigates to `/conversations/{id}`. The picker returns `null` when
  the sidebar is collapsed. Wired into `sidebar-rail-body.tsx` via a
  thin flex wrapper around the existing `SidebarNavLink` for the
  conversations route; the upstream `SidebarNavLink` is **not**
  modified, so the feature can be retired by deleting the picker file
  plus the wrapping div.
  Files: `src/components/features/sidebar/rbren-workspace-picker.tsx`
  (new), `src/components/features/sidebar/sidebar-rail-body.tsx`
  Introduced: 05572b2

#### Dev meta / skills

- **`long-running-fork` skill** — this file. Fork-local skill documenting
  the `rbren/agent-canvas` ↔ `OpenHands/agent-canvas` remote setup,
  maintenance discipline, upstream-issue escalation path, the MODLOG, and
  the SYNCLOG. Loaded automatically on every task on the fork's `main`.
  Files: `.agents/skills/long-running-fork.md`
  Introduced: 82f2bc7

- **`create-fork` skill** — meta-skill that teaches an agent how to set
  up *another* long-running personal fork the same way this one is set
  up (fork model, ssh:// remotes, MODLOG/SYNCLOG-bearing
  `long-running-fork.md` in the new repo, upstream-sync recipe,
  conflict-recurrence escalation, AI-disclosed upstream-issue template).
  Defaults to `OpenHands/agent-sdk` as the upstream when no target is
  specified. Lives only on this fork — upstream has no notion of it.
  Files: `.agents/skills/create-fork.md`
  Introduced: 3489c8b

### Sanity-check the MODLOG against git

Before any rebase, cross-check that the MODLOG matches reality:

```sh
git fetch upstream
git --no-pager log --oneline upstream/main..HEAD
git grep -n "rbren's mod:" -- ':(exclude).agents/skills/long-running-fork.md'
```

Every distinct piece of fork-local behavior visible in `git log` /
`rbren's mod:` markers should correspond to exactly one MODLOG entry. If
something is missing on either side, fix the MODLOG before rebasing.

## SYNCLOG — Upstream Sync History

**Unlike the MODLOG, the SYNCLOG _is_ a timeline.** It is a chronological,
append-only record of every time upstream `main` was synced into the fork's
`main` (whether via merge or rebase). Newest entries go at the **bottom**.

The first entry is the commit on upstream `main` that the fork was
originally branched from (no merge happened — it's the starting point of
all later diffs). Every subsequent entry records a merge / rebase and any
conflicts, breakages, or follow-up fixes that had to be addressed to make
the sync stick.

### Why we keep this

- Provides a quick "when was the last sync?" answer without trawling
  `git log`.
- Surfaces conflict hotspots over time: if the same file shows up in the
  conflicts list across multiple sync entries, that's a strong signal to
  open an upstream issue (see "Pushing Upstream When Conflicts Recur"
  below) so the fork-local edit can be replaced with an upstream
  extensibility hook.
- Records merge-time bug fixes that aren't otherwise represented in the
  MODLOG (because they don't add fork-local behavior — they patch
  fork-local code to keep working against new upstream behavior).

### Entry format

```
- **YYYY-MM-DD** — synced upstream `main` at `<short hash>` ("<commit title>")
  - Sync commit: `<short hash on the fork's main>` (omit for the initial branch point)
  - Conflicts: <comma-separated files / paths>, or "None"
  - Notes: <one-paragraph summary of any breakages, fork-local fix-ups,
            or behavior shifts that landed in the sync commit>. Use "None"
            for clean merges.
```

The "Sync commit" is the commit on the fork's `main` that *applied* the
merge / rebase (so the reader can `git show` it). For the very first
entry — the initial branch point — there is no sync commit and the line
is omitted.

### Maintenance rules

1. **Append, never reorder.** This is the one section where commit order
   matters; entries are chronological.
2. **One entry per sync operation,** regardless of how many upstream
   commits it pulled in. Reference the *tip* of `main` at sync time, not
   each individual upstream commit.
3. **A "clean" sync still gets an entry.** Even if there are no
   conflicts, record the sync — that's the evidence that the branch was
   up-to-date at that point in time.
4. **Don't retroactively edit historical entries** to "fix" descriptions
   of past conflicts. If a follow-up fix landed later, add a new entry
   for the follow-up rather than rewriting history. (Typo / formatting
   fixes are obviously fine.)
5. **Cross-link to upstream issues.** If a recurring conflict triggered
   an upstream-issue proposal (per "Pushing Upstream When Conflicts
   Recur"), drop the issue/PR URL in the Notes section.

### Entries

- **2026-05-16** — branched from `f7c7dbe` ("perf(snapshots): skip retries
  on comparison pass, suppress consent modal (#505)") on upstream `main`.
  - Conflicts: N/A (initial branch point, not a sync)
  - Notes: starting commit of the long-running fork. All fork-local
    divergences listed in the MODLOG above were introduced on top of this
    commit. The initial fork-local commit was `82f2bc7` ("Initialize rbren
    long-running branch"). This work originally lived on a branch called
    `rbren` inside `OpenHands/agent-canvas`; it was subsequently moved to
    the `main` branch of a dedicated fork at `rbren/agent-canvas` (no
    history rewrite — same commit graph, new home).

- **2026-05-16** — synced upstream `main` at `56a3d8a4` ("fix: prevent LLM
  profile actions menu from being clipped by scroll container (#523)").
  - Sync commit: this commit (see `git log` for hash)
  - Conflicts: `src/components/shared/buttons/openhands-logo-button.tsx`,
    `src/components/features/sidebar/sidebar.tsx`
  - Notes: Pulled in 10 upstream commits (`76a0e806..56a3d8a4`) via
    `git rebase --empty=drop upstream/main`. The conversation-panel
    filter-persistence work the fork had been carrying as a merge of
    `feat/persist-conversation-panel-preferences` landed upstream as
    PR #510 (`4a72f6bd`); the fork-local cherry (`cf13abc9`) was detected
    by `git rebase` as already-applied and dropped automatically. Two
    files conflicted, both because of upstream's chat-first home /
    redesign work (PR #514 + #508): `openhands-logo-button.tsx` —
    upstream refactored the component to accept optional
    `className` / `logoClassName` / `logoWidth` / `logoHeight` props with
    `cn()`-based class merging; resolution kept all upstream props *and*
    layered the fork's `compact` prop, var(--oh-muted) tint, and wordmark
    on top (additive — no upstream behavior overridden). `sidebar.tsx` —
    upstream's redesigned collapsed-rail logo block now passes the new
    width/height/className props; resolution kept those props and added
    `compact` so the rail still suppresses the wordmark. All 18
    fork-local `rbren's mod:` markers were preserved (re-grep clean).
    The `enable-subagent-delegation` feature branch the fork had merged
    in (`9ed13b24`) has *not* landed on upstream `main` yet and was
    replayed onto the new base as a normal commit (`093f2ee6`).

## Core Principles

1. **Additive, not invasive.** Prefer adding *new* files, *new* entries, or *new*
   variants over editing existing ones in place. Adding a new theme to a registry
   is great; mutating the values of an existing theme is bad — the next upstream
   change to that theme will conflict.

2. **Smallest possible diff to shared files.** When you *must* edit a file that
   is also maintained upstream, make the change as small and as localized as
   possible. One-line edits at the bottom of a file rebase cleanly; reorganizing
   the file or sprinkling edits throughout it does not.

3. **Mark every fork-local edit clearly.** Any line that exists only on the
   fork must carry a `rbren's mod:` comment so future merges can immediately
   identify what is local vs. upstream. This also makes it trivial to grep
   for fork-local code:
   ```sh
   git grep -n "rbren's mod:"
   ```
   `rbren's mod:` is the canonical marker token. Don't introduce variants
   (`rbren:`, `rbren branch:`, `rbren fork:`, etc.) — they'll just defeat the
   grep. If you ever need to rename the token, do it as a coordinated sweep
   across the whole tree in a single commit and update this skill.

4. **Quarantine fork-local code where possible.** Prefer putting fork-local code
   in a file that *only exists on the fork* (e.g. under `.agents/skills/`,
   a new file under `src/themes/`, a new script under `scripts/`). New files
   never conflict on merge; edits to shared files often do.

5. **Don't reformat shared files.** No drive-by formatting, import reordering,
   prettier passes, or comment cleanups on files you didn't otherwise need to
   touch. Every reformatted line is a future conflict.

6. **Don't rename or move shared files.** Renames are the worst-case conflict —
   git often can't follow them across an upstream rebase and the rebase has to
   be resolved by hand.

## Concrete Patterns

### Theming / styling

- **Good:** Add a new entry to `COLOR_THEMES` in `src/themes/color-themes.ts`
  (e.g. `"rbren-hackery"`), and flip `DEFAULT_COLOR_THEME` to point at it. The
  new entry is fork-local; the `DEFAULT_COLOR_THEME` flip is a one-line edit
  that rebases cleanly.
- **Bad:** Mutating the hex values inside `openhands-deepsea` or
  `openhands-neutral`, editing `--cool-grey-*` in `index.css`, or rewriting
  `hero.ts` / `tailwind.config.js` color tokens in place. Those files are
  actively maintained upstream and will conflict on every rebase.
- **Body / font-family overrides:** prefer a *new* CSS file imported once at
  app entry (or a single localized edit clearly tagged `rbren's mod:`) over
  spreading font changes across many components.

### React components / TS modules

- **Good:** Add a new component file and import it from a single place. Add a
  new hook in a new file. Add a new route module.
- **Bad:** Editing a heavily-trafficked shared component to add a fork-local
  flag, prop, or branch. If you really must, gate it behind a single
  fork-local feature flag (see below) and keep the touched lines minimal.

### Fork-local feature flags

For behavior toggles that genuinely require editing a shared file, prefer
threading them through a *single* fork-local constants module rather than
sprinkling literals through the codebase. Then the only shared-file edit is
"read the flag", and the flag itself lives in a fork-only file. Example:

```ts
// src/fork/rbren-flags.ts   (fork-local, new file, never conflicts)
export const RBREN_USE_HACKERY_THEME_BY_DEFAULT = true;
```

### Tests

- Don't update upstream snapshot tests just because the theme looks different
  on the fork. Either:
  - Mark those snapshot tests skipped on the fork's `main` with a clear
    `rbren's mod:` comment, or
  - Maintain a parallel fork-local snapshot directory and switch on the
    fork-local flag.
- New tests for fork-local behavior should live in fork-local test files so
  they don't fight upstream test churn.

### Scripts / tooling

- New scripts go in `scripts/` with an `rbren-` prefix
  (e.g. `scripts/rbren-deploy.mjs`). Don't extend `package.json` scripts
  upstream maintains; add new `rbren:*` scripts instead so the diff to
  `package.json` is purely additive lines at the end of the `scripts` object.

### Documentation

- The fork's `README.md` divergence from upstream is **expected and
  documented** — the top of the README explains this is a long-running fork
  and the rest of the file is "Upstream README". When rebasing onto upstream,
  resolve `README.md` conflicts by keeping the `rbren` header section and
  replacing the "Upstream README" body with the new upstream README content
  verbatim.

## Rebasing / Merging Upstream

When pulling in upstream `main` from `OpenHands/agent-canvas`:

1. Fetch upstream first (it's a separate remote — see "Remote setup" above):
   ```sh
   git fetch upstream
   ```
2. Prefer **rebase** over **merge** so the fork's `main` stays a clean
   linear set of "rbren-only" commits on top of upstream `main`. This keeps
   `git log upstream/main..origin/main` readable as exactly "what is
   fork-local".
   ```sh
   git rebase upstream/main
   ```
3. Before rebasing, run:
   ```sh
   git grep -n "rbren's mod:" -- ':(exclude).agents/skills/long-running-fork.md'
   ```
   to remind yourself of every fork-local edit. If something on that list no
   longer needs to exist (because upstream now does the same thing), drop it
   during the rebase instead of carrying it forward.
4. If a rebase hits a conflict in a file that *only* contains "rbren's mod:"
   markers, prefer resolving by re-applying the marker on top of the new
   upstream content rather than blindly keeping the fork-local version. The
   marker is the contract; the surrounding lines belong to upstream.
5. After the rebase, force-push with lease to the **fork** (origin):
   ```sh
   git push --force-with-lease origin main
   ```
   (Never plain `--force` against a long-running branch. Never push to
   `upstream`.)

## Pushing Upstream When Conflicts Recur

The cheapest fork-local change is the one you don't have to maintain. If you
find yourself **repeatedly resolving conflicts in the same upstream code**
because of a fork-local tweak — and you have an idea for how upstream could
expose that surface as a configuration point — open an issue on the upstream
repo proposing it. A small upstream extensibility hook usually beats indefinite
rebase friction.

### When to file an upstream issue

File one when **two or more** of these are true:

- The same upstream file (or small cluster of files) has conflicted on the
  fork across multiple rebases.
- The fork-local edit is structurally the same each time (a label swap,
  a default value flip, a feature gated on / off, a different color, etc.).
- The change is something other fork maintainers would plausibly also want
  to make — i.e. it generalizes, not "rbren's idiosyncratic preference".
- You can describe a concrete extensibility hook that would let upstream stay
  opinionated about defaults while letting forks override cleanly (a config
  flag, a slot/render-prop, a registry entry, a theme key, an env var, etc.).

If only one of those is true it's probably not worth filing — just keep the
local edit and move on.

### Where to file

Upstream is **`OpenHands/agent-canvas`**. Use the GitHub MCP tools (e.g.
`github_create_issue` with `owner: "OpenHands"`, `repo: "agent-canvas"`).

### Issue template

Title: `Proposal: make <X> configurable to reduce fork-rebase friction`

Body (fill in each section):

```
### Context
This came up while maintaining the long-running `rbren/agent-canvas` fork
of `OpenHands/agent-canvas`, where a fork-local tweak to <FILE / FEATURE>
has conflicted on <N> consecutive rebases of upstream `main` into the
fork's `main`.

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
- reading a value from a config / env var with current behavior as
  fallback.>

### Backward compatibility
<Confirm the proposal preserves current default behavior so it is a
pure additive change for non-fork consumers.>

### Out of scope
<Explicitly state this issue is *not* asking upstream to adopt the
fork-local value — only to expose the seam. Forks remain responsible
for their own values.>
```

Always include the standard AI-disclosure line in the body, since the issue
will be read by humans:

> _This issue was opened by an AI agent (OpenHands) on behalf of @rbren while
> maintaining the long-running `rbren/agent-canvas` fork._

### After filing

- Drop the issue URL into a one-line comment alongside the fork-local edit:
  ```ts
  label: "Code", /* rbren's mod: was "New"; upstream: OpenHands/agent-canvas#NNN */
  ```
  That way the next rebaser knows whether the upstream proposal landed and
  the fork-local edit can be retired.
- If upstream lands the hook, your next rebase should **delete** the fork-local
  edit and switch to consuming the new hook. That is the win condition.

### What *not* to do

- Don't file an issue to ask upstream to adopt your preferred value
  (theme color, label text, default route). Upstream owns defaults; the fork
  owns overrides.
- Don't open a PR against upstream with the fork-local change directly. File
  the issue first; let maintainers decide on the seam shape before any PR.
- Don't bundle multiple unrelated proposals into one issue — one
  extensibility hook per issue keeps the discussion (and any subsequent PR)
  focused.

## When in Doubt

If a proposed change *cannot* be made additively and *must* edit a shared file,
stop and ask:

- Could this live in a new file instead?
- Could this be expressed as a single one-line toggle that reads a fork-local
  flag?
- If neither — is the benefit really worth re-resolving this conflict on every
  upstream rebase for the foreseeable future?

The default answer for invasive edits to shared files is **no**. The cost of
this fork is rebase pain, and rebase pain compounds.
