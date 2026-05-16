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
