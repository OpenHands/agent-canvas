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

The workflow checks npm at publish time to see whether any full stable release (no pre-release suffix) has ever been published:

**Before the first stable release** — all versions use `--tag latest`:

| Version | Example | npm dist-tag | `npm install` resolves? |
|---|---|---|---|
| Alpha | `1.0.0-alpha.1` | `latest` | ✅ default |
| Beta | `1.0.0-beta.1` | `latest` | ✅ default |
| RC | `1.0.0-rc.1` | `latest` | ✅ default |
| Stable | `1.0.0` | `latest` | ✅ default |

**After the first stable release** — pre-release versions revert to their own dist-tags:

| Version | Example | npm dist-tag | `npm install` resolves? |
|---|---|---|---|
| Alpha | `1.0.0-alpha.1` | `alpha` | `@alpha` only |
| Beta | `1.0.0-beta.1` | `beta` | `@beta` only |
| RC | `1.0.0-rc.1` | `rc` | `@rc` only |
| Stable | `1.0.0` | `latest` | ✅ default |

This transition is automatic — no workflow changes are needed when the first stable version ships.

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

**Also update the documented Docker install version** on the release branch before tagging (the `create-release.yml` workflow fails if `versions.agentCanvas` does not match the tag):

```bash
VERSION=<new-version>
export VERSION
node <<'NODE'
const fs = require("fs");
const version = process.env.VERSION;
const configPath = "config/defaults.json";
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.versions.agentCanvas = version;
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
const image = `${config.images.agentCanvas}:${version}`;
const imageRefPattern = /ghcr\.io\/openhands\/agent-canvas:[^\s`"]+/g;
for (const file of ["README.md", "README.windows.md"]) {
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(imageRefPattern, image));
}
NODE
git add config/defaults.json README.md README.windows.md
git commit -m "docs: update Docker install version to $VERSION"
git push
```

External install docs on docs.openhands.dev are maintained separately; update them there when closing #1073. Pre-release Docker images are tagged by exact version only (`latest` is published for stable releases).

---

## Step 3: Push the Tag

> ⚠️ **Hard gate, no admin bypass.** The repo's `Release Tag` ruleset requires
> the `test-and-build (ubuntu)` status check to be green on the exact commit
> being tagged before the tag push will be accepted. `bypass_actors` is empty —
> not even repo admins can override it. If you push the bump commit and the tag
> back-to-back, the tag push will be rejected with a ruleset violation. Always
> wait for CI on the bump commit to go green before tagging.

After pushing the bump commit in Step 2:

```bash
# Wait for test-and-build (ubuntu) to pass on the bump commit.
gh run watch $(gh run list --workflow=ci.yml --branch=rel-<X.Y.Z> --limit=1 --json databaseId --jq '.[0].databaseId') --exit-status
```

If `test-and-build (ubuntu)` fails on a clearly flaky run (e.g. an unhandled
`ProgressEvent is not defined` rejection from MSW's XHR interceptor in
`__tests__/components/features/home/task-suggestions.test.tsx`, or any other
unhandled rejection where every individual test still passed), re-run the
failed job and wait again:

```bash
gh run rerun <run-id> --failed
```

Once CI is green, push the tag:

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
Check the `npm-publish.yml` run logs. The dist-tag is resolved dynamically: if no stable release (no `-` in the version) has ever been published to npm, all versions use `latest`; once a stable version exists, pre-release versions use their own tag (`alpha` / `beta` / `rc`) and only stable versions use `latest`.
