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

const ORG_ID = "org-1";
const ORG_BASE = `https://app.all-hands.dev/api/organizations/${ORG_ID}/profiles`;
const SETTINGS_BASE = "https://app.all-hands.dev/api/v1/settings/profiles";

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  vi.mocked(axios.request).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

// With an org bound, profile CRUD goes through the org-gated routes so the
// server enforces EDIT_ORG_SETTINGS (a member's mutation 403s, not just hidden).
describe("ProfilesService against a cloud org (gated org routes)", () => {
  beforeEach(() => {
    setActiveSelection({ backendId: cloudBackend.id, orgId: ORG_ID });
  });

  it("lists profiles via GET /api/organizations/{orgId}/profiles", async () => {
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
      url: ORG_BASE,
      headers: { Authorization: "Bearer bearer-token" },
    });
    expect(res.active_profile).toBe("gpt");
  });

  it("fetches a profile and maps the org `llm` onto `config`", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: { name: "my profile", llm: { model: "gpt-4o", api_key: null } },
    });

    const res = await ProfilesService.getProfile("my profile");

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({
      method: "GET",
      url: `${ORG_BASE}/my%20profile`,
    });
    expect(res).toEqual({
      name: "my profile",
      config: { model: "gpt-4o", api_key: null },
      api_key_set: false,
    });
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
      url: `${ORG_BASE}/gpt`,
      data: { llm: { model: "gpt-4o" }, include_secrets: true },
    });
  });

  it("deletes a profile via DELETE .../{name}", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: { name: "gpt", message: "Profile 'gpt' deleted" },
    });

    await ProfilesService.deleteProfile("gpt");

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({ method: "DELETE", url: `${ORG_BASE}/gpt` });
  });

  it("renames a profile via POST .../{name}/rename with new_name", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: { name: "new", message: "renamed" },
    });

    await ProfilesService.renameProfile("old", "new");

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({
      method: "POST",
      url: `${ORG_BASE}/old/rename`,
      data: { new_name: "new" },
    });
  });

  it("activates a profile and maps the org `llm` onto `llm_applied`", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: {
        name: "gpt",
        message: "Switched to profile 'gpt'",
        llm: { model: "gpt-4o" },
      },
    });

    const res = await ProfilesService.activateProfile("gpt");

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({
      method: "POST",
      url: `${ORG_BASE}/gpt/activate`,
    });
    expect(res).toEqual({
      name: "gpt",
      message: "Switched to profile 'gpt'",
      llm_applied: true,
    });
  });
});

// Legacy API keys have no org bound; CRUD falls back to the per-user settings
// route (ungated — there is no org role to enforce against).
describe("ProfilesService on a cloud backend with no org (fallback)", () => {
  beforeEach(() => {
    setActiveSelection({ backendId: cloudBackend.id });
  });

  it("lists via the per-user settings route", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: { profiles: [], active_profile: null },
    });

    await ProfilesService.listProfiles();

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({ method: "GET", url: SETTINGS_BASE });
  });

  it("saves via the per-user settings route", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: { name: "gpt", message: "saved" },
    });

    await ProfilesService.saveProfile("gpt", {
      llm: { model: "gpt-4o" } as SaveProfileRequest["llm"],
      include_secrets: true,
    });

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({ method: "POST", url: `${SETTINGS_BASE}/gpt` });
  });

  it("activates via the per-user settings route and maps `model`", async () => {
    vi.mocked(axios.request).mockResolvedValueOnce({
      data: { name: "gpt", message: "ok", model: "gpt-4o" },
    });

    const res = await ProfilesService.activateProfile("gpt");

    const [cfg] = vi.mocked(axios.request).mock.calls[0]!;
    expect(cfg).toMatchObject({
      method: "POST",
      url: `${SETTINGS_BASE}/gpt/activate`,
    });
    expect(res.llm_applied).toBe(true);
  });
});
