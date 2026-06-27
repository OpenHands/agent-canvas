import { describe, expect, it } from "vitest";
import {
  chooseOpenHandsFallbackModel,
  parseModelIdsFromModelsResponse,
} from "#/utils/resolve-openhands-model";

describe("parseModelIdsFromModelsResponse", () => {
  it("extracts ids from OpenAI-style data payload", () => {
    const payload = {
      data: [{ id: "claude-opus-4-5-20251101" }, { id: "gpt-5.5" }],
    };

    expect(parseModelIdsFromModelsResponse(payload)).toEqual([
      "claude-opus-4-5-20251101",
      "gpt-5.5",
    ]);
  });

  it("extracts ids from string model arrays", () => {
    const payload = {
      models: ["claude-opus-4-5-20251101", "gpt-5.5"],
    };

    expect(parseModelIdsFromModelsResponse(payload)).toEqual([
      "claude-opus-4-5-20251101",
      "gpt-5.5",
    ]);
  });
});

describe("chooseOpenHandsFallbackModel", () => {
  it("returns requested model when available", () => {
    const available = ["claude-opus-4-5", "claude-opus-4-5-20251101"];

    expect(chooseOpenHandsFallbackModel("claude-opus-4-5", available)).toBe(
      "claude-opus-4-5",
    );
  });

  it("falls back to latest dated variant when alias is unavailable", () => {
    const available = [
      "claude-opus-4-5-20251001",
      "claude-opus-4-5-20251101",
      "gpt-5.5",
    ];

    expect(chooseOpenHandsFallbackModel("claude-opus-4-5", available)).toBe(
      "claude-opus-4-5-20251101",
    );
  });

  it("returns null when no compatible variant exists", () => {
    const available = ["gpt-5.5", "gemini-3.1-pro"];

    expect(
      chooseOpenHandsFallbackModel("claude-opus-4-5", available),
    ).toBeNull();
  });

  it("matches case-insensitive ids when providers vary casing", () => {
    const available = ["GPT-4O", "gpt-4o-mini"];

    expect(chooseOpenHandsFallbackModel("gpt-4o", available)).toBe("GPT-4O");
  });

  it("resolves a bare alias to a provider-prefixed catalog id", () => {
    // The proxy's /v1/models lists underlying-provider-prefixed ids while the
    // dropdown offers the bare verified name. See issue #1111.
    const available = [
      "anthropic/claude-sonnet-4-5",
      "anthropic/claude-haiku-4-5",
    ];

    expect(chooseOpenHandsFallbackModel("claude-sonnet-4-5", available)).toBe(
      "anthropic/claude-sonnet-4-5",
    );
  });

  it("resolves a bare alias to the latest dated provider-prefixed id", () => {
    const available = [
      "anthropic/claude-sonnet-4-5-20250101",
      "anthropic/claude-sonnet-4-5-20250929",
      "anthropic/claude-opus-4-5-20251101",
    ];

    expect(chooseOpenHandsFallbackModel("claude-sonnet-4-5", available)).toBe(
      "anthropic/claude-sonnet-4-5-20250929",
    );
  });

  it("prefers an exact bare id over a provider-prefixed variant", () => {
    const available = ["claude-sonnet-4-5", "anthropic/claude-sonnet-4-5"];

    expect(chooseOpenHandsFallbackModel("claude-sonnet-4-5", available)).toBe(
      "claude-sonnet-4-5",
    );
  });
});
