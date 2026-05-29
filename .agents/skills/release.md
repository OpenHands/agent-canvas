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

You are guiding a release of the `@openhands/agent-canvas` package. Follow these steps **in order**. Do NOT skip ahead — each step has a checkpoint where you must wait for the user.

## Step 1: Check Current Version and Ask the User

**IMPORTANT: You MUST complete this step and get explicit user confirmation before doing anything else.**

First, read the current version from `package.json`:

```bash
node -p "require('./package.json').version"
```

Then present the result to the user and suggest the next logical version. Use these rules to form your suggestion:
- If the current version is a pre-release like `1.0.0-alpha.7`, suggest `1.0.0-alpha.8` (bump the last numeric segment).
- If the current version is stable like `1.2.3`, suggest `1.2.4` (patch bump) but mention they can also do `1.3.0` (minor) or `2.0.0` (major).

**Version format**: This project uses semver with optional pre-release suffixes.
- Pre-release examples: `1.0.0-alpha.8`, `1.0.0-beta.1`, `1.0.0-rc.1`
- Stable examples: `1.0.0`, `1.1.0`, `2.0.0`

**STOP HERE.** Tell the user the current version, your suggested next version, and ask:

> The current version is `<current>`. I'd suggest bumping to `<suggested>`. What version would you like to release?

**Do not proceed to Step 2 until the user confirms a version.**

## Step 2: Create the Release PR

### 2a. Create the release branch

The branch **must** be named `rel-<version>` (e.g., `rel-1.0.0-alpha.8`). This naming convention is required — the `create-release.yml` workflow detects merged release PRs by matching the `rel-` branch prefix.

```bash
git checkout main
git pull origin main
git checkout -b rel-<version>
```

### 2b. Bump the version

Update the version in **both** `package.json` and `package-lock.json`:

```bash
npm version <version> --no-git-tag-version
```

This updates both files without creating a git tag (the tag is created automatically on merge).

### 2c. Update version references in README.md

The `README.md` contains Docker image tags that reference a specific version (e.g., `ghcr.io/openhands/agent-canvas:<version>`). Update **all** version references in `README.md` to match the new release version:

```bash
# Find and replace the old version tag with the new one
sed -i 's/ghcr.io\/openhands\/agent-canvas:[0-9]*\.[0-9]*\.[0-9]*[^ ]*/ghcr.io\/openhands\/agent-canvas:<version>/g' README.md
```

Verify the change:

```bash
git diff --stat
# Should show: package.json, package-lock.json, and README.md changed
```

### 2d. Commit and push

```bash
git add package.json package-lock.json README.md
git commit -m "chore: bump version to <version>"
git push -u origin rel-<version>
```

### 2e. Create the PR

Create the PR targeting `main` with the `e2e-tests` label:

```bash
gh pr create \
  --title "chore: bump version to <version>" \
  --body "## Release v<version>

This PR bumps the version to **<version>** for release.

### Release Checklist
- [x] Version bumped in package.json and package-lock.json
- [x] Version references updated in README.md
- [ ] CI passes (lint, test, build)
- [ ] Visual snapshot tests pass
- [ ] Mock-LLM E2E tests pass (triggered by \`e2e-tests\` label)
- [ ] Review and approve

### What happens on merge
When this PR is merged, the \`create-release.yml\` workflow will automatically:
1. Create a GitHub release with tag \`v<version>\` and auto-generated notes
2. The tag push triggers \`npm-publish.yml\` to publish to npm
3. The tag push triggers \`docker.yml\` to build and push Docker images to GHCR" \
  --base main \
  --head "rel-<version>" \
  --label "e2e-tests"
```

## Step 3: Wait for CI and E2E Tests

The following checks must pass before merging:

| Workflow | Trigger | What it checks |
|---|---|---|
| **CI** (`ci.yml`) | Every PR | Lint, unit tests, app build, library build |
| **Snapshot Tests** (`snapshot-tests.yml`) | Every PR | Visual regression screenshots |
| **Mock-LLM E2E Tests** (`mock-llm-e2e.yml`) | `e2e-tests` label | End-to-end tests with a mock LLM against a real agent-server |

Monitor the PR checks:

```bash
gh pr checks <pr-number> --watch
```

If the mock-LLM E2E tests fail, investigate the failure in the workflow artifacts. The `e2e-tests` label can be removed and re-added to re-trigger the workflow.

If snapshot tests show intentional changes (e.g., version string in the UI changed), add the `update-snapshots` label to acknowledge the changes.

## Step 4: Merge the PR

Once all checks pass and the PR is approved, merge it:

```bash
gh pr merge <pr-number> --squash --delete-branch
```

### Automatic tagging on merge

The `create-release.yml` workflow automatically runs when a PR from a `rel-*` branch is merged into `main`. It will:

1. **Extract the version** from the branch name (e.g., `rel-1.0.0-alpha.8` → `1.0.0-alpha.8`)
2. **Create a GitHub release** with tag `v<version>` targeting the merge commit
3. **Auto-generate release notes** from the commits since the previous release
4. **Mark pre-release versions** (those containing a hyphen) as pre-releases

You do **not** need to manually create a tag or GitHub release.

### Downstream workflows triggered by the tag

The tag push (`v*`) automatically triggers:

| Workflow | What it does |
|---|---|
| **npm-publish.yml** | Builds and publishes `@openhands/agent-canvas` to npm with provenance |
| **docker.yml** | Builds and pushes multi-arch Docker images to `ghcr.io/openhands/agent-canvas` |

### Verify the release

After merging, verify the downstream workflows complete successfully:

```bash
# Check the GitHub release was created
gh release view v<version>

# Watch downstream workflow runs
gh run list --workflow=npm-publish.yml --limit=1
gh run list --workflow=docker.yml --limit=1
```

Confirm the package is available:
- **npm**: `npm view @openhands/agent-canvas@<version>`
- **Docker**: `docker pull ghcr.io/openhands/agent-canvas:<version>`

## Troubleshooting

### E2E tests not triggering
The `e2e-tests` label must be present on the PR. If you added it but tests didn't run, remove and re-add the label, or manually trigger the workflow from the Actions tab.

### Tag already exists
If a tag `v<version>` already exists (e.g., from a previous failed attempt), the `create-release.yml` workflow will skip creation. Delete the existing release and tag first:
```bash
gh release delete v<version> --yes
git push origin :refs/tags/v<version>
```

### npm publish failed
The `npm-publish.yml` workflow validates that `package.json` version matches the tag version. If they don't match, the publish will fail. Ensure the version bump in Step 2b matches the branch name exactly.

## Reference

This release process is modeled after the [OpenHands/software-agent-sdk release workflow](https://github.com/OpenHands/software-agent-sdk/blob/main/.github/workflows/README-RELEASE.md) for consistency across OpenHands projects. Key differences:
- agent-canvas uses npm (not PyPI) for package publishing
- agent-canvas uses `npm version` (not `make set-package-version`) for version bumping
- agent-canvas release branches use `rel-<version>` naming (same as SDK)
- Both repos use `create-release.yml` to auto-create GitHub releases on merge of `rel-*` PRs
