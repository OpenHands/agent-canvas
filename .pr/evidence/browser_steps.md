# Browser steps for PR #1206 command-k menu

Browser: Playwright Chromium (headless), viewport 1440×900, driven against
`http://127.0.0.1:18080/` (sirv-cli serving the PR branch's mock build).

All observations below are real DOM/Playwright readings captured during the
run (see `screenshots/run.log` for the raw timestamped log).

## Step 1 — Load the app
- Action: `page.goto("http://127.0.0.1:18080/", waitUntil="networkidle")`,
  then waited ~2.5s for React hydration.
- Observed: page title = `OpenHands`. The landing screen rendered with the
  sidebar visible. Screenshot: `screenshots/01-landing.png`.

## Step 2 — Open the command menu with Ctrl+K
- Action: `page.keyboard.press("Control+k")`, waited 800ms.
- Observed: `[data-testid="command-menu"]` element count went from 0 → 1.
  The menu portal opened. Screenshot: `screenshots/02-menu-open.png`.
- Observed menu options (12 total), grouped:
  - Navigation: New chat, Customize, Automations, MCP servers
  - Settings: Settings, Agent settings, LLM profiles, Condenser settings,
    Verification settings, Application settings, Secrets settings
  - Local action: Toggle sidebar ( Collapse or expand the navigation rail — Run)
  Each row shows title + description + a "Go"/"Run" affordance.

## Step 3 — Filter the list
- Action: focused `#command-menu-search` and typed `settings`.
- Observed: the list narrowed from 12 options to 6 (Settings, Agent settings,
  Condenser settings, Verification settings, Application settings, Secrets
  settings). Screenshot: `screenshots/03-filtered.png`.

## Step 4 — Keyboard navigation down
- Action: pressed `ArrowDown` twice from the search input.
- Observed: one option became `aria-selected="true"` (active highlight moved).
  Screenshot: `screenshots/04-navigated.png`.

## Step 5 — Keyboard navigation up
- Action: pressed `ArrowUp` once.
- Observed: selection moved up the list.
  Screenshot: `screenshots/05-navigated-up.png`.

## Step 6 — Enter triggers a command
- Action: with 6 filtered options present, pressed `Enter`.
- Observed: `[data-testid="command-menu"]` count went 1 → 0, i.e. the menu
  closed because the highlighted command's action ran (navigation/callback).
  Screenshot: `screenshots/06-after-enter.png`.

## Step 7 — Reopen with Ctrl+K, then close with Escape
- Action: pressed `Control+k` (menu reopened, count 0 → 1), then `Escape`.
- Observed: menu closed (count 1 → 0).
  Screenshot: `screenshots/07-after-escape.png`.

## Summary
The command menu opened via Ctrl+K, displayed grouped navigation/settings/local
commands, filtered correctly by query, supported ArrowDown/ArrowUp/Enter/Escape
keyboard navigation, and Enter ran a command (closing the menu). All checks
passed live.