import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_SERVER_CONFIG_STORAGE_KEY,
  DEFAULT_WORKING_DIR,
  buildConversationWorkingDir,
  getAgentServerBaseUrl,
  getAgentServerFormDefaults,
  getAgentServerSessionApiKey,
  getAgentServerWorkingDir,
  saveAgentServerConfig,
  shouldLoadPublicSkills,
} from "#/api/agent-server-config";

const ORIGINAL_LOCATION = window.location;

function mockWindowLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
});

describe("agent server config", () => {
  it("uses the browser origin when a remote browser is pointed at localhost backend config", () => {
    mockWindowLocation("https://work-1.example.dev/settings");
    window.localStorage.setItem(
      AGENT_SERVER_CONFIG_STORAGE_KEY,
      JSON.stringify({ baseUrl: "http://127.0.0.1:8000" }),
    );

    expect(getAgentServerBaseUrl()).toBe("https://work-1.example.dev");
  });

  it("preserves a non-local backend URL from stored config", () => {
    mockWindowLocation("https://work-1.example.dev/settings");
    window.localStorage.setItem(
      AGENT_SERVER_CONFIG_STORAGE_KEY,
      JSON.stringify({ baseUrl: "https://agent.example.com" }),
    );

    expect(getAgentServerBaseUrl()).toBe("https://agent.example.com");
  });

  it("prefills the settings form from environment defaults when local settings are empty", () => {
    vi.stubEnv("VITE_BACKEND_BASE_URL", "https://env-agent.example.com/");
    vi.stubEnv("VITE_SESSION_API_KEY", "env-session-key");

    expect(getAgentServerFormDefaults()).toEqual({
      baseUrl: "https://env-agent.example.com",
      sessionApiKey: "env-session-key",
    });
    expect(getAgentServerSessionApiKey()).toBe("env-session-key");
  });

  it("defaults the working dir to the relative workspace path", () => {
    expect(getAgentServerWorkingDir()).toBe(DEFAULT_WORKING_DIR);
  });

  it("nests each conversation's working dir under the configured base using the hex id (matching the server's persistence dir name)", () => {
    vi.stubEnv("VITE_WORKING_DIR", "/srv/workspaces/");

    expect(
      buildConversationWorkingDir("4a8dca37-3bf0-48de-a0af-949d711c3d48"),
    ).toBe("/srv/workspaces/4a8dca373bf048dea0af949d711c3d48");
  });

  it("lets saved interface settings override environment defaults", () => {
    vi.stubEnv("VITE_BACKEND_BASE_URL", "https://env-agent.example.com");
    vi.stubEnv("VITE_SESSION_API_KEY", "env-session-key");

    saveAgentServerConfig({
      baseUrl: "https://saved-agent.example.com/",
      sessionApiKey: "saved-session-key ",
    });

    expect(getAgentServerFormDefaults()).toEqual({
      baseUrl: "https://saved-agent.example.com",
      sessionApiKey: "saved-session-key",
    });
    expect(getAgentServerBaseUrl()).toBe("https://saved-agent.example.com");
    expect(getAgentServerSessionApiKey()).toBe("saved-session-key");
  });

  it("does not load public skills by default when VITE_LOAD_PUBLIC_SKILLS is unset", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "");

    expect(shouldLoadPublicSkills()).toBe(false);
  });

  it("loads public skills only when VITE_LOAD_PUBLIC_SKILLS is explicitly 'true'", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "true");

    expect(shouldLoadPublicSkills()).toBe(true);
  });

  it("does not load public skills for any non-'true' value of VITE_LOAD_PUBLIC_SKILLS", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "false");

    expect(shouldLoadPublicSkills()).toBe(false);
  });
});
