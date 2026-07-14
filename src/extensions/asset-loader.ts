/**
 * Asset loader service for extension webviews. Runs in the parent window where
 * there are no CSP restrictions, fetches extension assets from GitHub, caches
 * them, and creates blob URLs for iframe loading.
 *
 * This follows the VS Code extension model: the parent window acts as a
 * privileged "extension host" that can fetch resources and relay them to
 * sandboxed webviews via postMessage or blob URLs.
 */

import type { ExtensionManifest } from "./manifest";
import { splitGithubScheme } from "./sources/ref";

export interface AssetLoaderOptions {
  /** GitHub token for private repos or higher rate limits. */
  githubToken?: string;
  /** Max cache size in bytes (default: 50MB). */
  maxCacheSize?: number;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof fetch;
}

export interface LoadedAsset {
  /** The raw content as ArrayBuffer. */
  content: ArrayBuffer;
  /** MIME type of the content. */
  mimeType: string;
  /** Blob URL for the content (for iframe src, etc.). */
  blobUrl: string;
}

/** Parsed components of a gh: source ref. */
interface ParsedGitHubSource {
  owner: string;
  repo: string;
  /** Subpath within the repo (for monorepos), empty string if none. */
  subpath: string;
  sha: string;
}

const DEFAULT_MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Service that fetches and caches extension assets. Runs in the parent window
 * where there are no CSP restrictions on network requests.
 */
export class AssetLoader {
  private cache = new Map<string, LoadedAsset>();
  private cacheSize = 0;
  private options: Required<
    Pick<AssetLoaderOptions, "maxCacheSize" | "fetch">
  > &
    Pick<AssetLoaderOptions, "githubToken">;

  constructor(options: AssetLoaderOptions = {}) {
    this.options = {
      githubToken: options.githubToken,
      maxCacheSize: options.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE,
      fetch: options.fetch ?? fetch.bind(globalThis),
    };
  }

  /**
   * Load an asset from a GitHub extension source.
   *
   * @param source - Resolved source ref (e.g., "github:owner/repo/path@sha")
   * @param file - File path within the extension
   * @returns Loaded asset with content and blob URL
   */
  async loadAsset(source: string, file: string): Promise<LoadedAsset> {
    const cacheKey = `${source}:${file}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Build the raw GitHub URL
    const url = this.buildGitHubUrl(source, file);

    // Fetch from GitHub (parent window has no CSP restrictions)
    const headers: HeadersInit = {
      Accept: "application/octet-stream",
    };
    if (this.options.githubToken) {
      headers.Authorization = `Bearer ${this.options.githubToken}`;
    }

    const response = await this.options.fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to load asset: ${response.status} ${file}`);
    }

    const content = await response.arrayBuffer();
    const mimeType = this.getMimeType(file);
    const blob = new Blob([content], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    const asset: LoadedAsset = { content, mimeType, blobUrl };

    // Cache for SHA-pinned sources (immutable)
    if (this.isImmutableSource(source)) {
      this.cacheAsset(cacheKey, asset);
    }

    return asset;
  }

  /**
   * Pre-load all known assets for an extension (manifest, HTML, JS, CSS).
   * Call this at install time for better UX.
   */
  async preloadExtension(
    source: string,
    manifest: ExtensionManifest,
  ): Promise<void> {
    const files = this.collectAssetPaths(manifest);
    await Promise.all(files.map((file) => this.loadAsset(source, file)));
  }

  /**
   * Get a blob URL for an asset, loading it if necessary.
   */
  async getBlobUrl(source: string, file: string): Promise<string> {
    const asset = await this.loadAsset(source, file);
    return asset.blobUrl;
  }

  /**
   * Check if an asset is already cached.
   */
  isCached(source: string, file: string): boolean {
    return this.cache.has(`${source}:${file}`);
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { entries: number; sizeBytes: number } {
    return {
      entries: this.cache.size,
      sizeBytes: this.cacheSize,
    };
  }

  /**
   * Update GitHub token (e.g., when user configures it in settings).
   */
  setGitHubToken(token: string | undefined): void {
    this.options.githubToken = token;
  }

  private parseSource(source: string): ParsedGitHubSource {
    // Parse the resolved, SHA-pinned proxy ref `github:owner/repo[/subpath]@sha`.
    // The scheme is funneled through the shared parser so `gh:`/`github://` aliases and
    // a case-insensitive scheme token behave identically to every other GitHub parser.
    const remainder = splitGithubScheme(source);
    if (remainder === null) {
      throw new Error(`Invalid GitHub source: ${source}`);
    }
    const at = remainder.lastIndexOf("@");
    if (at <= 0) {
      throw new Error(`Invalid GitHub source: ${source}`);
    }
    const ownerRepoPath = remainder.slice(0, at);
    const sha = remainder.slice(at + 1);
    const segments = ownerRepoPath.split("/").filter(Boolean);
    if (segments.length < 2 || !sha) {
      throw new Error(`Invalid GitHub source: ${source}`);
    }

    // e.g. "owner/repo/nested/dir" -> owner="owner", repo="repo", subpath="nested/dir"
    const [owner, repo, ...rest] = segments;
    return { owner, repo, subpath: rest.join("/"), sha };
  }

  private buildGitHubUrl(source: string, file: string): string {
    const { owner, repo, subpath, sha } = this.parseSource(source);
    const cleanFile = file.replace(/^\/+/, "");

    // raw.githubusercontent.com URL format: /owner/repo/sha/[subpath/]file
    // For monorepos, subpath is the directory within the repo where the extension lives
    const fullPath = subpath ? `${subpath}/${cleanFile}` : cleanFile;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${fullPath}`;
  }

  private getMimeType(file: string): string {
    const ext = file.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      json: "application/json",
      js: "application/javascript",
      mjs: "application/javascript",
      html: "text/html",
      htm: "text/html",
      css: "text/css",
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      eot: "application/vnd.ms-fontobject",
    };
    return types[ext ?? ""] ?? "application/octet-stream";
  }

  private isImmutableSource(source: string): boolean {
    // SHA-pinned sources are immutable (7-40 hex chars after @)
    const match = source.match(/@([a-f0-9]{7,40})$/i);
    return Boolean(match);
  }

  private cacheAsset(key: string, asset: LoadedAsset): void {
    const assetSize = asset.content.byteLength;

    // Evict oldest entries if cache would exceed limit
    while (
      this.cacheSize + assetSize > this.options.maxCacheSize &&
      this.cache.size > 0
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        const evicted = this.cache.get(oldestKey);
        if (evicted) {
          URL.revokeObjectURL(evicted.blobUrl);
          this.cacheSize -= evicted.content.byteLength;
        }
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, asset);
    this.cacheSize += assetSize;
  }

  private collectAssetPaths(manifest: ExtensionManifest): string[] {
    const paths = ["extension.json"];

    if (manifest.main) paths.push(manifest.main);

    // Collect from contributions
    if (manifest.contributes?.viewsContainers?.activitybar) {
      for (const container of manifest.contributes.viewsContainers
        .activitybar) {
        if (container.icon) paths.push(container.icon);
      }
    }

    if (manifest.contributes?.views) {
      for (const views of Object.values(manifest.contributes.views)) {
        for (const view of views) {
          if (view.page) paths.push(view.page);
        }
      }
    }

    if (manifest.contributes?.settingsPages) {
      for (const page of manifest.contributes.settingsPages) {
        if (page.page) paths.push(page.page);
      }
    }

    return [...new Set(paths)];
  }

  /**
   * Clean up blob URLs when extension is uninstalled.
   * Call with a source prefix to remove all assets for that extension.
   */
  disposeExtension(source: string): void {
    const prefix = `${source}:`;
    for (const [key, asset] of this.cache) {
      if (key.startsWith(prefix)) {
        URL.revokeObjectURL(asset.blobUrl);
        this.cacheSize -= asset.content.byteLength;
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clean up all blob URLs.
   */
  dispose(): void {
    for (const asset of this.cache.values()) {
      URL.revokeObjectURL(asset.blobUrl);
    }
    this.cache.clear();
    this.cacheSize = 0;
  }
}

/** Singleton asset loader instance. */
let assetLoaderInstance: AssetLoader | null = null;

/**
 * Get the global asset loader instance.
 */
export function getAssetLoader(): AssetLoader {
  if (!assetLoaderInstance) {
    assetLoaderInstance = new AssetLoader();
  }
  return assetLoaderInstance;
}

/**
 * Configure the global asset loader with options.
 * Call early in app initialization if you need custom settings.
 */
export function configureAssetLoader(options: AssetLoaderOptions): AssetLoader {
  if (assetLoaderInstance) {
    assetLoaderInstance.dispose();
  }
  assetLoaderInstance = new AssetLoader(options);
  return assetLoaderInstance;
}
