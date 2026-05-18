import { BashClient } from "@openhands/typescript-client/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import BashService from "#/api/bash-service/bash-service.api";
import { callCloudProxy } from "#/api/cloud/proxy";
import type { Backend } from "#/api/backend-registry/types";

const { getEventMock, searchEventsMock } = vi.hoisted(() => ({
  getEventMock: vi.fn(),
  searchEventsMock: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  BashClient: vi.fn(function BashClientMock() {
    return { getEvent: getEventMock, searchEvents: searchEventsMock };
  }),
}));

vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: vi.fn(() => ({
    host: "http://local-agent.example.com",
    apiKey: "local-key",
    workingDir: "/workspace/project",
  })),
}));

vi.mock("#/api/cloud/proxy", () => ({
  callCloudProxy: vi.fn(),
}));

const localBackend: Backend = {
  id: "local-1",
  name: "Local 1",
  host: "http://local-agent.example.com",
  apiKey: "local-key",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "cloud-api-key",
  kind: "cloud",
};

const CONVERSATION_URL = "https://runtime.example.com/api/conversations/conv-1";
const SESSION_KEY = "session-key-abc";
const BASH_CMD_ID = "cmd-123";

const COMMAND_EVENT = {
  id: BASH_CMD_ID,
  timestamp: "2026-01-01T10:00:00Z",
  kind: "BashCommand",
  command: "echo hello",
  cwd: "/workspace",
};

const OUTPUT_EVENT_1 = {
  id: "out-1",
  timestamp: "2026-01-01T10:00:00.100Z",
  kind: "BashOutput",
  command_id: BASH_CMD_ID,
  order: 0,
  stdout: "hello\n",
  stderr: null,
  exit_code: null,
};

const OUTPUT_EVENT_2 = {
  id: "out-2",
  timestamp: "2026-01-01T10:00:00.200Z",
  kind: "BashOutput",
  command_id: BASH_CMD_ID,
  order: 1,
  stdout: null,
  stderr: null,
  exit_code: 0,
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(BashClient).mockClear();
  getEventMock.mockReset();
  searchEventsMock.mockReset();
  vi.mocked(callCloudProxy).mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("BashService.getCommandLogs — local backend", () => {
  beforeEach(() => {
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id, orgId: null });
  });

  it("fetches the BashCommand and paginates BashOutput events via BashClient", async () => {
    getEventMock.mockResolvedValue(COMMAND_EVENT);
    searchEventsMock
      .mockResolvedValueOnce({
        items: [OUTPUT_EVENT_1],
        next_page_id: "next",
      })
      .mockResolvedValueOnce({
        items: [OUTPUT_EVENT_2],
      });

    const logs = await BashService.getCommandLogs(
      CONVERSATION_URL,
      SESSION_KEY,
      BASH_CMD_ID,
    );

    expect(BashClient).toHaveBeenCalled();
    expect(getEventMock).toHaveBeenCalledWith(BASH_CMD_ID);
    expect(searchEventsMock).toHaveBeenCalledTimes(2);
    expect(searchEventsMock.mock.calls[0][0]).toMatchObject({
      kind__eq: "BashOutput",
      command_id__eq: BASH_CMD_ID,
      sort_order: "TIMESTAMP",
    });
    expect(searchEventsMock.mock.calls[1][0]).toMatchObject({
      page_id: "next",
    });
    expect(callCloudProxy).not.toHaveBeenCalled();

    expect(logs.command).toEqual(COMMAND_EVENT);
    expect(logs.outputs).toEqual([OUTPUT_EVENT_1, OUTPUT_EVENT_2]);
  });

  it("throws if the fetched event is not a BashCommand", async () => {
    getEventMock.mockResolvedValue({
      id: BASH_CMD_ID,
      timestamp: "2026-01-01T10:00:00Z",
      kind: "BashOutput",
    });

    await expect(
      BashService.getCommandLogs(CONVERSATION_URL, SESSION_KEY, BASH_CMD_ID),
    ).rejects.toThrow(/Expected BashCommand/);
  });
});

describe("BashService.getCommandLogs — cloud backend", () => {
  beforeEach(() => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id, orgId: null });
  });

  it("routes through callCloudProxy with the runtime hostOverride and session-api-key", async () => {
    vi.mocked(callCloudProxy)
      .mockResolvedValueOnce(COMMAND_EVENT)
      .mockResolvedValueOnce({ items: [OUTPUT_EVENT_1, OUTPUT_EVENT_2] });

    const logs = await BashService.getCommandLogs(
      CONVERSATION_URL,
      SESSION_KEY,
      BASH_CMD_ID,
    );

    expect(BashClient).not.toHaveBeenCalled();
    const [eventCall, searchCall] = vi.mocked(callCloudProxy).mock.calls;

    expect(eventCall[0].method).toBe("GET");
    expect(eventCall[0].path).toBe(`/api/bash/bash_events/${BASH_CMD_ID}`);
    expect(eventCall[0].hostOverride).toBe("http://runtime.example.com");
    expect(eventCall[0].authMode).toBe("session-api-key");
    expect(eventCall[0].sessionApiKey).toBe(SESSION_KEY);

    expect(searchCall[0].path).toMatch(
      /^\/api\/bash\/bash_events\/search\?/,
    );
    const searchUrl = new URL(
      `http://x.example.com${searchCall[0].path as string}`,
    );
    expect(searchUrl.searchParams.get("kind__eq")).toBe("BashOutput");
    expect(searchUrl.searchParams.get("command_id__eq")).toBe(BASH_CMD_ID);
    expect(searchUrl.searchParams.get("sort_order")).toBe("TIMESTAMP");
    expect(searchCall[0].authMode).toBe("session-api-key");

    expect(logs.command).toEqual(COMMAND_EVENT);
    expect(logs.outputs).toEqual([OUTPUT_EVENT_1, OUTPUT_EVENT_2]);
  });
});
