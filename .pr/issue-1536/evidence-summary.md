# Issue 1536 Evidence Summary

Date: 2026-07-13 UTC

## Status

Blocked before the required acceptance proof. This environment could not create
or authenticate a genuinely brand-new disposable OpenHands Cloud user. No GIF
claiming first-signup success was generated.

## SHAs inspected/tested

- Current `main`: `ed02badba37c3ff7aadd8be3c7499fb71d84a5d8`
- PR branch code tested: `981b48440b80f8342fe678aaa3c07d7a61f74d4e`
- Merge base used for diff inspection: `057da5384bc6fcac7a52226991dc493ab1fc2535`

## GitHub state inspected

- Issue: OpenHands/agent-canvas#1536, open
- PR: OpenHands/agent-canvas#1607, open, mergeable, review required
- Review threads at inspection time: 0
- Checks at inspection time: all reported checks passing except `live-e2e` and
  approval cleanup, both skipped by workflow gating

## Setup used

- Installed dependencies with `npm ci --prefer-offline --no-audit` in both the
  PR worktree and an isolated current-main worktree.
- Built both exact SHAs with:
  `VITE_LOCK_TO_CLOUD=https://app.all-hands.dev VITE_DO_NOT_TRACK=1 npm run build`
- Served each build through `npm run dev:static -- --port 12000 --skip-build`
  with isolated `OH_CANVAS_SAFE_STATE_DIR` under `.tmp/issue-1536/`.
- Deleted the temporary `.tmp/issue-1536/` state after capture.

## Captured accessible evidence

These files are pre-auth evidence only:

- `main-desktop-preauth.png`
- `main-narrow-preauth.png`
- `main-preauth-results.json`
- `pr-desktop-preauth.png`
- `pr-narrow-preauth.png`
- `pr-preauth-results.json`
- `pr-cloud-oauth-login-options.png`
- `cloud-oauth-blocker.json`
- `oauth-provider-barriers.json`

Observed current `main` pre-auth behavior:

- Locked-cloud first run lands at `/conversations`.
- The onboarding modal is present.
- The four onboarding progress bars are present.
- Old copy is present: "Skip the setup ... connect instantly with your
  OpenHands Cloud account."
- The hidden onboarding rail includes the LLM setup step text in the DOM.

Observed PR branch pre-auth behavior:

- Locked-cloud first run lands at `/conversations`.
- The direct Cloud login modal is present.
- Onboarding progress bars are absent.
- The old copy is absent.
- New copy is present: "Connect instantly to OpenHands Cloud to try out Agent
  Canvas."
- Close button and advanced host toggle are absent.
- Escape and backdrop click did not dismiss the modal.

## Signup/auth blocker

The real Cloud device-flow page redirected unauthenticated users to
`https://app.all-hands.dev/login`. It offered GitHub, GitLab, and Bitbucket
OAuth only.

Provider checks in fresh browser contexts:

- GitHub redirected to `https://github.com/login` and required account login or
  account creation.
- GitLab redirected to `https://gitlab.com/users/sign_in` and stopped at bot
  verification.
- Bitbucket redirected to `https://id.atlassian.com/login`; the Cloud page also
  states Bitbucket registrations are temporarily disabled and only existing
  Bitbucket users can log in.

Available environment secrets only included `GITHUB_TOKEN` for API access, not a
browser OAuth session, disposable email inbox, or provider username/password.

## Access needed to finish issue acceptance

Provide one genuinely brand-new disposable OAuth identity that can complete
OpenHands Cloud signup, including any email verification or bot checks. The
identity should be safe to use for this PR QA and safe to delete afterward.

Once available, rerun current `main` and the PR branch from fresh browser
contexts, capture the required first-signup flow through the first usable Canvas
screen at desktop and narrow viewport sizes, and only then generate the required
animated GIF.

## Validation completed on PR code SHA

- `npm test -- __tests__/components/onboarding/ __tests__/components/backends/ __tests__/root.test.tsx`
  passed: 14 files, 172 tests.
- `npm run typecheck` passed.
- `VITE_LOCK_TO_CLOUD=https://app.all-hands.dev VITE_DO_NOT_TRACK=1 npm run build`
  passed.
