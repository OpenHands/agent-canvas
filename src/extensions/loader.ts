import { contributionRegistry } from "./contribution-registry";
import { parseManifest, type ExtensionManifest } from "./manifest";
import type {
  ActivationEvent,
  ActivityBarItem,
  CommandItem,
  ExtensionContributions,
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

function buildViews(manifest: ExtensionManifest): ViewItem[] {
  const views = manifest.contributes?.views ?? {};
  return Object.entries(views).flatMap(([containerId, list]) =>
    list.map((view) => ({
      extensionId: manifest.id,
      id: view.id,
      containerId,
      name: view.name,
      type: view.type,
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
  const contributions: ExtensionContributions = {
    activityBarItems: await buildActivityBarItems(manifest, source, host),
    commands: buildCommands(manifest, host),
    views: buildViews(manifest),
  };

  contributionRegistry.register(manifest.id, contributions);
  return { ok: true, manifest };
}

/** Tear down a loaded extension's UI contributions. */
export function unloadExtension(extensionId: string): void {
  contributionRegistry.unregister(extensionId);
}
