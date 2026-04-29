# Issue #44 visual verification

This change was visually spot-checked against the existing `.pr/issue-44/before/` artifacts after upgrading HeroUI to v3.

## Artifacts

- Homepage
  - Before: `.pr/issue-44/before/home.png`
  - After: `.pr/issue-44/after/home.png`
- LLM settings
  - Before: `.pr/issue-44/before/settings-llm.png`
  - After: `.pr/issue-44/after/settings-llm.png`
- Application settings
  - Before: `.pr/issue-44/before/settings-app.png`
  - After: `.pr/issue-44/after/settings-app.png`
- Conversation view
  - Before: `.pr/issue-44/before/conversation.png`
  - After: `.pr/issue-44/after/conversation.png`

## Verification notes

- Built a static mock bundle with `npm run build:mock`.
- Served `build/` locally and captured the after screenshots from the built app.
- Spot-checked the homepage, LLM settings, application settings, and conversation view.
- Confirmed the migrated HeroUI v3 combobox-based provider/model selectors render correctly and preserve the expected selected values.
- No obvious layout regressions were observed in the checked screens.

## Post-merge verification

- Merged the latest `main` into the PR branch and resolved the resulting `AGENTS.md` conflict.
- Re-ran `npm run make-i18n`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run build:mock` on the merge-resolved branch.
- Reused the checked-in `.pr/issue-44/after/` screenshots as the visual baseline because the merge introduced no product-code conflicts or UI changes beyond the already-reviewed HeroUI v3 migration.


## Caveats

- The mock conversation screenshot still shows the expected mock-mode disconnected banner/state in the conversation view.
