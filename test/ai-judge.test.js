// Unit tests for js/ai-judge.js — the optional, Owner-supplied-key
// Claude smoothness judge behind the Journal tab's grading. Network
// access is always mocked; these never make a real HTTP request, and
// no real API key is ever used.
import { describe, it, expect, vi } from "vitest";
import AIJudge from "../js/ai-judge.js";

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); }
  };
}

const SAMPLE_CLAUDE_RESPONSE = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        score: 7.5,
        summary: "Mostly clear, but a couple of phrases feel translated rather than natural.",
        notes: [
          "\"more on focus on\" reads awkwardly — try \"focuses more on\".",
          "\"a possible US Client\" is a bit stiff — try \"a potential US client\"."
        ]
      })
    }
  ]
};

describe("AIJudge API key storage", () => {
  it("has no key by default, and hasApiKey() reflects that", () => {
    const storage = fakeStorage();
    expect(AIJudge.getApiKey(storage)).toBe("");
    expect(AIJudge.hasApiKey(storage)).toBe(false);
  });

  it("setApiKey() saves a trimmed key, retrievable via getApiKey()/hasApiKey()", () => {
    const storage = fakeStorage();
    AIJudge.setApiKey("  sk-ant-test-123  ", storage);
    expect(AIJudge.getApiKey(storage)).toBe("sk-ant-test-123");
    expect(AIJudge.hasApiKey(storage)).toBe(true);
  });

  it("setApiKey() with a blank value clears any saved key (same as clearApiKey())", () => {
    const storage = fakeStorage();
    AIJudge.setApiKey("sk-ant-test-123", storage);
    AIJudge.setApiKey("   ", storage);
    expect(AIJudge.hasApiKey(storage)).toBe(false);
  });

  it("clearApiKey() removes a saved key", () => {
    const storage = fakeStorage();
    AIJudge.setApiKey("sk-ant-test-123", storage);
    AIJudge.clearApiKey(storage);
    expect(AIJudge.hasApiKey(storage)).toBe(false);
  });
});

describe("AIJudge.normalizeResponse", () => {
  it("parses the model's JSON-only reply into {score, summary, notes}", () => {
    const result = AIJudge.normalizeResponse(SAMPLE_CLAUDE_RESPONSE);
    expect(result.ok).toBe(true);
    expect(result.score).toBe(7.5);
    expect(result.summary).toContain("translated");
    expect(result.notes).toHaveLength(2);
  });

  it("tolerates stray text wrapped around the JSON block", () => {
    const result = AIJudge.normalizeResponse({
      content: [{ type: "text", text: "Sure, here you go:\n" + JSON.stringify({ score: 9, summary: "Great.", notes: [] }) + "\nHope that helps!" }]
    });
    expect(result.ok).toBe(true);
    expect(result.score).toBe(9);
  });

  it("clamps an out-of-range score into 0-10", () => {
    const result = AIJudge.normalizeResponse({
      content: [{ type: "text", text: JSON.stringify({ score: 14, summary: "x", notes: [] }) }]
    });
    expect(result.score).toBe(10);
  });

  it("filters out non-string/blank notes", () => {
    const result = AIJudge.normalizeResponse({
      content: [{ type: "text", text: JSON.stringify({ score: 5, summary: "x", notes: ["real note", "", "   ", 42, null] }) }]
    });
    expect(result.notes).toEqual(["real note"]);
  });

  it("resolves ok:false with reason 'parse-error' when there's no usable JSON", () => {
    const result = AIJudge.normalizeResponse({ content: [{ type: "text", text: "not json at all" }] });
    expect(result).toEqual({ ok: false, reason: "parse-error" });
  });

  it("resolves ok:false with reason 'parse-error' when the score field is missing or non-numeric", () => {
    const result = AIJudge.normalizeResponse({
      content: [{ type: "text", text: JSON.stringify({ summary: "x", notes: [] }) }]
    });
    expect(result).toEqual({ ok: false, reason: "parse-error" });
  });
});

describe("AIJudge.judgeSmoothness", () => {
  it("resolves ok:false with reason 'empty' for blank text, without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await AIJudge.judgeSmoothness("   ", { fetchImpl, isOnline: true, apiKey: "sk-ant-x" });
    expect(result).toEqual({ ok: false, reason: "empty" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves ok:false with reason 'no-api-key' when no key is configured or passed, without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await AIJudge.judgeSmoothness("Some text.", { fetchImpl, isOnline: true, storage: fakeStorage() });
    expect(result).toEqual({ ok: false, reason: "no-api-key" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves ok:false with reason 'offline' when isOnline is false, without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await AIJudge.judgeSmoothness("Some text.", { fetchImpl, isOnline: false, apiKey: "sk-ant-x" });
    expect(result).toEqual({ ok: false, reason: "offline" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs the text as a JSON body with the API key and browser-access headers", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(SAMPLE_CLAUDE_RESPONSE));
    await AIJudge.judgeSmoothness("He go to the market.", { fetchImpl, isOnline: true, apiKey: "sk-ant-x" });
    expect(fetchImpl).toHaveBeenCalledWith(
      AIJudge.API_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "sk-ant-x",
          "anthropic-dangerous-direct-browser-access": "true"
        })
      })
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.messages).toEqual([{ role: "user", content: "He go to the market." }]);
    expect(body.model).toBe(AIJudge.DEFAULT_MODEL);
  });

  it("resolves a full result on a successful response", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(SAMPLE_CLAUDE_RESPONSE));
    const result = await AIJudge.judgeSmoothness("Some text.", { fetchImpl, isOnline: true, apiKey: "sk-ant-x" });
    expect(result.ok).toBe(true);
    expect(result.score).toBe(7.5);
    expect(result.notes).toHaveLength(2);
  });

  it("resolves ok:false with reason 'invalid-key' on an authentication_error response", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({ error: { type: "authentication_error", message: "invalid x-api-key" } }, false));
    const result = await AIJudge.judgeSmoothness("Some text.", { fetchImpl, isOnline: true, apiKey: "bad-key" });
    expect(result).toEqual({ ok: false, reason: "invalid-key" });
  });

  it("resolves ok:false with reason 'http-error' on a generic non-OK response", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({ error: { type: "overloaded_error" } }, false));
    const result = await AIJudge.judgeSmoothness("Some text.", { fetchImpl, isOnline: true, apiKey: "sk-ant-x" });
    expect(result).toEqual({ ok: false, reason: "http-error" });
  });

  it("resolves ok:false with reason 'network-error' (never throws/rejects) on a fetch failure", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("network down")));
    const result = await AIJudge.judgeSmoothness("Some text.", { fetchImpl, isOnline: true, apiKey: "sk-ant-x" });
    expect(result).toEqual({ ok: false, reason: "network-error" });
  });

  it("resolves ok:false with reason 'no-fetch' when no fetch implementation is available", async () => {
    vi.stubGlobal("fetch", undefined);
    try {
      const result = await AIJudge.judgeSmoothness("Some text.", { isOnline: true, apiKey: "sk-ant-x" });
      expect(result).toEqual({ ok: false, reason: "no-fetch" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to a saved key from storage when opts.apiKey isn't passed", async () => {
    const storage = fakeStorage();
    AIJudge.setApiKey("sk-ant-saved", storage);
    const fetchImpl = vi.fn(() => jsonResponse(SAMPLE_CLAUDE_RESPONSE));
    await AIJudge.judgeSmoothness("Some text.", { fetchImpl, isOnline: true, storage });
    expect(fetchImpl.mock.calls[0][1].headers["x-api-key"]).toBe("sk-ant-saved");
  });
});
