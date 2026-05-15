# Cool Grey — Color Token Migration Guide

> **Branch:** `cool-grey`  
> **Status:** Pre-implementation planning document. Do NOT apply changes to code until this plan is reviewed and approved.  
> **Reference:** See `artifacts/cool-grey-palette.svg` for a visual map of all 98 migrations.

---

## The 15-Stop Scale

The palette consists of 2 pure anchors (white/black, kept as-is) plus a 13-shade cool blue-grey family sharing a consistent hue of **≈ 220–224°**.

| Token | Hex | Semantic Role |
|-------|-----|---------------|
| `white` _(anchor)_ | `#FFFFFF` | Pure white — keep as-is |
| `cool-grey-50` | `#F7F9FC` | Elevated surfaces, near-white backgrounds |
| `cool-grey-100` | `#EEF2F7` | Standard light surfaces |
| `cool-grey-200` | `#DCE3EE` | Subtle text, light borders, dividers |
| `cool-grey-300` | `#C3CDDC` | Secondary / helper text |
| `cool-grey-400` | `#A3B0C4` | Muted text, inactive icons |
| `cool-grey-500` | `#7E8A9E` | Mid-tone / inactive UI icons |
| `cool-grey-600` | `#626D82` | Default borders, strong structural elements |
| `cool-grey-700` | `#4B5468` | Dark-elevated surfaces, hover/focus states |
| `cool-grey-800` | `#383F50` | Dark panel backgrounds, overlay surfaces |
| `cool-grey-900` | `#2C313F` | Darker surfaces, sidebar panels |
| `cool-grey-925` | `#21252F` | Popup/dropdown backgrounds |
| `cool-grey-950` | `#111319` | App shell, sidebar, deep backgrounds |
| `cool-grey-975` | `#05070A` | Near-black accents |
| `black` _(anchor)_ | `#000000` | Pure black — keep as-is |

---

## CSS Custom Property Definitions

Add inside `[data-agent-server-ui]` and `:root` in `src/index.css`:

```css
/* Cool Grey Scale — 15-Stop Palette */
--cool-grey-50:  #F7F9FC;
--cool-grey-100: #EEF2F7;
--cool-grey-200: #DCE3EE;
--cool-grey-300: #C3CDDC;
--cool-grey-400: #A3B0C4;
--cool-grey-500: #7E8A9E;
--cool-grey-600: #626D82;
--cool-grey-700: #4B5468;
--cool-grey-800: #383F50;
--cool-grey-900: #2C313F;
--cool-grey-925: #21252F;
--cool-grey-950: #111319;
--cool-grey-975: #05070A;
```

## Tailwind Theme Extension

Add to `src/tailwind.css` under the `@theme` block:

```css
@theme inline {
  --color-cool-grey-50:  var(--cool-grey-50);
  --color-cool-grey-100: var(--cool-grey-100);
  --color-cool-grey-200: var(--cool-grey-200);
  --color-cool-grey-300: var(--cool-grey-300);
  --color-cool-grey-400: var(--cool-grey-400);
  --color-cool-grey-500: var(--cool-grey-500);
  --color-cool-grey-600: var(--cool-grey-600);
  --color-cool-grey-700: var(--cool-grey-700);
  --color-cool-grey-800: var(--cool-grey-800);
  --color-cool-grey-900: var(--cool-grey-900);
  --color-cool-grey-925: var(--cool-grey-925);
  --color-cool-grey-950: var(--cool-grey-950);
  --color-cool-grey-975: var(--cool-grey-975);
}
```

This exposes utilities like `bg-cool-grey-925`, `text-cool-grey-400`, `border-cool-grey-600` across the codebase.

---

## Complete Migration Tables

### `cool-grey-50` → `#F7F9FC`
_Surface-elevated, near-white. Mapped by lightness proximity (L ≈ 97–99%)._

| Current Hex | Usage Type | File |
|---|---|---|
| `#F9FBFE` | css variable | `src/styles/agent-server-ui-style-scope.ts` |
| `#F4F4F5` | inline hex | `src/tailwind.css` |
| `#FAFAFA` | text color | `src/components/features/home/git-repo-dropdown/git-repo-dropdown.tsx` + SVG palette |
| `#FCFCFC` | icon fill | `src/icons/play.svg` |
| `#F5F5F5` | utility `text-neutral-100` | `src/components/features/conversation-panel/start-task-card/start-task-card-header.tsx` |
| `#F3F4F6` | utility `text-gray-100` | `src/components/features/conversation-panel/hook-event-item.tsx` |

---

### `cool-grey-100` → `#EEF2F7`
_Standard light surfaces. Mapped by lightness proximity (L ≈ 92–94%)._

| Current Hex | Usage Type | File |
|---|---|---|
| `#ECEDEE` | css variable | `src/styles/agent-server-ui-style-scope.ts`, SVG palette fill |
| `#E6EDF3` | inline hex | `src/components/features/markdown/code.tsx` |
| `#E5E5E5` | utility `text-neutral-200` | `src/components/conversation-events/chat/event-message-components/skill-ready-content-list.tsx` |
| `#EEEEEE` | icon fill | `src/icons/external-link.svg` |
| `#E8E8E8` | inline hex | `src/utils/constants.ts` |

---

### `cool-grey-200` → `#DCE3EE`
_Subtle text, light borders. Mapped by lightness proximity (L ≈ 84–90%). This is also the border/stroke color used on white surfaces in the palette SVG._

| Current Hex | Usage Type | File |
|---|---|---|
| `#E4E7EB` | icon fill | `src/icons/default-user.svg` |
| `#E4E4E4` | background color | `src/ui/interactive-chip.tsx` |
| `#E5E7EB` | utility `border-gray-200` / `text-gray-200` | `src/components/features/diff-viewer/loading-spinner.tsx`, `src/components/features/onboarding/steps/check-backend-step.tsx` |
| `#DEDFE0` | text color | `src/components/features/suggestions/suggestion-item.tsx` |
| `#D9D9D9` | inline hex | `src/utils/constants.ts` |
| `#D6D6D6` | text color | `src/components/features/backends/manage-backends-modal.tsx` |
| `#D5D9E5` | text color | `src/components/features/markdown/headings.tsx`, SVG palette |
| `#D0D9FA` | text color | `src/components/features/chat/components/chat-input-field.tsx` |
| `#D4D4D4` | utility `text-neutral-300` / inline | `src/components/conversation-events/chat/event-message-components/skill-item-expanded.tsx`, `src/assets/chevron-left.tsx` |
| `#D1D5DB` | utility `text-gray-300` | `src/components/features/backends/backend-form-modal.tsx` |

---

### `cool-grey-300` → `#C3CDDC`
_Secondary text. Note: this hex is nearly identical to the existing `#C4CBDA` (ΔE < 5). Also absorbs the warm-grey `#C9C7C7` as an approximation — flag for designer review._

| Current Hex | Usage Type | File |
|---|---|---|
| `#C4CBDA` | css variable | `src/index.css` |
| `#C9C7C7` | icon fill (warm grey — review) | `src/icons/clipboard.svg` |
| `#B7BDC2` | text color | `src/components/features/backends/manage-backends-modal.tsx`, SVG palette |
| `#B1B9D3` | inline hex | `src/components/features/conversation/conversation-name.tsx` |
| `#AFB8C1` | css variable (solid base of `#AFB8C133`) | `src/index.css` |

---

### `cool-grey-400` → `#A3B0C4`
_Muted text, inactive icons._

| Current Hex | Usage Type | File |
|---|---|---|
| `#9CA3AF` | utility `text-gray-400` / `bg-gray-400` | `src/components/features/chat/components/slash-command-menu.tsx`, `src/tailwind.css` |
| `#959CB2` | fill / text | `src/components/conversation-events/chat/event-message-components/collapsible-thinking.tsx`, SVG palette |
| `#9299AA` | text color | `src/components/conversation-events/chat/task-tracking/task-list-section.tsx` |
| `#9099AC` | text color | `src/components/features/diff-viewer/file-diff-viewer.tsx` |
| `#A3A3A3` | utility `text-neutral-400` / `bg-neutral-400` | `src/components/shared/buttons/remove-button.tsx`, `src/components/conversation-events/chat/event-message-components/skill-item-expanded.tsx` |
| `#A7A7A7` | text color | `src/components/features/chat/upload-as-file-checkbox.tsx` |
| `#A1A1A1` | background color | `src/components/features/chat/remove-file-button.tsx` |

---

### `cool-grey-500` → `#7E8A9E`
_Mid-tone, inactive UI icons. Note: `#969896` (muted grey with greenish cast) is an approximation — flag for designer review._

| Current Hex | Usage Type | File |
|---|---|---|
| `#8D95A9` | text color | `src/components/features/browser/empty-browser-message.tsx` |
| `#868E96` | background color | `src/components/features/conversation-panel/conversation-card/conversation-status-badges.tsx` |
| `#7E848C` | text color | `src/components/features/backends/manage-backends-modal.tsx` |
| `#8C8C8C` | text color | `src/components/features/backends/backend-selector.tsx` |
| `#969896` | inline hex (muted grey — review) | `src/utils/constants.ts` |

---

### `cool-grey-600` → `#626D82`
_Strong borders, default dividers. Note: `#737373` (pure neutral-500) maps here by RGB proximity, not to 500._

| Current Hex | Usage Type | File |
|---|---|---|
| `#727987` | border color | `src/components/features/backends/manage-backends-modal.tsx` |
| `#717888` | background color | `src/components/features/conversation/conversation-name-context-menu.tsx`, SVG palette |
| `#6B7280` | utility `text-gray-500` / `bg-gray-500` | `src/components/features/conversation-panel/start-task-card/start-task-status-indicator.tsx`, `src/components/features/backends/backend-form-modal.tsx` |
| `#6C6C6C` | inline hex | `src/utils/constants.ts` |
| `#737373` | utility `bg-neutral-500` / `border-neutral-500` / `text-neutral-500` | `src/components/features/backend-status-dot.tsx`, `src/components/features/chat/btw-messages.tsx`, `src/components/conversation-events/chat/event-message-components/skill-item-expanded.tsx` |

---

### `cool-grey-700` → `#4B5468`
_Dark-elevated surfaces, structural overlays. Note: `#525252` and `#4E4E4E` (pure neutral-600) map here by RGB proximity, not to neutral-600's lightness._

| Current Hex | Usage Type | File |
|---|---|---|
| `#525B6F` | inline hex | `src/constants/mcp-marketplace.tsx` |
| `#4B505F` | border color | `src/components/features/markdown/horizontal-rule.tsx` |
| `#4B4E57` | text color | `src/components/features/backends/manage-backends-modal.tsx` |
| `#474A54` | border color | `src/components/features/conversation/conversation-main/conversation-main.tsx` |
| `#4B5563` | utility `border-gray-600` / inline | `src/components/features/backends/backend-form-modal.tsx`, `src/constants/mcp-marketplace.tsx` |
| `#5C5D62` | background color | `src/components/features/backends/backend-selector.tsx` |
| `#525252` | utility `bg-neutral-600` / inline | `src/components/features/settings/brand-button.tsx`, `src/assets/chevron-left.tsx` |
| `#4E4E4E` | inline hex | `src/utils/constants.ts` |

---

### `cool-grey-800` → `#383F50`
_Dark panel backgrounds, active overlay surfaces. This is the largest cluster — 14 values. Note: `#444444`, `#454545`, `#404040` (pure neutrals) map here by RGB proximity, not to 700._

| Current Hex | Usage Type | File |
|---|---|---|
| `#3F4452` | inline hex | `src/components/features/mcp-page/installed-server-card.tsx` |
| `#3A3D44` | css variable / border | `src/components/features/files-tab/file-content-viewer.tsx`, SVG palette |
| `#3A3D46` | text color | `src/components/shared/buttons/scroll-to-bottom-button.tsx` |
| `#3C3C4A` | css variable | `src/index.css` |
| `#3C3C49` | inline hex | `src/components/features/home/recent-conversations/conversation-status-dot.tsx` |
| `#3A3C45` | text color | `src/components/features/settings/pro-pill.tsx` |
| `#383B45` | background color | `src/components/features/chat/components/slash-command-menu.tsx` |
| `#363840` | border color | `src/components/features/backends/manage-backends-modal.tsx` |
| `#374151` | utility `bg-gray-700` / `text-gray-700` | `src/components/features/conversation-panel/hook-event-item.tsx`, `src/components/features/conversation-panel/system-message-modal/tab-button.tsx` |
| `#393939` | css variable | `src/index.css` |
| `#363636` | background color | `src/components/features/home/git-branch-dropdown/git-branch-dropdown.tsx` |
| `#404040` | utility `bg-neutral-700` / `border-neutral-700` | `src/components/conversation-events/chat/event-message-components/skill-ready-content-list.tsx`, `src/components/conversation-events/chat/event-message-components/skill-item-expanded.tsx` |
| `#454545` | border color | `src/components/features/chat/git-control-bar-branch-button.tsx` |
| `#444444` | inline hex | `src/components/features/diff-viewer/file-diff-viewer.tsx` |

---

### `cool-grey-900` → `#2C313F`
_Sidebar/drawer surfaces. Large cluster of very similar dark-medium values._

| Current Hex | Usage Type | File |
|---|---|---|
| `#30363D` | inline hex | `src/components/features/markdown/code.tsx` |
| `#31343D` | css variable | `src/index.css` |
| `#2F3137` | background color | `src/components/features/files-tab/file-quick-row.tsx` |
| `#2D3039` | background color | `src/routes/task-list-tab.tsx` |
| `#2A3038` | inline hex | `src/components/features/markdown/code.tsx` |
| `#2D2F36` | border color | `src/components/features/settings/mcp-settings/mcp-server-form.tsx` |
| `#2A2F38` | border color | `src/components/features/conversation-panel/compact-conversation-row.tsx` |
| `#2A2D37` | background color | `src/components/features/chat/components/slash-command-menu.tsx` |
| `#2D2D2D` | inline hex | `src/utils/constants.ts` |
| `#2A2A2A` | background color | `src/components/features/conversation-panel/new-conversation-button-cloud.tsx` |
| `#292929` | css variable | `src/index.css` |

---

### `cool-grey-925` → `#21252F`
_Popup/dropdown/modal backgrounds. Large cluster of near-identical near-black values. Note: `#1F2937` (Tailwind gray-800) maps here by RGB proximity._

| Current Hex | Usage Type | File |
|---|---|---|
| `#24272E` | css variable | `src/index.css` |
| `#24292F` | inline hex | `src/constants/mcp-marketplace.tsx` |
| `#25272D` | border color | `src/components/conversation-events/chat/task-tracking/task-list-section.tsx` |
| `#26282D` | border color | `src/components/features/backends/manage-backends-modal.tsx` |
| `#1F2228` | border color | `src/components/features/conversation-panel/compact-conversation-row.tsx` |
| `#1F2125` | background color | `src/components/features/files-tab/file-content-viewer.tsx` |
| `#1E2028` | border color | `src/components/features/chat/components/slash-command-menu.tsx` |
| `#1F2937` | utility `bg-gray-800` | `src/components/features/conversation-panel/hook-event-item.tsx` |
| `#262626` | utility `bg-neutral-800` | `src/components/conversation-events/chat/event-message-components/skill-item-expanded.tsx` |
| `#242424` | background / inline | `src/ui/card.tsx`, `src/components/features/context-menu/context-menu-container.tsx` |
| `#1F1F1F` | text / background | `src/components/features/backends/manage-backends-modal.tsx`, `src/components/features/home/recent-conversations/conversation-status-dot.tsx` |
| `#1E1E1E` | inline hex | `src/constants/mcp-marketplace.tsx` |

---

### `cool-grey-950` → `#111319`
_App shell, deep backgrounds. Note: current app background `#0B0E14` maps here — the new value is slightly lighter. See note below._

| Current Hex | Usage Type | File |
|---|---|---|
| `#1A1A1A` | background color | `src/components/features/home/recent-conversations/conversation-status-dot.tsx` |
| `#171717` | utility `bg-neutral-900` / `bg-neutral-900/80` | `src/components/features/diff-viewer/file-diff-viewer.tsx`, `src/root.tsx` |
| `#0D0F11` | background color | `src/components/features/alerts/alert-banner.tsx` |
| `#0B0E14` | inline hex (current app bg) | `src/constants/mcp-marketplace.tsx`, SVG backgrounds |
| `#0F172A` | inline hex | `src/constants/mcp-marketplace.tsx` |
| `#111827` | utility `bg-gray-900` | `src/components/features/conversation-panel/system-message-modal/tool-parameters.tsx` |
| `#0C0E10` | css variable | `src/index.css` |
| `#0F0F0F` | inline hex | `src/constants/mcp-marketplace.tsx` |

> **⚠️ Visual note:** The current app shell background `#0B0E14` (lightness ≈ 5.9%) maps to `cool-grey-950` (`#111319`, lightness ≈ 8.4%). This makes the app shell approximately **2.5% lighter** than the current value. If that's too bright, `cool-grey-950` can be overridden to `#0B0E14` in the initial CSS variable definition while preserving the token name.

---

### `cool-grey-975` → `#05070A`
_Near-black accents, rare deep context menus._

| Current Hex | Usage Type | File |
|---|---|---|
| `#0A0A0A` | inline hex | `src/constants/mcp-marketplace.tsx`, `src/ui/card.tsx` |
| `#050505` | border color | `src/components/features/context-menu/context-menu-container.tsx` |

---

## Alpha Variants

These values use the corresponding solid shade with a Tailwind opacity modifier. Apply during Phase 4.

| Current Hex | Opacity | Solid Base → New Token | Tailwind Utility |
|---|---|---|---|
| `#AFB8C133` | 20% | `#AFB8C1` → `cool-grey-300` | `bg-cool-grey-300/20` |
| `#24242499` | 60% | `#242424` → `cool-grey-925` | `bg-cool-grey-925/60` |
| `#242424CC` | 80% | `#242424` → `cool-grey-925` | `bg-cool-grey-925/80` |
| `#1F1F1F99` | 60% | `#1F1F1F` → `cool-grey-925` | `bg-cool-grey-925/60` |
| `#0A0A0A80` | 50% | `#0A0A0A` → `cool-grey-975` | `bg-cool-grey-975/50` |
| `#171717CC` | 80% | `#171717` → `cool-grey-950` (was `bg-neutral-900/80`) | `bg-cool-grey-950/80` |
| `#0A0A0ACC` | 80% | `#0A0A0A` → `cool-grey-975` (was `bg-neutral-950/80`) | `bg-cool-grey-975/80` |
| `#0000001A` | ~10% | `#000000` → `black` | `bg-black/10` |
| `#00000077` | ~47% | `#000000` → `black` | `bg-black/[0.47]` |
| `#00000000` | 0% | transparent | `bg-transparent` |

---

## Tailwind Utility Class Migration

| Old Class | New Class | Notes |
|---|---|---|
| `text-gray-100` | `text-cool-grey-50` | |
| `border-gray-200` / `text-gray-200` | `border-cool-grey-200` / `text-cool-grey-100` | border-gray-200 ≈ 200, text-gray-200 ≈ 100 |
| `text-gray-300` | `text-cool-grey-200` | |
| `bg-gray-400` / `text-gray-400` | `bg-cool-grey-400` / `text-cool-grey-400` | |
| `bg-gray-500` / `text-gray-500` | `bg-cool-grey-600` / `text-cool-grey-600` | Maps to 600, not 500 |
| `border-gray-600` / `bg-gray-600` | `border-cool-grey-700` / `bg-cool-grey-700` | |
| `bg-gray-700` / `text-gray-700` | `bg-cool-grey-800` / `text-cool-grey-800` | |
| `bg-gray-800` | `bg-cool-grey-925` | |
| `bg-gray-900` | `bg-cool-grey-950` | |
| `text-neutral-100` | `text-cool-grey-50` | |
| `text-neutral-200` | `text-cool-grey-100` | |
| `text-neutral-300` | `text-cool-grey-200` | |
| `bg-neutral-400` / `text-neutral-400` | `bg-cool-grey-400` / `text-cool-grey-400` | |
| `bg-neutral-500` / `border-neutral-500` / `text-neutral-500` | `bg-cool-grey-600` / `border-cool-grey-600` / `text-cool-grey-600` | Maps to 600 |
| `bg-neutral-600` / `border-neutral-600` | `bg-cool-grey-700` / `border-cool-grey-700` | |
| `bg-neutral-700` / `border-neutral-700` | `bg-cool-grey-800` / `border-cool-grey-800` | |
| `bg-neutral-800` | `bg-cool-grey-925` | |
| `bg-neutral-900` / `bg-neutral-900/80` | `bg-cool-grey-950` / `bg-cool-grey-950/80` | |
| `bg-neutral-950/80` | `bg-cool-grey-975/80` | |

---

## Files Requiring the Most Changes

Prioritize these files in Phase 3–4 for maximum consolidation:

| File | Approx. Grey Values | Priority |
|---|---|---|
| `src/constants/mcp-marketplace.tsx` | ~12 inline hex values | High |
| `src/index.css` | ~10 css vars + inline hex | High |
| `src/components/features/backends/manage-backends-modal.tsx` | ~8 values | High |
| `src/components/features/chat/components/slash-command-menu.tsx` | ~6 values | High |
| `src/utils/constants.ts` | ~6 inline hex values | Medium |
| `src/components/features/markdown/code.tsx` | ~4 inline hex values | Medium |
| `src/ui/card.tsx` | ~4 alpha values | Medium |
| `src/components/features/diff-viewer/file-diff-viewer.tsx` | ~4 values | Medium |
| `src/components/features/backends/backend-form-modal.tsx` | ~4 utility classes | Medium |
| `src/components/conversation-events/chat/event-message-components/skill-item-expanded.tsx` | ~4 utility classes | Medium |

---

## Migration Strategy (Phased)

### Phase 1 — Define tokens _(no visual change)_
1. Add 13 CSS custom properties to `src/index.css`.
2. Add Tailwind `@theme` entries to `src/tailwind.css`.
3. Run `npm run typecheck && npm run build` to verify no breakage.

### Phase 2 — Replace existing CSS variables in `src/index.css`
Replace the hard-coded hex values already used as CSS variables with the new token references:

```css
/* Before */
--border-color: #3A3D44;
--background-deep: #0C0E10;

/* After */
--border-color: var(--cool-grey-800);
--background-deep: var(--cool-grey-950);
```

Key replacements:
- `#C4CBDA` → `var(--cool-grey-300)`
- `#AFB8C133` → `color-mix(in srgb, var(--cool-grey-300) 20%, transparent)` or CSS `@property`
- `#3C3C4A` → `var(--cool-grey-800)`
- `#31343D` → `var(--cool-grey-900)`
- `#24272E` → `var(--cool-grey-925)`
- `#292929` → `var(--cool-grey-900)`
- `#393939` → `var(--cool-grey-800)`
- `#0C0E10` → `var(--cool-grey-950)`

### Phase 3 — Replace Tailwind utility classes
Find/replace all `text-gray-*`, `bg-gray-*`, `border-gray-*`, `text-neutral-*`, etc. using the utility class table above. Use your IDE's multi-file replace or a codemod script.

### Phase 4 — Replace inline hex values in `.tsx` / `.ts` / `.svg` files
Using the migration tables above, replace each raw hex value with the corresponding Tailwind class or CSS variable. Start with the high-priority files listed above.

For SVG icon files: prefer replacing `fill="#XXXXXX"` with `fill="currentColor"` where the icon color should inherit from the parent element.

### Phase 5 — Handle alpha variants
Replace alpha hex values with the opacity modifier equivalents from the Alpha Variants table.

### Phase 6 — Snapshot test update
Run `npm run test:e2e:snapshots:update` **in CI** to regenerate baselines after the visual pass is complete. Do not regenerate locally — see `AGENTS.md` for the CI workflow procedure.

---

## Values NOT Migrated

### Pure anchors (keep as-is)
- `#FFFFFF` / `#FFF` — pure white primitive
- `#000000` — pure black primitive

### Separately scoped values to flag for designer review
- `#C9C7C7` (warm grey, clipboard icon) — mapped to `cool-grey-300` as approximation
- `#969896` (muted grey with green cast, constants.ts) — mapped to `cool-grey-500` as approximation

---

## Verification Checklist

- [ ] 13 CSS custom properties defined in `src/index.css`
- [ ] Tailwind `@theme` entries added to `src/tailwind.css`
- [ ] `npm run make-i18n && npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run dev:mock` spot-check: home, settings, conversation, backends modal
- [ ] No new inline hex values in the 220–224° grey range introduced
- [ ] `src/index.css` existing CSS variable values replaced with new tokens
- [ ] `src/constants/mcp-marketplace.tsx` cleaned of all scattered inline greys
- [ ] All Tailwind `gray-*` / `neutral-*` utilities replaced with `cool-grey-*` equivalents
- [ ] Alpha variants updated to use opacity modifier syntax
- [ ] Snapshot baselines regenerated in CI after final visual pass
- [ ] Designer has reviewed `#C9C7C7` (warm grey) and `#969896` (muted grey) mappings
