---
name: long-running-fork
description: Repo-specific guidance for the `rbren` long-running fork of OpenHands/agent-canvas. Auto-loaded for any task on this branch so changes stay easy to merge from / into `main`.
triggers:
- rbren
- long-running fork
- merge upstream
- rebase upstream
- upstream merge
---

# Long-Running Fork — `rbren` Branch

This branch (`rbren`) is a **long-running personal fork** of `OpenHands/agent-canvas`
maintained by Robert Brennan. It carries personal preferences (theming, layout
tweaks, dev-loop helpers, etc.) on top of `main` and is rebased / fast-forwarded
onto upstream periodically.

**The branch's #1 maintenance constraint is staying easy to merge with `main`.**
Every change must be made with the question "how painful will this be to rebase
when upstream evolves?" in mind. Optimize for low merge-conflict surface area,
not for elegance in isolation.

## MODLOG — Live Fork-Local Modifications

This section is the **canonical inventory** of everything that diverges from
upstream `main` on this branch. Treat it as authoritative: if a change isn't
listed here, it isn't intentionally fork-local.

Each entry describes the **current final state** of one piece of fork-local
behavior plus the original introducing commit (as a historical anchor — full
history lives in `git log`). One-line descriptions are best; this is a
ledger, not a changelog.

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

### Entry format

```
- **<area>** — <one-line description of the *current* final state>.
  Files: `<path>`[, `<path>` …]
  Introduced: <commit hash>
  Upstream proposal: <issue/PR url, if filed; omit otherwise>
```

### Current entries

- **README — fork-local header + dockerless-VM install instructions** — top of
  the README declares this is a long-running fork maintained by Robert
  Brennan and documents the dockerless-on-a-VM install path (uv + `npm run
  dev:dangerously-dockerless`). Upstream README is preserved verbatim below
  an `---` separator under an "Upstream README" heading.
  Files: `README.md`
  Introduced: 82f2bc7

- **Monospace UI font on `<body>`** — body `font-family` swapped to a
  monospace stack (IBM Plex Mono → JetBrains Mono → Fira Code → system mono
  fallbacks). Applies regardless of selected color theme.
  Files: `src/index.css`
  Introduced: 82f2bc7

- **`rbren-earth` color theme + default-theme flip** — new fork-local entry
  appended to `COLOR_THEMES` (warm earth-tone dark palette: Sand / Palm Leaf
  / Camel / Olive Wood / Stone Brown across the surface ramp; Toffee Brown
  as the primary accent). `DEFAULT_COLOR_THEME` flipped to `"rbren-earth"`.
  Upstream themes (`openhands-deepsea`, `openhands-neutral`) are untouched.
  Files: `src/themes/color-themes.ts`
  Introduced: 82f2bc7

- **Sidebar nav-label rename** — three left-nav labels swapped: "New" →
  **Code**, "Extensions" → **Customize**, "Automations" → **Automate** (the
  third was previously a `t(I18nKey.SIDEBAR$AUTOMATIONS)` call). Each line
  carries an `rbren branch:` marker comment.
  Files: `src/components/features/sidebar/sidebar.tsx`
  Introduced: 9d130c4

- **`long-running-fork` skill** — this file. Fork-local skill documenting
  maintenance discipline, upstream-issue escalation path, and this MODLOG.
  Loaded automatically on every task for this branch.
  Files: `.agents/skills/long-running-fork.md`
  Introduced: 82f2bc7

### Sanity-check the MODLOG against git

Before any rebase, cross-check that the MODLOG matches reality:

```sh
git --no-pager log --oneline main..HEAD
git grep -n "rbren branch:" -- ':(exclude).agents/skills/long-running-fork.md'
```

Every distinct piece of fork-local behavior visible in `git log` /
`rbren branch:` markers should correspond to exactly one MODLOG entry. If
something is missing on either side, fix the MODLOG before rebasing.

## Core Principles

1. **Additive, not invasive.** Prefer adding *new* files, *new* entries, or *new*
   variants over editing existing ones in place. Adding a new theme to a registry
   is great; mutating the values of an existing theme is bad — the next upstream
   change to that theme will conflict.

2. **Smallest possible diff to shared files.** When you *must* edit a file that
   is also maintained upstream, make the change as small and as localized as
   possible. One-line edits at the bottom of a file rebase cleanly; reorganizing
   the file or sprinkling edits throughout it does not.

3. **Mark every fork-local edit clearly.** Any line that exists only on this
   branch must carry a `rbren branch:` (or `rbren:`) comment so future merges
   can immediately identify what is local vs. upstream. This also makes it
   trivial to grep for fork-local code: `git grep -n "rbren branch:"`.

4. **Quarantine fork-local code where possible.** Prefer putting fork-local code
   in a file that *only exists on this branch* (e.g. under `.agents/skills/`,
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
  app entry (or a single localized edit clearly tagged `rbren branch:`) over
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
  on this branch. Either:
  - Mark those snapshot tests skipped on the `rbren` branch with a clear
    `rbren branch:` comment, or
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

- The branch's `README.md` divergence from upstream is **expected and
  documented** — the top of the README explains this is a long-running branch
  and the rest of the file is "Upstream README". When rebasing onto upstream,
  resolve `README.md` conflicts by keeping the `rbren` header section and
  replacing the "Upstream README" body with the new upstream README content
  verbatim.

## Rebasing / Merging Upstream

When pulling in upstream `main`:

1. Prefer **rebase** over **merge** so the branch stays a clean linear set of
   "rbren-only" commits on top of `main`. This keeps `git log main..rbren`
   readable as exactly "what is fork-local".
2. Before rebasing, run:
   ```sh
   git grep -n "rbren branch:" -- ':(exclude).agents/skills/long-running-fork.md'
   ```
   to remind yourself of every fork-local edit. If something on that list no
   longer needs to exist (because upstream now does the same thing), drop it
   during the rebase instead of carrying it forward.
3. If a rebase hits a conflict in a file that *only* contains "rbren branch:"
   markers, prefer resolving by re-applying the marker on top of the new
   upstream content rather than blindly keeping the fork-local version. The
   marker is the contract; the surrounding lines belong to upstream.
4. After the rebase, force-push with lease:
   ```sh
   git push --force-with-lease origin rbren
   ```
   (Never plain `--force` against a long-running branch.)

## Pushing Upstream When Conflicts Recur

The cheapest fork-local change is the one you don't have to maintain. If you
find yourself **repeatedly resolving conflicts in the same upstream code**
because of a fork-local tweak — and you have an idea for how upstream could
expose that surface as a configuration point — open an issue on the upstream
repo proposing it. A small upstream extensibility hook usually beats indefinite
rebase friction.

### When to file an upstream issue

File one when **two or more** of these are true:

- The same upstream file (or small cluster of files) has conflicted on this
  branch across multiple rebases.
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
This came up while maintaining the long-running `rbren` fork of
agent-canvas, where a fork-local tweak to <FILE / FEATURE> has
conflicted on <N> consecutive rebases of `main` into `rbren`.

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
> maintaining the long-running `rbren` fork._

### After filing

- Drop the issue URL into a one-line comment alongside the fork-local edit:
  ```ts
  label: "Code", /* rbren branch: was "New"; upstream: OpenHands/agent-canvas#NNN */
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
this branch is rebase pain, and rebase pain compounds.
