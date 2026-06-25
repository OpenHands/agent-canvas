export const DROPDOWN_MENU_VIEWPORT_PADDING_PX = 16;

export interface DropdownMenuLayout {
  needsScroll: boolean;
  maxHeightPx: number | undefined;
}

export function getDropdownMenuAvailableHeightPx(
  anchorRect: DOMRect,
  openUpward: boolean,
  viewportHeight: number,
  viewportPaddingPx: number = DROPDOWN_MENU_VIEWPORT_PADDING_PX,
): number {
  const availableAbove = anchorRect.top - viewportPaddingPx;
  const availableBelow = viewportHeight - anchorRect.bottom - viewportPaddingPx;
  return Math.max(0, openUpward ? availableAbove : availableBelow);
}

export function computeDropdownMenuLayout(
  anchorRect: DOMRect,
  contentHeight: number,
  openUpward: boolean,
  viewportHeight: number,
  viewportPaddingPx: number = DROPDOWN_MENU_VIEWPORT_PADDING_PX,
): DropdownMenuLayout {
  const availableHeight = getDropdownMenuAvailableHeightPx(
    anchorRect,
    openUpward,
    viewportHeight,
    viewportPaddingPx,
  );

  if (contentHeight <= availableHeight) {
    return { needsScroll: false, maxHeightPx: undefined };
  }

  return {
    needsScroll: true,
    maxHeightPx: availableHeight,
  };
}
