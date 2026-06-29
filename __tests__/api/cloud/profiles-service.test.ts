import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import ProfilesService, {
  type SaveProfileRequest,
} from "#/api/profiles-service/profiles-service.api";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

const BASE = "https://app.all-hands.dev/api/v1/settings/profiles";

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  vi.mocked(axios.request).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("ProfilesService against a cloud backend", () => {
  it("lists profiles via GET /api/v1/settings/profiles", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: {
        profiles: [
          { name: "gpt", model: "gpt-4o", base_url: null, api_key_set: true },
        ],
        active_profile: "gpt",
      },
    });

    const res = await ProfilesService.listProfiles();

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({
      method: "GET",
      url: BASE,
      headers: { Authorization: "Bearer bearer-token" },
    });
    expect(res.active_profile).toBe("gpt");
  });

  it("fetches a single profile via GET .../{name} (name is url-encoded)", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: {
        name: "my profile",
        config: { model: "gpt-4o", api_key: null },
        api_key_set: true,
      },
    });

    await ProfilesService.getProfile("my profile");

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({ method: "GET", url: `${BASE}/my%20profile` });
  });

  it("saves a profile via POST .../{name} forwarding the request body", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: { name: "gpt", message: "Profile 'gpt' saved" },
    });

    await ProfilesService.saveProfile("gpt", {
      llm: { model: "gpt-4o" } as SaveProfileRequest["llm"],
      include_secrets: true,
    });

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({
      method: "POST",
      url: `${BASE}/gpt`,
      data: { llm: { model: "gpt-4o" }, include_secrets: true },
    });
  });

  it("deletes a profile via DELETE .../{name}", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: { name: "gpt", message: "Profile 'gpt' deleted" },
    });

    await ProfilesService.deleteProfile("gpt");

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({ method: "DELETE", url: `${BASE}/gpt` });
  });

  it("renames a profile via POST .../{name}/rename with new_name", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: { name: "new", message: "renamed" },
    });

    await ProfilesService.renameProfile("old", "new");

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({
      method: "POST",
      url: `${BASE}/old/rename`,
      data: { new_name: "new" },
    });
  });

  it("activates a profile and maps the cloud `model` onto `llm_applied`", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: {
        name: "gpt",
        message: "Switched to profile 'gpt'",
        model: "gpt-4o",
      },
    });

    const res = await ProfilesService.activateProfile("gpt");

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({ method: "POST", url: `${BASE}/gpt/activate` });
    expect(res).toEqual({
      name: "gpt",
      message: "Switched to profile 'gpt'",
      llm_applied: true,
    });
  });
});
