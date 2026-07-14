import { contributionRegistry } from "./contribution-registry";
import { parseManifest, type ExtensionManifest } from "./manifest";
import type {
  ActivationEvent,
  ActivityBarItem,
  CommandItem,
  ConversationPanelTabItem,
  ExtensionContributions,
  MenuItem,
  PageItem,
  SettingsPageItem,
  ViewItem,
} from "./types";

/**
 * Abstracts where a bundle's bytes come from (a local fixture dir, an installed
 * folder served by the agent-server, an unpacked archive, ...). The loader only
 * needs to read the manifest and resolve relative asset paths to URLs the browser
 * can load (typically `blob:` URLs minted by the caller).
 */
export interface BundleSource {
  /** Returns the JSON-decoded `extension.json` payload. */
  readManifest(): Promise<unknown>;
  /**
   * Resolve a bundle-relative asset path (e.g. `"icon.svg"`) to a loadable URL, or
   * `undefined` if absent. Implementations are responsible for sandboxing (e.g.
   * serving from an isolated origin or minting `blob:` URLs).
   */
  assetUrl(path: string): Promise<string | undefined>;
}

/**
 * The slice of the extension host the loader wires contributions to. Kept as an
 * interface so the loader is testable without a real Web Worker, and so M3 can plug
 * in the concrete host without changing the loader.
 */
export interface ExtensionHostBridge {
  /** Ensure the extension's worker is activated for the given reason. */
  activate(
    manifest: ExtensionManifest,
    reason: ActivationEvent,
  ): void | Promise<void>;
  /** Open a contributed view (e.g. mount its webview panel). */
  openView(extensionId: string, viewId: string): void;
  /** Dispatch a contributed command to the extension. */
  runCommand(extensionId: string, command: string): void | Promise<void>;
}

export type LoadResult =
  | { ok: true; manifest: ExtensionManifest }
  | { ok: false; errors: string[] };

export interface LoadExtensionOptions {
  /**
   * Extension source ref (e.g., "github:owner/repo@sha") for asset relay.
   * When provided, enables webviews to request additional assets via postMessage.
   * Pass this when loading from a gh: source.
   */
  extensionSource?: string;
}

/** Build the resolved `ActivityBarItem`s, wiring selection to the host bridge. */
async function buildActivityBarItems(
  manifest: ExtensionManifest,
  source: BundleSource,
  host: ExtensionHostBridge,
): Promise<ActivityBarItem[]> {
  const containers = manifest.contributes?.viewsContainers?.activitybar ?? [];
  const views = manifest.contributes?.views ?? {};

  return Promise.all(
    containers.map(async (container) => {
      const iconUrl = container.icon
        ? await source.assetUrl(container.icon)
        : undefined;
      // Selecting a rail item opens the container's first contributed view.
      const firstView = views[container.id]?.[0];

      return {
        extensionId: manifest.id,
        id: container.id,
        title: container.title,
        iconUrl,
        onSelect: () => {
          // Fire-and-forget: activation rejections (e.g. teardown races) must not
          // surface as unhandled rejections from a click handler.
          Promise.resolve(
            host.activate(manifest, `onView:${firstView?.id ?? container.id}`),
          ).catch(() => {});
          if (firstView) {
            host.openView(manifest.id, firstView.id);
          }
        },
      } satisfies ActivityBarItem;
    }),
  );
}

function buildCommands(
  manifest: ExtensionManifest,
  host: ExtensionHostBridge,
): CommandItem[] {
  return (manifest.contributes?.commands ?? []).map((cmd) => ({
    extensionId: manifest.id,
    command: cmd.command,
    title: cmd.title,
    run: () => {
      Promise.resolve(
        host.activate(manifest, `onCommand:${cmd.command}`),
      ).catch(() => {});
      return host.runCommand(manifest.id, cmd.command);
    },
  }));
}

/**
 * Build resolved {@link MenuItem}s for each `contributes.menus` slot. Each item binds
 * to one of the extension's own contributed commands: its label is resolved from that
 * command's title, and selecting it activates the worker (`onCommand:<id>`) and
 * dispatches the command — the same path the Command-K menu uses. No extension code
 * runs here. An item whose `command` isn't declared still renders (falling back to the
 * command id as its label) so a typo degrades gracefully instead of breaking the menu.
 */
function buildMenuItems(
  manifest: ExtensionManifest,
  host: ExtensionHostBridge,
): MenuItem[] {
  const menus = manifest.contributes?.menus ?? {};
  const titleByCommand = new Map(
    (manifest.contributes?.commands ?? []).map((c) => [c.command, c.title]),
  );

  return Object.entries(menus).flatMap(([menu, items]) =>
    items.map((item) => ({
      extensionId: manifest.id,
      menu,
      command: item.command,
      title: titleByCommand.get(item.command) ?? item.command,
      group: item.group,
      when: item.when,
      run: () => {
        Promise.resolve(
          host.activate(manifest, `onCommand:${item.command}`),
        ).catch(() => {});
        return host.runCommand(manifest.id, item.command);
      },
    })),
  );
}

async function buildViews(
  manifest: ExtensionManifest,
  source: BundleSource,
  extensionSource?: string,
): Promise<ViewItem[]> {
  const views = manifest.contributes?.views ?? {};
  const capabilities = manifest.capabilities ?? [];
  const entries = Object.entries(views).flatMap(([containerId, list]) =>
    list.map((view) => ({ containerId, view })),
  );
  return Promise.all(
    entries.map(async ({ containerId, view }) => ({
      extensionId: manifest.id,
      id: view.id,
      containerId,
      name: view.name,
      type: view.type,
      pageUrl: view.page ? await source.assetUrl(view.page) : undefined,
      capabilities,
      extensionSource,
    })),
  );
}

/**
 * Build resolved {@link SettingsPageItem}s from `contributes.settingsPages`, resolving
 * each page's bundle-relative HTML to a sandboxed webview URL. The owning extension's
 * capabilities are carried through so the page's webview gets the same capability-gated
 * host API as a `views` webview (e.g. `storage` for persistence). No extension code
 * runs here — only the declarative nav/page surface is resolved.
 */
async function buildSettingsPages(
  manifest: ExtensionManifest,
  source: BundleSource,
  extensionSource?: string,
): Promise<SettingsPageItem[]> {
  const pages = manifest.contributes?.settingsPages ?? [];
  const capabilities = manifest.capabilities ?? [];
  return Promise.all(
    pages.map(async (page) => ({
      extensionId: manifest.id,
      id: page.id,
      title: page.title,
      pageUrl: page.page ? await source.assetUrl(page.page) : undefined,
      when: page.when,
      capabilities,
      extensionSource,
    })),
  );
}

/**
 * Build resolved {@link PageItem}s from `contributes.pages` (full-width sidebar pages),
 * resolving each page's bundle-relative HTML/icon to sandboxed URLs. Each page is shown
 * as a sidebar nav item and navigates to `/x/:extensionId/:pageId`. No extension code
 * runs here — only the declarative nav/page surface is resolved.
 */
async function buildPages(
  manifest: ExtensionManifest,
  source: BundleSource,
  extensionSource?: string,
): Promise<PageItem[]> {
  const pages = manifest.contributes?.pages ?? [];
  const capabilities = manifest.capabilities ?? [];
  return Promise.all(
    pages.map(async (page) => ({
      extensionId: manifest.id,
      id: page.id,
      title: page.title,
      iconUrl: page.icon ? await source.assetUrl(page.icon) : undefined,
      pageUrl: page.page ? await source.assetUrl(page.page) : undefined,
      when: page.when,
      capabilities,
      extensionSource,
    })),
  );
}

/**
 * Build resolved {@link ConversationPanelTabItem}s from `contributes.conversationPanelTabs`,
 * resolving each tab's bundle-relative HTML/icon to sandboxed URLs. Each tab is shown in
 * the conversation drawer tab bar alongside Files, Terminal, Browser. The owning extension's
 * capabilities are carried through so the tab's webview gets the same capability-gated host
 * API (e.g. `conversation:read` for context access). No extension code runs here — only the
 * declarative tab surface is resolved.
 */
async function buildConversationPanelTabs(
  manifest: ExtensionManifest,
  source: BundleSource,
  extensionSource?: string,
): Promise<ConversationPanelTabItem[]> {
  const tabs = manifest.contributes?.conversationPanelTabs ?? [];
  const capabilities = manifest.capabilities ?? [];
  return Promise.all(
    tabs.map(async (tab) => ({
      extensionId: manifest.id,
      id: tab.id,
      title: tab.title,
      iconUrl: tab.icon ? await source.assetUrl(tab.icon) : undefined,
      pageUrl: tab.page ? await source.assetUrl(tab.page) : undefined,
      when: tab.when,
      capabilities,
      extensionSource,
    })),
  );
}

/**
 * Load an extension from a {@link BundleSource}: read + validate its manifest, resolve
 * its declared contributions (icons, view wiring) and register them so they appear in
 * the host UI. Returns a discriminated result; never throws on a malformed bundle.
 *
 * No extension *code* runs here — only the declarative contribution surface is wired.
 * Logic is activated lazily by the host when a contribution is selected.
 */
export async function loadExtension(
  source: BundleSource,
  host: ExtensionHostBridge,
  options: LoadExtensionOptions = {},
): Promise<LoadResult> {
  let rawManifest: unknown;
  try {
    rawManifest = await source.readManifest();
  } catch (error) {
    return {
      ok: false,
      errors: [`failed to read manifest: ${String(error)}`],
    };
  }

  const parsed = parseManifest(rawManifest);
  if (!parsed.ok) {
    return parsed;
  }

  const { manifest } = parsed;
  const { extensionSource } = options;
  const contributions: ExtensionContributions = {
    activityBarItems: await buildActivityBarItems(manifest, source, host),
    commands: buildCommands(manifest, host),
    views: await buildViews(manifest, source, extensionSource),
    menus: buildMenuItems(manifest, host),
    settingsPages: await buildSettingsPages(manifest, source, extensionSource),
    pages: await buildPages(manifest, source, extensionSource),
    conversationPanelTabs: await buildConversationPanelTabs(
      manifest,
      source,
      extensionSource,
    ),
  };

  contributionRegistry.register(manifest.id, contributions);
  return { ok: true, manifest };
}

/** Tear down a loaded extension's UI contributions. */
export function unloadExtension(extensionId: string): void {
  contributionRegistry.unregister(extensionId);
}
