import { PRODUCT_URL } from "#/utils/constants";

/**
 * Trigger a download for a provided Blob with the given filename
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/**
 * Get the numeric height value from an element's style property
 * @param el The HTML element to get the height from
 * @param fallback The fallback value to return if style height is invalid
 * @returns The numeric height value in pixels, or the fallback value
 *
 * @example
 * getStyleHeightPx(element, 20) // Returns 20 if element.style.height is "auto" or invalid
 * getStyleHeightPx(element, 20) // Returns 100 if element.style.height is "100px"
 */
export const getStyleHeightPx = (el: HTMLElement, fallback: number): number => {
  const elementHeight = parseFloat(el.style.height || "");
  return Number.isFinite(elementHeight) ? elementHeight : fallback;
};

/**
 * Set the height style property of an element to a specific pixel value
 * @param el The HTML element to set the height for
 * @param height The height value in pixels to set
 *
 * @example
 * setStyleHeightPx(element, 100) // Sets element.style.height to "100px"
 * setStyleHeightPx(textarea, 200) // Sets textarea.style.height to "200px"
 */
export const setStyleHeightPx = (el: HTMLElement, height: number): void => {
  el.style.setProperty("height", `${height}px`);
};

/**
 * Detect a phone/tablet user agent (Android, iPhone, iPad, …).
 * Unlike isMobileDevice, this ignores touch capability, so a desktop OS with
 * a touchscreen (e.g. a Windows 2-in-1) is NOT matched. Use this when the
 * decision depends on having a physical keyboard rather than on touch input.
 */
export const isMobileUserAgent = (): boolean =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

/**
 * Detect if the user is on a mobile device.
 * Touch support alone is not sufficient — touchscreen laptops have touch
 * but use a mouse/trackpad as primary input. We check that the primary
 * pointing device is coarse (finger) to avoid false positives.
 */
export const isMobileDevice = (): boolean => {
  if (isMobileUserAgent()) return true;

  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (!hasTouch) return false;

  // If matchMedia is available, check whether the primary pointer is fine
  // (mouse/trackpad). Touchscreen laptops report fine, real mobile devices don't.
  if (typeof window.matchMedia === "function") {
    return !window.matchMedia("(pointer: fine)").matches;
  }

  // Fallback: touch present but no matchMedia — assume mobile
  return true;
};

/**
 * Checks if the current domain is the production domain
 * @returns True if the current domain matches the production URL
 */
export const isProductionDomain = (): boolean =>
  window.location.origin === PRODUCT_URL.PRODUCTION;
