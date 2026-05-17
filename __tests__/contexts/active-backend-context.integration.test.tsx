import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import {
  ActiveBackendProvider,
  useActiveBackendContext,
} from "#/contexts/active-backend-context";
import { server } from "#/mocks/node";
import toast from "react-hot-toast";

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
  },
}));

function makeWrapper(queryClient = new QueryClient()) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    );
  }
  return Wrapper;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.restoreAllMocks();
});

describe("ActiveBackendProvider credential persistence integration", () => {
  it("persists a new Cloud backend through the real credential service", async () => {
    const savedCredentials: unknown[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = await request.json();
        savedCredentials.push(body);
        return HttpResponse.json({ backend: body });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev/",
        apiKey: "cloud-key",
        kind: "cloud",
      }).id;
    });

    await waitFor(() => {
      expect(savedCredentials).toEqual([
        expect.objectContaining({
          id,
          name: "Cloud",
          host: "https://app.all-hands.dev",
          kind: "cloud",
          api_key: "cloud-key",
        }),
      ]);
    });
    expect(result.current.backends.some((backend) => backend.id === id)).toBe(
      true,
    );
  });

  it("keeps the in-memory backend when localStorage quota is exceeded", async () => {
    const savedCredentials: unknown[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = await request.json();
        savedCredentials.push(body);
        return HttpResponse.json({ backend: body });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });
    const storageSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "cloud-key",
        kind: "cloud",
      }).id;
    });

    await waitFor(() => {
      expect(savedCredentials).toEqual([
        expect.objectContaining({
          id,
          api_key: "cloud-key",
        }),
      ]);
    });
    expect(result.current.backends.some((backend) => backend.id === id)).toBe(
      true,
    );
    storageSpy.mockRestore();
  });

  it("rolls back a new Cloud backend when setup persistence fails", async () => {
    server.use(
      http.post("*/setup/backends", () =>
        HttpResponse.json({ error: "disk full" }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "cloud-key",
        kind: "cloud",
      }).id;
    });

    expect(result.current.backends.some((backend) => backend.id === id)).toBe(
      true,
    );
    await waitFor(() => {
      expect(result.current.backends.some((backend) => backend.id === id)).toBe(
        false,
      );
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to save backend credentials locally.",
    );
  });

  it("keeps a new Cloud backend when an edit supersedes its initial persistence", async () => {
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = (await request.json()) as { api_key?: string };
        if (body.api_key === "old-key") {
          await delay(20);
          return HttpResponse.json({ error: "disk full" }, { status: 500 });
        }
        return HttpResponse.json({ backend: body });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "old-key",
        kind: "cloud",
      }).id;
      result.current.updateBackend(id, { apiKey: "new-key" });
    });

    await waitFor(() => {
      expect(
        result.current.backends.find((backend) => backend.id === id),
      ).toMatchObject({ apiKey: "new-key" });
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("removes an edited new Cloud backend when its first successful save fails", async () => {
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = (await request.json()) as { api_key?: string };
        if (body.api_key === "old-key") {
          await delay(20);
          return HttpResponse.json({ backend: body });
        }
        await delay(5);
        return HttpResponse.json({ error: "disk full" }, { status: 500 });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "old-key",
        kind: "cloud",
      }).id;
      result.current.updateBackend(id, { apiKey: "new-key" });
    });

    await waitFor(() => {
      expect(result.current.backends.some((backend) => backend.id === id)).toBe(
        false,
      );
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to save backend credentials locally.",
    );
  });

  it("rolls back a Cloud backend update when setup persistence fails", async () => {
    let postCount = 0;
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        postCount += 1;
        const body = await request.json();
        if (postCount === 1) {
          return HttpResponse.json({ backend: body });
        }
        return HttpResponse.json({ error: "disk full" }, { status: 500 });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "old-key",
        kind: "cloud",
      }).id;
    });
    await waitFor(() => expect(postCount).toBe(1));

    act(() => {
      result.current.updateBackend(id, { apiKey: "new-key" });
    });

    await waitFor(() => {
      expect(
        result.current.backends.find((backend) => backend.id === id),
      ).toMatchObject({ apiKey: "old-key" });
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to save backend credentials locally.",
    );
  });

  it("persists Cloud backend updates through the real credential service", async () => {
    const savedCredentials: unknown[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = await request.json();
        savedCredentials.push(body);
        return HttpResponse.json({ backend: body });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "old-key",
        kind: "cloud",
      }).id;
    });
    await waitFor(() => expect(savedCredentials).toHaveLength(1));

    act(() => {
      result.current.updateBackend(id, {
        name: "Renamed Cloud",
        apiKey: "new-key",
      });
    });

    await waitFor(() => {
      expect(savedCredentials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id,
            name: "Renamed Cloud",
            api_key: "new-key",
          }),
        ]),
      );
    });
  });

  it("keeps the latest rapid Cloud backend update when an earlier save is superseded", async () => {
    const savedCredentials: unknown[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = (await request.json()) as { api_key?: string };
        if (body.api_key === "first-update") {
          await delay(20);
          return HttpResponse.json({ error: "disk full" }, { status: 500 });
        }
        savedCredentials.push(body);
        return HttpResponse.json({ backend: body });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "old-key",
        kind: "cloud",
      }).id;
    });
    await waitFor(() => expect(savedCredentials).toHaveLength(1));

    act(() => {
      result.current.updateBackend(id, { apiKey: "first-update" });
      result.current.updateBackend(id, { apiKey: "second-update" });
    });

    await waitFor(() => {
      expect(
        result.current.backends.find((backend) => backend.id === id),
      ).toMatchObject({ apiKey: "second-update" });
    });
    await waitFor(() => {
      expect(savedCredentials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ api_key: "second-update" }),
        ]),
      );
    });
    await act(async () => {
      await delay(30);
    });
    expect(
      result.current.backends.find((backend) => backend.id === id),
    ).toMatchObject({ apiKey: "second-update" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("rolls back failed Cloud updates to the last persisted state", async () => {
    const savedCredentials: unknown[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = (await request.json()) as { api_key?: string };
        if (body.api_key === "first-update") {
          await delay(20);
        }
        if (body.api_key === "second-update") {
          return HttpResponse.json({ error: "disk full" }, { status: 500 });
        }
        savedCredentials.push(body);
        return HttpResponse.json({ backend: body });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "old-key",
        kind: "cloud",
      }).id;
    });
    await waitFor(() => expect(savedCredentials).toHaveLength(1));

    act(() => {
      result.current.updateBackend(id, { apiKey: "first-update" });
      result.current.updateBackend(id, { apiKey: "second-update" });
    });

    await waitFor(() => {
      expect(
        result.current.backends.find((backend) => backend.id === id),
      ).toMatchObject({ apiKey: "old-key" });
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to save backend credentials locally.",
    );
  });

  it("does not restore a Cloud backend when a superseded update fails after removal", async () => {
    const savedCredentials: unknown[] = [];
    const deletedIds: string[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = (await request.json()) as { api_key?: string };
        if (body.api_key === "pending-update") {
          await delay(20);
          return HttpResponse.json({ error: "disk full" }, { status: 500 });
        }
        savedCredentials.push(body);
        return HttpResponse.json({ backend: body });
      }),
      http.delete("*/setup/backends", ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (id) deletedIds.push(id);
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "old-key",
        kind: "cloud",
      }).id;
    });
    await waitFor(() => expect(savedCredentials).toHaveLength(1));

    act(() => {
      result.current.updateBackend(id, { apiKey: "pending-update" });
      result.current.removeBackend(id);
    });

    await waitFor(() => expect(deletedIds).toEqual([id]));
    expect(result.current.backends.some((backend) => backend.id === id)).toBe(
      false,
    );
    await act(async () => {
      await delay(30);
    });
    expect(result.current.backends.some((backend) => backend.id === id)).toBe(
      false,
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("rolls back a Cloud-to-local update when credential deletion fails", async () => {
    const savedCredentials: unknown[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = await request.json();
        savedCredentials.push(body);
        return HttpResponse.json({ backend: body });
      }),
      http.delete("*/setup/backends", () =>
        HttpResponse.json({ error: "disk full" }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "cloud-key",
        kind: "cloud",
      }).id;
    });
    await waitFor(() => expect(savedCredentials).toHaveLength(1));

    act(() => {
      result.current.updateBackend(id, {
        host: "http://localhost:9000",
        apiKey: "local-key",
        kind: "local",
      });
    });

    await waitFor(() => {
      expect(
        result.current.backends.find((backend) => backend.id === id),
      ).toMatchObject({
        host: "https://app.all-hands.dev",
        apiKey: "cloud-key",
        kind: "cloud",
      });
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to delete backend credentials locally.",
    );
  });

  it("deletes Cloud backend credentials through the real credential service", async () => {
    const deletedIds: string[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) =>
        HttpResponse.json({ backend: await request.json() }),
      ),
      http.delete("*/setup/backends", ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (id) deletedIds.push(id);
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "cloud-key",
        kind: "cloud",
      }).id;
    });
    await waitFor(() =>
      expect(result.current.backends.some((backend) => backend.id === id)).toBe(
        true,
      ),
    );

    act(() => {
      result.current.removeBackend(id);
    });

    await waitFor(() => expect(deletedIds).toEqual([id]));
    expect(result.current.backends.some((backend) => backend.id === id)).toBe(
      false,
    );
  });

  it("only deletes Cloud backend credentials once for duplicate removals", async () => {
    const savedCredentials: unknown[] = [];
    const deletedIds: string[] = [];
    server.use(
      http.post("*/setup/backends", async ({ request }) => {
        const body = await request.json();
        savedCredentials.push(body);
        return HttpResponse.json({ backend: body });
      }),
      http.delete("*/setup/backends", async ({ request }) => {
        await delay(20);
        const id = new URL(request.url).searchParams.get("id");
        if (id) deletedIds.push(id);
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "cloud-key",
        kind: "cloud",
      }).id;
    });
    await waitFor(() => expect(savedCredentials).toHaveLength(1));

    act(() => {
      result.current.removeBackend(id);
      result.current.removeBackend(id);
    });

    await waitFor(() => expect(deletedIds).toEqual([id]));
    expect(result.current.backends.some((backend) => backend.id === id)).toBe(
      false,
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("restores removed Cloud backends when setup deletion fails", async () => {
    server.use(
      http.post("*/setup/backends", async ({ request }) =>
        HttpResponse.json({ backend: await request.json() }),
      ),
      http.delete("*/setup/backends", () =>
        HttpResponse.json({ error: "disk full" }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useActiveBackendContext(), {
      wrapper: makeWrapper(),
    });

    let id = "";
    act(() => {
      id = result.current.addBackend({
        name: "Cloud",
        host: "https://app.all-hands.dev",
        apiKey: "cloud-key",
        kind: "cloud",
      }).id;
    });
    await waitFor(() =>
      expect(result.current.backends.some((backend) => backend.id === id)).toBe(
        true,
      ),
    );

    act(() => {
      result.current.removeBackend(id);
    });

    await waitFor(() => {
      expect(
        result.current.backends.find((backend) => backend.id === id),
      ).toMatchObject({ name: "Cloud" });
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to delete backend credentials locally.",
    );
  });
});
