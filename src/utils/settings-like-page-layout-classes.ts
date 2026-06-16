/**
 * Shared layout tokens for /settings/* and extensions pages (/skills, /mcp,
 * /plugins) so mobile gets horizontal inset while desktop keeps the aside +
 * `gap-10` + right gutter pattern.
 */
export const settingsLikeMainScrollClassName =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto custom-scrollbar-always px-4 pt-8 pb-12 md:px-0 md:pr-[14px]";

/**
 * Content column for {@link SettingsLayout} (all `/settings/*` sub-routes).
 *
 * Deliberately has no `overflow-y-auto` so the settings main area does not
 * create an inner scroll container on desktop. Scrolling is handled by the
 * outer `#root-outlet` in `root-layout.tsx`, which already has
 * `overflow-auto` and keeps the settings sidebar sticky via
 * `position: sticky` + `align-self: start`.
 */
export const settingsLayoutMainScrollClassName =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden px-4 pt-8 pb-12 md:px-0 md:pt-0 md:pr-[14px]";
