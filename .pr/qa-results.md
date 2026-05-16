# QA results

## UI review

- MCP marketplace page renders the local `@openhands/extensions` MCP catalog in popularity order.
- Every MCP catalog item has an explicit logo mapping; reusable logo badges keep icon sizing consistent across marketplace cards, installed cards, modals, and recommended automation cards.
- Recommended automation cards show the logos for all required MCPs in the card header and in the MCP requirement chips.
- Copy remains concise: cards show category/name/one short description, required MCPs, missing setup count, and setup estimate.

Screenshots:

- `mcp-marketplace-ui.png`
- `recommended-automations-ui.png`
- Prior flow screenshots: `final-mcp-marketplace-from-extensions.png`, `final-recommended-automations-from-extensions.png`, `final-recommended-github-setup-clean-before-install.png`, `final-recommended-github-setup-after-install.png`, `final-recommended-github-conversation-launched.png`, `final-github-mcp-agent-live-response.png`

## Live MCP QA

Latest successful run is recorded in `fixed-sdk-mcp-retest.json`.

- Conversation ID: `ced375d9-61ad-42de-9b90-e288037c132e`
- Status: `finished`
- GitHub MCP tool use detected: `true`
- Repository found: `true`
- Auth succeeded: `true`
- Bad credentials observed: `false`
- Runtime MCP env token was decrypted plaintext, while settings stayed encrypted at rest.

## Validation commands

- `npm test -- --run __tests__/constants/extensions-catalogs.test.ts`
- `npm run typecheck`
- `npm run build`
