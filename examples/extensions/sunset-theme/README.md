# Sunset Theme (example Canvas Extension)

A **theme-only** Canvas Extension. It contributes one color theme — "Sunset" — and
nothing else: no view, settings panel, right panel, tool visualizer, SDK plugin, or
browser module.

This demonstrates the first-class theme-only case from RFC §12.2 / §13: a package that
ships **no `browser.module`** at all and still works, because color themes are projected
from manifest data (validated by Canvas), not from running extension code.

## What it does

Adds a "Sunset" option to **Settings > Application > Color Theme**. The theme overrides:

- `scale` — the `--cool-grey-*` semantic palette (warm dark tones).
- `heroui` — a few HeroUI HSL-channel variables (background/foreground/content/default).
- `tokens` — the `--oh-color-primary` / `--oh-accent` brand tokens (amber).

Canvas owns selection, persistence, application, and fallback. If the extension is
disabled or removed while "Sunset" is active, Canvas falls back to the default built-in
theme and records a diagnostic (RFC §12.2).

## Install

```sh
agent-canvas install ./examples/extensions/sunset-theme --yes
```

Then open Settings > Application > Color Theme and pick **Sunset**.

No build step: the extension is pure manifest data.
