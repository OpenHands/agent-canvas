import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import V1ConversationService from "#/api/conversation-service/v1-conversation-service.api";

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
  vi.mocked(axios.post).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("V1ConversationService.downloadConversation cloud branch", () => {
  it("routes through /api/cloud-proxy to the SaaS download endpoint with responseType blob and returns the Blob", async () => {
    const zipBlob = new Blob(["zip-bytes"], { type: "application/zip" });
    vi.mocked(axios.post).mockResolvedValue({ data: zipBlob });

    const result = await V1ConversationService.downloadConversation("conv-abc");

    expect(axios.post).toHaveBeenCalledOnce();
    const [url, body, config] = vi.mocked(axios.post).mock.calls[0]!;

    expect(url).toMatch(/\/api\/cloud-proxy$/);
    expect(body).toMatchObject({
      host: cloudBackend.host,
      method: "GET",
      path: "/api/v1/app-conversations/conv-abc/download",
    });
    expect(config).toMatchObject({ responseType: "blob" });
    expect(result).toBe(zipBlob);
  });
});
