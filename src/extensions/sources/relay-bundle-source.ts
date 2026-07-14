/**
 * A BundleSource that loads extension assets through the parent-window asset relay.
 *
 * This replaces the backend proxy approach for GitHub sources. Instead of routing
 * through `/api/extensions/proxy`, assets are:
 * 1. Fetched by the AssetLoader in the parent window (no CSP restrictions)
 * 2. Converted to blob URLs for iframe loading
 *
 * This follows the VS Code extension model and keeps all extension-specific code
 * in agent-canvas without requiring backend changes.
 */

import { getAssetLoader, type AssetLoader } from "../asset-loader";
import type { BundleSource } from "../loader";
import {
  stampCspNonce,
  generateCspNonce,
  buildWebviewCsp,
} from "../webview-security";

export interface RelayBundleSourceOptions {
  /** Custom asset loader (defaults to singleton). */
  assetLoader?: AssetLoader;
}

/**
 * Create a BundleSource that loads assets through the parent-window relay.
 *
 * For HTML files (webview pages), this:
 * 1. Fetches the HTML content via AssetLoader
 * 2. Stamps a CSP nonce on all script tags
 * 3. Injects a base tag for relative asset resolution
 * 4. Returns a blob URL with proper CSP headers via a data URL wrapper
 *
 * @param source - The resolved source ref (e.g., "github:owner/repo/path@sha")
 * @param options - Optional configuration
 * @returns A BundleSource that routes fetches through the relay
 */
export function createRelayBundleSource(
  source: string,
  options: RelayBundleSourceOptions = {},
): BundleSource {
  const loader = options.assetLoader ?? getAssetLoader();

  return {
    readManifest: async () => {
      const asset = await loader.loadAsset(source, "extension.json");
      const text = new TextDecoder().decode(asset.content);
      return JSON.parse(text);
    },

    assetUrl: async (path: string) => {
      const cleanPath = path.replace(/^\/+/, "");

      // For HTML files, we need special handling to enable proper CSP
      if (cleanPath.endsWith(".html") || cleanPath.endsWith(".htm")) {
        return createWebviewBlobUrl(loader, source, cleanPath);
      }

      // For other assets, return a direct blob URL
      return loader.getBlobUrl(source, cleanPath);
    },
  };
}

/**
 * Create a blob URL for a webview HTML document with proper CSP.
 *
 * The challenge: blob URLs don't support HTTP headers, so we can't set CSP headers
 * directly. Instead, we inject a <meta> CSP tag into the HTML.
 *
 * We also:
 * - Stamp a nonce on script tags so they execute under nonce-based CSP
 * - Inject a base tag so relative asset paths resolve to the parent's relay
 */
async function createWebviewBlobUrl(
  loader: AssetLoader,
  source: string,
  htmlPath: string,
): Promise<string> {
  const asset = await loader.loadAsset(source, htmlPath);
  let html = new TextDecoder().decode(asset.content);

  // Generate a nonce for this load
  const nonce = generateCspNonce();

  // Build CSP for meta tag (frame-ancestors doesn't work in meta, but we have
  // the sandbox attribute on the iframe for that protection)
  const cspDirectives = buildWebviewCsp({ nonce });

  // Stamp nonce on existing script tags
  html = stampCspNonce(html, nonce);

  // Inject CSP meta tag and a marker for the relay
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttr(cspDirectives)}">`;
  const relayMarker = `<script nonce="${nonce}">window.__EXTENSION_SOURCE__=${JSON.stringify(source)};window.__ASSET_BASE_PATH__=${JSON.stringify(htmlPath.replace(/[^/]+$/, ""))};</script>`;

  // Find insertion point: after <head> or at start of document
  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>${cspMeta}${relayMarker}`);
  } else if (html.includes("<head ")) {
    // <head with attributes
    html = html.replace(
      /<head\s[^>]*>/,
      (match) => `${match}${cspMeta}${relayMarker}`,
    );
  } else if (html.includes("<html>") || html.includes("<html ")) {
    // No head tag, inject after html
    html = html.replace(
      /<html[^>]*>/,
      (match) => `${match}<head>${cspMeta}${relayMarker}</head>`,
    );
  } else {
    // No html tag either, prepend
    html = `${cspMeta}${relayMarker}${html}`;
  }

  // Create blob URL
  const blob = new Blob([html], { type: "text/html" });
  return URL.createObjectURL(blob);
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
