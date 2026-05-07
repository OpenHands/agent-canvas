import { getBundledBackend } from "./bundled";
import {
  readStoredActiveBackend,
  readStoredBackends,
  writeStoredActiveBackend,
  writeStoredBackends,
} from "./storage";
import {
  BUNDLED_BACKEND_ID,
  type Backend,
  type BackendSelection,
  type ResolvedActiveBackend,
} from "./types";

type Listener = () => void;

interface Snapshot {
  backends: Backend[];
  selection: BackendSelection | null;
  active: ResolvedActiveBackend;
}

function computeSnapshot(
  backends: Backend[],
  selection: BackendSelection | null,
): Snapshot {
  const bundled = getBundledBackend();

  let activeBackend: Backend = bundled;
  let activeOrgId: string | null = null;

  if (selection) {
    activeOrgId = selection.orgId ?? null;
    if (selection.backendId !== BUNDLED_BACKEND_ID) {
      const found = backends.find((b) => b.id === selection.backendId);
      if (found) {
        activeBackend = found;
      } else {
        activeOrgId = null; // selection points at a removed backend
      }
    }
  }

  return {
    backends,
    selection,
    active: { backend: activeBackend, orgId: activeOrgId },
  };
}

let snapshot: Snapshot = computeSnapshot(
  readStoredBackends(),
  readStoredActiveBackend(),
);

const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getActiveBackend(): ResolvedActiveBackend {
  return snapshot.active;
}

/**
 * Pick the backend to use for *local agent-server protocol* calls.
 *
 * Most of the GUI's services (settings reads/writes, conversation CRUD,
 * skills/MCP/secrets, etc.) speak the local agent-server's protocol —
 * they would fail against a cloud SaaS host. When the user has chosen a
 * cloud backend as active, those calls fall back to the bundled local
 * agent-server. Cloud-only call sites import `getActiveBackend` directly.
 */
export function getEffectiveLocalBackend(): Backend {
  const active = snapshot.active.backend;
  if (active.kind === "cloud") return getBundledBackend();
  return active;
}

export function getRegisteredBackends(): Backend[] {
  return snapshot.backends;
}

export function getActiveSelection(): BackendSelection | null {
  return snapshot.selection;
}

export function getSnapshot(): Snapshot {
  return snapshot;
}

export function setActiveSelection(selection: BackendSelection | null): void {
  writeStoredActiveBackend(selection);
  snapshot = computeSnapshot(snapshot.backends, selection);
  notify();
}

export function setRegisteredBackends(backends: Backend[]): void {
  writeStoredBackends(backends);

  let nextSelection = snapshot.selection;
  if (
    nextSelection &&
    nextSelection.backendId !== BUNDLED_BACKEND_ID &&
    !backends.some((b) => b.id === nextSelection!.backendId)
  ) {
    nextSelection = null;
    writeStoredActiveBackend(null);
  }

  snapshot = computeSnapshot(backends, nextSelection);
  notify();
}

export function subscribeActiveBackend(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: re-read storage and clear listeners. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function __resetActiveStoreForTests(): void {
  snapshot = computeSnapshot(readStoredBackends(), readStoredActiveBackend());
  listeners.clear();
}
