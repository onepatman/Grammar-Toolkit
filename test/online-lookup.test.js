// Unit tests for js/online-lookup.js — the online dictionary fallback.
// Network access is always mocked; these never make a real HTTP request.
import { describe, it, expect, vi } from "vitest";
import OnlineLookup from "../js/online-lookup.js";

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

const SAMPLE_API_RESPONSE = [
  {
    word: "resilient",
    meanings: [
      {
        partOfSpeech: "adjective",
        definitions: [
          {
            definition: "Able to withstand or recover quickly from difficult conditions.",
            example: "The structure is resilient to seismic loads.",
            synonyms: ["tough", "hardy"],
            antonyms: ["fragile"]
          },
          { definition: "Springing back readily." }
        ]
      }
    ]
  }
];

describe("normalizeDictionaryResponse", () => {
  it("maps definitions into the same {w, senses} shape used by local entries", () => {
    const result = OnlineLookup.normalizeDictionaryResponse(SAMPLE_API_RESPONSE, "resilient");
    expect(result.w).toBe("resilient");
    expect(result.source).toBe("online");
    expect(result.mistake).toBeNull();
    expect(result.senses).toEqual([
      {
        use: "(adjective) Able to withstand or recover quickly from difficult conditions.",
        examples: ["The structure is resilient to seismic loads."]
      },
      { use: "(adjective) Springing back readily.", examples: [] }
    ]);
    expect(result.syn).toEqual(["tough", "hardy"]);
    expect(result.ant).toEqual(["fragile"]);
  });

  it("returns null for an empty or malformed response", () => {
    expect(OnlineLookup.normalizeDictionaryResponse([], "x")).toBeNull();
    expect(OnlineLookup.normalizeDictionaryResponse(null, "x")).toBeNull();
    expect(OnlineLookup.normalizeDictionaryResponse([{ meanings: [] }], "x")).toBeNull();
    expect(OnlineLookup.normalizeDictionaryResponse([{ meanings: [{ definitions: [] }] }], "x")).toBeNull();
  });

  it("deduplicates synonyms/antonyms gathered across multiple definitions", () => {
    const response = [{
      word: "quick",
      meanings: [{
        partOfSpeech: "adjective",
        definitions: [
          { definition: "def 1", synonyms: ["fast", "rapid"] },
          { definition: "def 2", synonyms: ["fast", "swift"] }
        ]
      }]
    }];
    const result = OnlineLookup.normalizeDictionaryResponse(response, "quick");
    expect(result.syn).toEqual(["fast", "rapid", "swift"]);
  });
});

describe("fetchOnlineDefinition", () => {
  it("resolves to a normalized entry on a successful lookup", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(SAMPLE_API_RESPONSE));
    const result = await OnlineLookup.fetchOnlineDefinition("resilient", { fetchImpl, isOnline: () => true });
    expect(result.w).toBe("resilient");
    expect(fetchImpl).toHaveBeenCalledWith(
      OnlineLookup.buildRequestUrl("resilient"),
      expect.any(Object)
    );
  });

  it("resolves to null without calling fetch when offline", async () => {
    const fetchImpl = vi.fn();
    const result = await OnlineLookup.fetchOnlineDefinition("resilient", { fetchImpl, isOnline: () => false });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves to null (never throws) on a network error", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("network down")));
    const result = await OnlineLookup.fetchOnlineDefinition("resilient", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
  });

  it("resolves to null on a non-OK HTTP response (e.g. 404 word not found)", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({ title: "No Definitions Found" }, false));
    const result = await OnlineLookup.fetchOnlineDefinition("asdkjhasd", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
  });

  it("resolves to null for a blank word without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await OnlineLookup.fetchOnlineDefinition("   ", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("serves a cached result without calling fetch again", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(SAMPLE_API_RESPONSE));
    const cache = OnlineLookup.createMemoryCache();
    await OnlineLookup.fetchOnlineDefinition("resilient", { fetchImpl, isOnline: () => true, cache });
    const second = await OnlineLookup.fetchOnlineDefinition("Resilient", { fetchImpl, isOnline: () => true, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.w).toBe("resilient");
  });

  it("does not cache a failed lookup, so a later retry can still succeed", async () => {
    const fetchImpl = vi.fn(() => jsonResponse([], false));
    const cache = OnlineLookup.createMemoryCache();
    await OnlineLookup.fetchOnlineDefinition("zzzznotaword", { fetchImpl, isOnline: () => true, cache });
    await OnlineLookup.fetchOnlineDefinition("zzzznotaword", { fetchImpl, isOnline: () => true, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
