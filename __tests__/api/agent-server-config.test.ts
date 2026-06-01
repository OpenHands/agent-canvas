import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_SERVER_CONFIG_STORAGE_KEY,
  DEFAULT_WORKING_DIR,
  buildConversationWorkingDir,
  getAgentServerBaseUrl,
  getAgentServerFormDefaults,
  getAgentServerSessionApiKey,
  getAgentServerWorkingDir,
  isAuthRequired,
  isAuthRequiredAndMissing,
  saveAgentServerConfig,
  shouldLoadPublicSkills,
  syncBakedSessionApiKey,
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

  it("uses the browser origin when browser is at localhost but config uses 127.0.0.1 (Docker CORS fix)", () => {
    mockWindowLocation("http://localhost:8000/");
    window.localStorage.setItem(
      AGENT_SERVER_CONFIG_STORAGE_KEY,
      JSON.stringify({ baseUrl: "http://127.0.0.1:8000" }),
    );

    expect(getAgentServerBaseUrl()).toBe("http://localhost:8000");
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

  it("loads public skills by default when VITE_LOAD_PUBLIC_SKILLS is unset", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "");

    expect(shouldLoadPublicSkills()).toBe(true);
  });

  it("loads public skills when VITE_LOAD_PUBLIC_SKILLS is explicitly 'true'", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "true");

    expect(shouldLoadPublicSkills()).toBe(true);
  });

  it("does not load public skills only when VITE_LOAD_PUBLIC_SKILLS is explicitly 'false'", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "false");

    expect(shouldLoadPublicSkills()).toBe(false);
  });
});

describe("isAuthRequired", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_AUTH_REQUIRED__;
  });

  it("returns false when neither env var nor window flag is set", () => {
    expect(isAuthRequired()).toBe(false);
  });

  it("returns true when VITE_AUTH_REQUIRED is 'true'", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    expect(isAuthRequired()).toBe(true);
  });

  it("returns true when window.__AGENT_CANVAS_AUTH_REQUIRED__ is set (static binary path)", () => {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = true;
    expect(isAuthRequired()).toBe(true);
  });

  it("returns false when window flag is a non-true value", () => {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = "true";
    expect(isAuthRequired()).toBe(false);
  });
});

describe("isAuthRequiredAndMissing", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_AUTH_REQUIRED__;
  });

  it("returns false when VITE_AUTH_REQUIRED is not set", () => {
    expect(isAuthRequiredAndMissing()).toBe(false);
  });

  it("returns true when VITE_AUTH_REQUIRED is true and no key is configured", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");

    expect(isAuthRequiredAndMissing()).toBe(true);
  });

  it("returns true via window flag when no key is configured", () => {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = true;

    expect(isAuthRequiredAndMissing()).toBe(true);
  });

  it("returns false when VITE_AUTH_REQUIRED is true but a key exists in localStorage", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    saveAgentServerConfig({
      baseUrl: "http://localhost:8000",
      sessionApiKey: "stored-key",
    });

    expect(isAuthRequiredAndMissing()).toBe(false);
  });

  it("returns false when window flag is set but a key exists in localStorage", () => {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = true;
    saveAgentServerConfig({
      baseUrl: "http://localhost:8000",
      sessionApiKey: "stored-key",
    });

    expect(isAuthRequiredAndMissing()).toBe(false);
  });

  it("returns false when VITE_AUTH_REQUIRED is true but VITE_SESSION_API_KEY is baked in", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    vi.stubEnv("VITE_SESSION_API_KEY", "baked-key");

    expect(isAuthRequiredAndMissing()).toBe(false);
  });

  it("returns false for non-'true' values of VITE_AUTH_REQUIRED", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "false");

    expect(isAuthRequiredAndMissing()).toBe(false);
  });
});

describe("syncBakedSessionApiKey", () => {
  it("overwrites a stale stored key when VITE_SESSION_API_KEY differs", () => {
    // Simulate Run 1: the onboarding or settings page stored the old key.
    saveAgentServerConfig({
      baseUrl: "http://localhost:8000",
      sessionApiKey: "old-key",
    });

    // Run 2: dev scripts restart with a new key.
    vi.stubEnv("VITE_SESSION_API_KEY", "new-key");

    syncBakedSessionApiKey();

    // The stored config must reflect the new baked key.
    expect(getAgentServerSessionApiKey()).toBe("new-key");
    const raw = JSON.parse(
      window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY) ?? "{}",
    );
    expect(raw.sessionApiKey).toBe("new-key");
  });

  it("does nothing when the stored key already matches the baked key", () => {
    saveAgentServerConfig({
      baseUrl: "http://localhost:8000",
      sessionApiKey: "same-key",
    });
    vi.stubEnv("VITE_SESSION_API_KEY", "same-key");

    syncBakedSessionApiKey();

    expect(getAgentServerSessionApiKey()).toBe("same-key");
  });

  it("does nothing when no key is stored (empty localStorage)", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "baked-key");

    syncBakedSessionApiKey();

    // Falls through to VITE_SESSION_API_KEY as before.
    expect(getAgentServerSessionApiKey()).toBe("baked-key");
    // Should NOT have written to localStorage since there was nothing stale.
    expect(
      window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY),
    ).toBeNull();
  });

  it("does nothing in public mode (no VITE_SESSION_API_KEY)", () => {
    saveAgentServerConfig({
      baseUrl: "http://localhost:8000",
      sessionApiKey: "user-pasted-key",
    });

    // No VITE_SESSION_API_KEY → public mode or static build without injection.
    syncBakedSessionApiKey();

    // The user-pasted key must be preserved.
    expect(getAgentServerSessionApiKey()).toBe("user-pasted-key");
  });
});
