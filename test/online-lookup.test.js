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
    expect(result.senses[0]).toEqual({
      use: "(adjective) Able to withstand or recover quickly from difficult conditions.",
      examples: ["The structure is resilient to seismic loads."]
    });
    // The API gave no example for the second definition — a generated
    // fallback fills in rather than leaving it with none.
    expect(result.senses[1].use).toBe("(adjective) Springing back readily.");
    expect(result.senses[1].examples).toHaveLength(1);
    expect(result.senses[1].examples[0]).toContain("resilient");
    expect(result.syn).toEqual(["tough", "hardy"]);
    expect(result.ant).toEqual(["fragile"]);
  });

  it("never leaves a sense without an example, even when the API provides none at all", () => {
    const response = [{
      word: "zephyr",
      meanings: [{
        partOfSpeech: "noun",
        definitions: [{ definition: "A gentle breeze." }]
      }]
    }];
    const result = OnlineLookup.normalizeDictionaryResponse(response, "zephyr");
    expect(result.senses).toHaveLength(1);
    expect(result.senses[0].examples).toHaveLength(1);
    expect(result.senses[0].examples[0].length).toBeGreaterThan(0);
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

describe("generateFallbackExample", () => {
  it("bolds the word and fits it into a sentence for a known part of speech", () => {
    const example = OnlineLookup.generateFallbackExample("resilient", "adjective", 0);
    expect(example).toContain("<b>resilient</b>");
    expect(example.length).toBeGreaterThan("resilient".length);
  });

  it("produces a usable sentence for noun, verb, and adverb too", () => {
    ["noun", "verb", "adverb"].forEach((pos) => {
      const example = OnlineLookup.generateFallbackExample("word", pos, 0);
      expect(example).toContain("<b>word</b>");
    });
  });

  it("falls back to a generic template for an unrecognized or missing part of speech", () => {
    const example = OnlineLookup.generateFallbackExample("zephyr", "interjection", 0);
    expect(example).toContain("<b>zephyr</b>");
    expect(OnlineLookup.generateFallbackExample("zephyr", undefined, 0)).toContain("<b>zephyr</b>");
  });

  it("varies the sentence by seed so multiple senses of the same word don't repeat", () => {
    const first = OnlineLookup.generateFallbackExample("run", "verb", 0);
    const second = OnlineLookup.generateFallbackExample("run", "verb", 1);
    expect(first).not.toBe(second);
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
