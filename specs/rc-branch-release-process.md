# RC Branch Release Process — Design Plan

This document describes the planned shift from the current merge-to-main tagging model
to a stabilization branch (release candidate) model.

---

## Current Model (for reference)

```
main ──────────────────────────────────────────────────────►
         │ create rel-1.5.0 PR
         ▼
      rel-1.5.0 ──── (version bump commit) ──── merge to main
                                                      │
                                         create-release.yml fires
                                         creates tag v1.5.0
                                              │
                                    npm-publish.yml ──► npm
                                    docker.yml       ──► GHCR
```

**Key characteristic:** The release branch is ephemeral — it lives only long enough for the
PR to merge. The version bump goes into main along with the release.

---

## New Model

```
main ─────────────────────────────────────────────────────────────────────────────►
         │                  (main keeps moving; fixes cherry-picked in separately)
         │ branch at stabilization point
         ▼
   rc-1.5.0 ──── fix A ──── fix B ──── fix C ──── [QA passes] ──── tag v1.5.0
                  │           │                                          │
                fixes also                                    npm-publish + docker
                cherry-picked                                  (from rc branch)
                  to main
```

**Key characteristics:**
- `rc-X.Y.Z` is a **long-lived** stabilization branch.
- Fixes are **cherry-picked** to the rc branch (they also land in main separately).
- The rc branch is **never merged back** to main.
- Tagging happens directly on the rc branch commit.
- CI, Docker, and snapshot tests run continuously on the rc branch as fixes land.

---

## Design Decisions (requiring your input)

### Decision 1 — Tag naming format

| Option | Tag looks like | Impact |
|---|---|---|
| **A (recommended)** | `v1.5.0` | Zero changes to `npm-publish.yml` and `docker.yml` triggers; matches npm/GitHub convention |
| **B (your suggestion)** | `release-1.5.0` | Requires updating `on: push: tags:` in two workflows; departs from npm semver convention |

The user-facing effect is identical either way; it only affects workflow trigger patterns
and the GitHub Releases page. **Recommendation: keep `v*` to avoid unnecessary churn.**

If you prefer `release-*`, that's fine — both options are straightforward to implement.

---

### Decision 2 — Who/how creates the release tag

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A: Manual git push** | Release manager runs `git tag v1.5.0 && git push origin v1.5.0` on the rc branch | Simplest | No validation gate; typos; no audit trail in Actions |
| **B (recommended): `workflow_dispatch` workflow** | New `promote-rc-to-release.yml` workflow; triggered from GitHub UI by an authorized person with inputs: `branch` + `version` | Validates package.json version matches, CI is passing, creates the tag with PAT so downstream workflows fire | Slightly more ceremony |

**Recommendation: Option B.** The workflow can enforce that:
- The package.json version on the rc branch matches the version being tagged.
- The rc branch's latest CI run passed.
- The tag doesn't already exist.
It creates an explicit, auditable "promotion" event in GitHub Actions history.

---

### Decision 3 — When is `package.json` version bumped on the rc branch?

| Option | Timing | Notes |
|---|---|---|
| **A (recommended)** | At rc branch creation | The rc branch immediately reflects the release version; Docker images and npm dry-runs during QA show the correct version |
| **B** | Only when promoting to release | The rc branch has the old version throughout QA; the promotion workflow bumps+commits before tagging |

**Recommendation: Option A.** Bump `package.json` as the first commit on the rc branch
(mirroring the current `rel-*` model). The promotion workflow then just validates and tags.

---

### Decision 4 — Snapshot test baselines on rc branches

The snapshot workflow currently generates fresh baselines on every push to `main` and
downloads those baselines to compare against in PRs. Options for rc branches:

| Option | Behavior | Notes |
|---|---|---|
| **A** | rc branches compare against main baselines | Simple. Can produce false failures if rc intentionally diverges from main (e.g. version string in UI changes). |
| **B (recommended)** | rc branches generate their own baselines, stored as `snapshot-baselines-rc-X.Y.Z` artifact | Correct: rc and main can diverge without false noise. PRs targeting the rc branch download the rc baseline. |
| **C** | No snapshot tests on rc branches | Fine for now if the baseline management complexity is not worth it. |

**Recommendation: Option B.** The `snapshot-tests.yml` condition for generating vs comparing
is keyed off the branch name; adding `rc-*` as a "baseline-generating" branch is a small change.

---

## Required Changes

### 1. `ci.yml` — Run CI on rc branch pushes

Add `rc-*` to the `push: branches` trigger. This ensures that every fix cherry-picked
to an rc branch goes through the full lint/test/build matrix automatically.

```yaml
# Before
push:
  branches: [main]

# After
push:
  branches: [main, "rc-*"]
```

---

### 2. `docker.yml` — Build Docker images on rc branch pushes

Add `rc-*` to the `push: branches` trigger. The existing tag-computing logic in
`prep` already handles arbitrary branch names by sanitizing them into Docker-safe
tags. A push to `rc-1.5.0` will produce:

- `ghcr.io/openhands/agent-canvas:sha-<short-sha>-amd64/arm64` (always)
- `ghcr.io/openhands/agent-canvas:rc-1.5.0-amd64/arm64` (branch tag)
- Multi-arch manifests for both of the above

This gives QA a stable `rc-1.5.0` Docker tag throughout the stabilization period,
plus per-commit `sha-*` tags for precise reproducibility.

```yaml
# Before
push:
  branches: [main]
  tags: ["v*"]

# After
push:
  branches: [main, "rc-*"]
  tags: ["v*"]          # or ["release-*"] if Decision 1 = B
```

---

### 3. `snapshot-tests.yml` — Handle rc branch baselines

Extend the baseline-generation condition from `refs/heads/main` to also cover
`rc-*` branches. The artifact name becomes branch-scoped so rc and main don't
overwrite each other:

```yaml
# Baseline generation condition
if: >
  github.ref == 'refs/heads/main' ||
  startsWith(github.ref, 'refs/heads/rc-') ||
  github.event.inputs.force_update == 'true'

# Artifact name (parameterized)
- name: Compute artifact name
  id: artifact
  run: |
    BRANCH="${GITHUB_REF#refs/heads/}"
    SAFE=$(echo "$BRANCH" | tr '/' '-')
    echo "name=snapshot-baselines-${SAFE}" >> "$GITHUB_OUTPUT"
```

PRs targeting an rc branch download that rc branch's baseline rather than main's.
The "wait for in-progress baseline run" step needs to scope the wait to the right branch.

---

### 4. `create-release.yml` — Repurpose for tag-push model

The current workflow fires on `pull_request: [closed]` targeting main with a `rel-*`
head branch. Under the new model there is no such PR merge, so this trigger is removed.

**New role:** This workflow fires on `push: tags: [v*]` (or `release-*`) and creates
the GitHub Release from the tag. Most of the existing logic (notes generation,
pre-release detection) carries over; the trigger and commit-SHA resolution change.

```yaml
on:
  push:
    tags: ["v*"]           # or ["release-*"] per Decision 1
```

The target commit for the release is `github.sha` (the commit the tag points at),
which is the rc branch tip — not a merge commit to main.

---

### 5. NEW — `promote-rc-to-release.yml` (if Decision 2 = B)

A new `workflow_dispatch` workflow that acts as the gated "promote" button.
Inputs:

| Input | Description | Example |
|---|---|---|
| `rc_branch` | The rc branch to promote | `rc-1.5.0` |
| `version` | The release version (without `v` prefix) | `1.5.0` |

Steps:
1. Checkout the rc branch tip.
2. Validate `package.json` version matches `version` input.
3. Query GitHub API: confirm latest CI workflow run on the rc branch passed.
4. Check the tag does not already exist.
5. Create and push `v${version}` tag using a PAT (so downstream workflows fire).
6. Write a job summary with links to the resulting GitHub Release.

This workflow needs `OPENHANDS_BOT_GITHUB_PAT_PUBLIC` (already available, used by
`create-release.yml`) for tag creation.

---

### 6. `mock-llm-e2e.yml` — Support PRs targeting rc branches

The `e2e-tests` label trigger already works for any PR. The only explicit branch
filter in `mock-llm-e2e.yml` should be checked to ensure it doesn't restrict to
`main`-targeting PRs only. (Currently it has no such filter, so PRs targeting
rc branches already work with the label.)

No changes needed here, but confirm `base_branch` filtering is not present.

---

### 7. `release` skill (`/agents/skills/release.md`) — Full rewrite

The skill guides agents through the release process. Under the new model the steps are:

1. **Create the rc branch** from the stabilization commit.
2. **Bump `package.json`** version on the rc branch (first commit).
3. **CI and Docker** run automatically on every push to the rc branch.
4. **Fixes** are cherry-picked to the rc branch via PRs targeting it.
5. **QA** is conducted against the `rc-X.Y.Z` Docker image / live stack.
6. **Promote**: trigger `promote-rc-to-release.yml` from the GitHub Actions UI.
7. **Verify**: npm package and Docker release images appear.

---

### 8. `AGENTS.md` — Update release process documentation

The "Release automation" note in AGENTS.md currently documents the `rel-*` / merge-to-main
model. This needs updating to describe the rc branch model, tag naming, and the new
`promote-rc-to-release.yml` workflow.

---

## Branch Protection Recommendations

These are GitHub repository settings (not workflow files). They must be configured in
**Settings → Rules → Rulesets** (or classic Branch Protection rules).

### `rc-*` branches

| Rule | Setting | Rationale |
|---|---|---|
| Require a pull request before merging | ✅ Enabled, 1 required review | All changes to rc branches go through a PR; this is the PM approval gate |
| Required reviewers | Product management team or specific individuals | Ensures PM sign-off on every fix landing in rc |
| Required status checks | `test-and-build (ubuntu)` from CI | Confirms the fix doesn't break the build |
| Block force pushes | ✅ Enabled | Protects the linear history of the rc branch |
| Restrict branch deletion | ✅ Enabled (or restrict to admins) | rc branches should persist as historical records |
| Restrict branch creation | Specific team only | Prevents unauthorized rc branches |

### Tag protection (for `v*` or `release-*` tags)

GitHub supports tag protection rules under **Settings → Rules → Rulesets → Tags**.

| Rule | Setting |
|---|---|
| Pattern | `v*` (or `release-*`) |
| Restrict creation | Service account / bot only (so only the promotion workflow can create release tags) |
| Block force pushes | ✅ Enabled |
| Block deletion | ✅ Enabled |

**Note:** Restricting tag creation to the bot/service account is the enforcement mechanism
that ensures all releases go through the promotion workflow rather than ad-hoc `git push`.

---

## Open Questions

Before implementation begins, please confirm:

1. **Tag format**: Keep `v*` (recommended) or switch to `release-*`?
2. **Promotion mechanism**: `workflow_dispatch` promote workflow (recommended) or manual git tag?
3. **Snapshot strategy for rc branches**: Generate rc-scoped baselines (recommended), compare against main baselines, or skip?
4. **Package.json bump timing**: At branch creation (recommended) or only at promotion time?
5. **Branch protection**: Should PRs to rc branches require approval from a specific GitHub team? If so, what is the team name in GitHub?
6. **RC branch retention**: Should rc branches be kept indefinitely (as historical record) or deleted after the release ships?
7. **`npm-publish.yml` dist-tag policy**: The current workflow publishes everything as `latest` (see the comment about issue #395). Should rc releases also be published as `latest`, or should they use a dist-tag like `rc`?

---

## Implementation Order (once decisions are made)

1. Update `ci.yml` — add `rc-*` to push triggers (5 min)
2. Update `docker.yml` — add `rc-*` to push triggers (5 min)
3. Update `snapshot-tests.yml` — rc baseline support (30 min)
4. Rework `create-release.yml` — tag-push trigger model (20 min)
5. Create `promote-rc-to-release.yml` (45 min)
6. Rewrite `release` skill (20 min)
7. Update `AGENTS.md` (10 min)
8. Configure branch/tag protection rules (manual, in GitHub UI — 15 min)
