import { beforeEach, describe, expect, it } from "vitest";
import { useProjectRegistryStore } from "#/stores/project-registry-store";

const BACKEND_ID = "default-local";
const OTHER_BACKEND = "cloud-1";

const slugs = (backendId: string) =>
  (useProjectRegistryStore.getState().projectsByBackendId[backendId] ?? []).map(
    (p) => p.slug,
  );

describe("project-registry store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useProjectRegistryStore.setState({ projectsByBackendId: {} });
  });

  it("creates a project keyed by its derived slug", () => {
    const created = useProjectRegistryStore
      .getState()
      .upsertProject(BACKEND_ID, {
        name: "Spotwise Billing",
        repos: ["org/a"],
      });

    expect(created).toMatchObject({
      slug: "spotwise-billing",
      repos: ["org/a"],
    });
    expect(slugs(BACKEND_ID)).toEqual(["spotwise-billing"]);
  });

  it("returns null and stores nothing for an invalid draft", () => {
    expect(
      useProjectRegistryStore
        .getState()
        .upsertProject(BACKEND_ID, { name: "  " }),
    ).toBeNull();
    expect(slugs(BACKEND_ID)).toEqual([]);
  });

  it("updates an existing project in place (same slug) instead of duplicating", () => {
    const store = useProjectRegistryStore.getState();
    store.upsertProject(BACKEND_ID, { name: "Billing", repos: ["org/a"] });
    store.upsertProject(BACKEND_ID, {
      name: "Billing",
      repos: ["org/a", "org/b"],
    });

    expect(slugs(BACKEND_ID)).toEqual(["billing"]);
    expect(
      useProjectRegistryStore.getState().projectsByBackendId[BACKEND_ID]?.[0]
        ?.repos,
    ).toEqual(["org/a", "org/b"]);
  });

  it("removes a project by slug", () => {
    const store = useProjectRegistryStore.getState();
    store.upsertProject(BACKEND_ID, { name: "Alpha" });
    store.upsertProject(BACKEND_ID, { name: "Beta" });
    store.removeProject(BACKEND_ID, "alpha");

    expect(slugs(BACKEND_ID)).toEqual(["beta"]);
  });

  it("is a no-op when removing an unknown slug", () => {
    useProjectRegistryStore
      .getState()
      .upsertProject(BACKEND_ID, { name: "Alpha" });
    useProjectRegistryStore.getState().removeProject(BACKEND_ID, "ghost");

    expect(slugs(BACKEND_ID)).toEqual(["alpha"]);
  });

  it("scopes projects per backend id", () => {
    const store = useProjectRegistryStore.getState();
    store.upsertProject(BACKEND_ID, { name: "Local Only" });
    store.upsertProject(OTHER_BACKEND, { name: "Cloud Only" });

    expect(slugs(BACKEND_ID)).toEqual(["local-only"]);
    expect(slugs(OTHER_BACKEND)).toEqual(["cloud-only"]);
  });

  it("persists to localStorage", () => {
    useProjectRegistryStore
      .getState()
      .upsertProject(BACKEND_ID, { name: "Persisted" });

    const raw = window.localStorage.getItem("project-registry");
    expect(raw).toContain("persisted");
  });
});
