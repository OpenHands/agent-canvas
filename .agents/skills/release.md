---
name: release
description: Guide the release process for @openhands/agent-canvas — version bump on the release branch, QA, then tag to publish to npm and Docker.
triggers:
- release
- new release
- cut a release
- publish release
- bump version
---

# Release Process for @openhands/agent-canvas

## Overview

Releases use a **long-lived release branch** model:

1. A `rel-X.Y.Z` branch is created from `main` at the start of a release cycle.
2. QA and fixes land on the branch (cherry-picked from main or landed directly).
3. When ready, a tag (`vX.Y.Z-rc.1`, `vX.Y.Z`, etc.) is pushed to the branch.
4. The tag push triggers all downstream workflows automatically.
5. **The release branch is never merged back to main.**

npm dist-tags by version tier:

| Version | Example | npm dist-tag | `npm install` resolves? |
|---|---|---|---|
| Alpha | `1.0.0-alpha.1` | `alpha` | `@alpha` only |
| Beta | `1.0.0-beta.1` | `beta` | `@beta` only |
| RC | `1.0.0-rc.1` | `rc` | `@rc` only |
| Stable | `1.0.0` | `latest` | ✅ default |

---

## Step 1: Confirm the Release Branch Exists

The branch must be named `rel-X.Y.Z` (e.g. `rel-1.0.0`). Check:

```bash
git branch -r | grep rel-
```

If it doesn't exist yet, create it from main:

```bash
git checkout main && git pull origin main
git checkout -b rel-<X.Y.Z>
git push -u origin rel-<X.Y.Z>
```

**STOP HERE if the branch doesn't exist.** Ask the user to confirm the release series (e.g. `1.0.0`) before creating it.

---

## Step 2: Ensure `package.json` Version Is Set

The version in `package.json` must match the tag you're about to push.

Check the current version:

```bash
node -p "require('./package.json').version"
```

If it needs updating (e.g. bumping from `1.0.0-alpha.8` to `1.0.0-rc.1`), update both `package.json` and `package-lock.json`:

```bash
git checkout rel-<X.Y.Z>
git pull origin rel-<X.Y.Z>
npm version <new-version> --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to <new-version>"
git push
```

**Also update version references in `README.md`** if the Docker image tag examples reference a specific version:

```bash
sed -i 's/ghcr.io\/openhands\/agent-canvas:[0-9]*\.[0-9]*\.[0-9]*[^ ]*/ghcr.io\/openhands\/agent-canvas:<new-version>/g' README.md
git add README.md && git commit -m "docs: update README version to <new-version>" && git push
```

---

## Step 3: Push the Tag

Confirm the branch is in the right state (CI green, QA done), then push the tag:

```bash
git checkout rel-<X.Y.Z>
git pull origin rel-<X.Y.Z>
git tag v<version>
git push origin v<version>
```

Examples:
- First release candidate: `git tag v1.0.0-rc.1 && git push origin v1.0.0-rc.1`
- Subsequent RC: `git tag v1.0.0-rc.2 && git push origin v1.0.0-rc.2`
- Full release: `git tag v1.0.0 && git push origin v1.0.0`

**The tag push is the release trigger.** Three workflows fire in parallel:

| Workflow | What it does |
|---|---|
| `create-release.yml` | Creates the GitHub Release object with auto-generated notes |
| `npm-publish.yml` | Builds and publishes to npm with the correct dist-tag |
| `docker.yml` | Builds and pushes multi-arch Docker images to GHCR |

---

## Step 4: Verify the Release

```bash
# GitHub release
gh release view v<version>

# npm (allow ~2 min for publish to propagate)
npm view @openhands/agent-canvas@<version>
npm view @openhands/agent-canvas dist-tags  # confirm correct dist-tag

# Docker
docker pull ghcr.io/openhands/agent-canvas:<version>
```

Monitor workflow runs:

```bash
gh run list --workflow=npm-publish.yml --limit=3
gh run list --workflow=docker.yml --limit=3
```

---

## Troubleshooting

### package.json version doesn't match the tag
`npm-publish.yml` validates that `package.json` version equals the tag version and fails if they differ. Fix the version on the branch, push, then delete and re-push the tag:
```bash
git push origin :refs/tags/v<version>   # delete remote tag
git tag -d v<version>                    # delete local tag
# fix package.json, commit, push
git tag v<version> && git push origin v<version>
```

### GitHub release already exists
`create-release.yml` skips silently if the release already exists. To recreate it:
```bash
gh release delete v<version> --yes
```
Then the workflow will re-create it on the next tag push (or run it manually from the Actions tab).

### npm publish failed mid-way
Check the `npm-publish.yml` run logs. The dist-tag is resolved from the `package.json` version — if the version string contains `alpha`, `beta`, or `rc`, it uses the matching dist-tag; otherwise `latest`.
