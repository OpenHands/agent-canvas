---
name: release
description: Guide the release process for @openhands/agent-canvas — version bump PR, E2E validation, merge with automatic tagging, and downstream npm/Docker publishing.
triggers:
- release
- new release
- cut a release
- publish release
- bump version
---

# Release Process for @openhands/agent-canvas

This project uses **stabilization branches** for releases. An `rc-X.Y.Z` branch is
created from a known-good commit on `main`, fixes are cherry-picked to it as needed,
QA is run against it, and it is promoted to a release tag when ready. `main` keeps
moving independently; rc branches are never merged back.

Follow these steps **in order**. Do NOT skip ahead — each step has a checkpoint.

---

## Step 1: Confirm the version

**IMPORTANT: Get explicit user confirmation before doing anything.**

Read the current version from `package.json`:

```bash
node -p "require('./package.json').version"
```

Read the latest release tag so you can suggest a sensible next version:

```bash
gh release list --limit 5 --json tagName,publishedAt --jq '.[] | "\(.tagName) \(.publishedAt)"'
```

Suggest the next version using these rules:
- Patch release of `1.2.3` → suggest `1.2.4` (but mention `1.3.0` minor or `2.0.0` major)
- Pre-release `1.0.0-rc.1` → suggest `1.0.0-rc.2` (bump last numeric segment)

**Version format**: semver with optional pre-release suffix.
- Pre-release: `1.0.0-rc.1`, `1.0.0-beta.2`
- Stable: `1.0.0`, `1.1.0`, `2.0.0`

**STOP HERE.** Present the current version and latest release, suggest the next version, and ask:

> The current `main` version is `<current>`. The latest release is `<latest-tag>`.
> I'd suggest releasing `<suggested>`. What version would you like to create an rc branch for?

**Do not proceed to Step 2 until the user confirms a version.**

---

## Step 2: Create the rc branch and bump the version

### 2a. Create the rc branch

The branch **must** be named `rc-<version>` (e.g., `rc-1.5.0`). CI, Docker image
builds, and snapshot baselines all run automatically on every push to `rc-*` branches.

```bash
git checkout main
git pull origin main
git checkout -b rc-<version>
```

### 2b. Bump the version

Update `package.json` and `package-lock.json`:

```bash
npm version <version> --no-git-tag-version
```

### 2c. Update version references in README.md

`README.md` contains Docker image tags referencing a specific version. Update them:

```bash
sed -i 's/ghcr.io\/openhands\/agent-canvas:[0-9]*\.[0-9]*\.[0-9]*[^ ]*/ghcr.io\/openhands\/agent-canvas:<version>/g' README.md
```

Verify:

```bash
git diff --stat
# Expected: package.json, package-lock.json, README.md
```

### 2d. Commit and push

```bash
git add package.json package-lock.json README.md
git commit -m "chore: bump version to <version>"
git push -u origin rc-<version>
```

The push immediately triggers:
- **CI** (lint, test, build) on the rc branch
- **Docker** image build → `ghcr.io/openhands/agent-canvas:rc-<version>` and `sha-<hash>`
- **Snapshot** baseline generation for this rc branch (stored separately from main's baselines)

---

## Step 3: Monitor initial CI

```bash
gh run list --branch rc-<version> --limit 5
```

Wait for the first CI run to succeed before handing the branch off for QA. If it fails,
fix it with a direct commit to the rc branch (no PR needed for the initial bump commit).

---

## Step 4: Stabilization — applying fixes

During QA, fixes are submitted as **PRs targeting `rc-<version>`**. The same fix should
also be submitted to `main` by the developer (cherry-pick or separate PR).

Each PR to the rc branch triggers:
- CI checks (required to pass before merge)
- Snapshot comparison against the rc-branch baselines
- Mock-LLM E2E tests when the `e2e-tests` label is present

Monitor fixes landing:

```bash
gh pr list --base rc-<version>
```

QA tests against the Docker image:
```bash
docker pull ghcr.io/openhands/agent-canvas:rc-<version>
docker run -it --rm -p 8000:8000 ghcr.io/openhands/agent-canvas:rc-<version>
```

---

## Step 5: Promote to release

When QA signs off, trigger the promotion workflow. This is the gated step that:
1. Validates `package.json` version matches the version input
2. Confirms the latest CI run on the rc branch succeeded
3. Pushes the `v<version>` tag using a PAT, which fires the downstream workflows

**Via the GitHub UI:**
1. Go to **Actions → Promote RC to Release → Run workflow**
2. Set `rc_branch` = `rc-<version>`
3. Set `version` = `<version>` (without `v` prefix)
4. Click **Run workflow**

**Via the CLI:**

```bash
gh workflow run promote-rc-to-release.yml \
  --field rc_branch=rc-<version> \
  --field version=<version>
```

Monitor the promotion run:

```bash
gh run list --workflow=promote-rc-to-release.yml --limit=1
gh run watch   # paste the run ID
```

### What happens when the promotion tag is pushed

The `v<version>` tag push triggers three concurrent workflows:

| Workflow | What it does |
|---|---|
| **create-release.yml** | Creates the GitHub Release with auto-generated notes |
| **npm-publish.yml** | Publishes `@openhands/agent-canvas@<version>` to npm |
| **docker.yml** | Builds and pushes `ghcr.io/openhands/agent-canvas:<version>` Docker images |

For **stable versions** (`X.Y.Z`), npm publishes under `--tag latest`.
For **pre-release versions** (`X.Y.Z-rc.N` etc.), npm publishes under `--tag rc`.

---

## Step 6: Verify the release

```bash
# GitHub Release
gh release view v<version>

# npm
npm view @openhands/agent-canvas@<version>

# Docker
docker pull ghcr.io/openhands/agent-canvas:<version>

# Downstream workflow status
gh run list --workflow=npm-publish.yml --limit=1
gh run list --workflow=docker.yml --limit=1
```

---

## Troubleshooting

### Promotion fails: package.json version mismatch
The rc branch's `package.json` must already be bumped to `<version>`. If you forgot:
```bash
git checkout rc-<version>
npm version <version> --no-git-tag-version
git commit -am "chore: bump version to <version>"
git push
```
Then re-run the promotion workflow.

### Promotion fails: CI not passing
Fix the failing test or build on the rc branch (via a PR or direct commit), wait for
CI to pass, then re-run the promotion workflow.

### Tag already exists
```bash
gh release delete v<version> --yes
git push origin :refs/tags/v<version>
```
Then re-run the promotion workflow.

### npm publish failed: version mismatch
`npm-publish.yml` validates that `package.json` version matches the tag version.
If they don't match, the publish will fail. Verify the rc branch has the correct version
and that the promotion used the matching `version` input.

### Snapshot tests: false failures on rc branch PRs
Snapshot baselines for rc branches are stored separately from `main`'s baselines
(artifact `snapshot-baselines-rc-<version>`). If no baseline exists yet for the rc
branch (e.g. the first push to the rc branch hasn't completed its baseline run),
all snapshots will appear as "new". Wait for the baseline run on the rc branch to
complete, then re-run the PR snapshot test.

---

## Reference

The rc-branch stabilization model:

```
main ─────────────────────────────────────────────────────────────────────────────►
         │
         │ create rc-X.Y.Z (version bump first commit)
         ▼
   rc-X.Y.Z ──── fix A ──── fix B ──── [QA passes] ──── promote ──── tag vX.Y.Z
                  │           │                                            │
                also         also                               npm-publish + docker
              to main       to main
```

Key points:
- `rc-*` branches are **long-lived** and **never merged back** to `main`.
- The rc branch is retained after the release for historical reference.
- `main` moves on independently; fixes land there separately from the rc branch.
- The only way to create a release tag is through the `promote-rc-to-release.yml` workflow.
