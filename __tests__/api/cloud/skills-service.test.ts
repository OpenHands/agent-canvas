import axios from "axios";
import {
  capturedUpstreamRequest,
  resetCloudProxyMock,
} from "./_proxy-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import SkillsService from "#/api/skills-service";

vi.mock("axios");

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  setRegisteredBackends([cloudBackend]);
  setActiveSelection({ backendId: cloudBackend.id });
  resetCloudProxyMock();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("SkillsService.getSkills against cloud backend", () => {
  it("paginates /api/v1/skills/search directly and returns the merged list", async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce({
        data: {
          items: [
            { name: "alpha", type: "knowledge", source: "global" },
            {
              name: "beta",
              type: "task",
              source: "user",
              triggers: ["foo"],
            },
          ],
          next_page_id: "beta",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ name: "gamma", type: "knowledge", source: "user" }],
          next_page_id: null,
        },
      });

    const skills = await SkillsService.getSkills();

    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(2);

    const firstConfig = capturedUpstreamRequest(0);
    expect(firstConfig).toMatchObject({
      method: "GET",
      headers: { Authorization: "Bearer bearer-token" },
    });
    expect((firstConfig as { url: string }).url).toMatch(
      /^https:\/\/app\.all-hands\.dev\/api\/v1\/skills\/search\?/,
    );
    expect((firstConfig as { url: string }).url).not.toContain("page_id=");

    const secondConfig = capturedUpstreamRequest(1);
    expect((secondConfig as { url: string }).url).toContain("page_id=beta");

    expect(skills.map((s) => s.name)).toEqual(["alpha", "beta", "gamma"]);
    expect(skills[1]).toMatchObject({ triggers: ["foo"] });
  });
});
