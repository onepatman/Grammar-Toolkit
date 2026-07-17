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

  it("leaves examples empty (no fabricated sentence) when generateFallbackExamples is false and the API gave none", () => {
    const response = [{
      word: "zephyr",
      meanings: [{
        partOfSpeech: "noun",
        definitions: [{ definition: "A gentle breeze." }]
      }]
    }];
    const result = OnlineLookup.normalizeDictionaryResponse(response, "zephyr", { generateFallbackExamples: false });
    expect(result.senses).toHaveLength(1);
    expect(result.senses[0].examples).toEqual([]);
  });

  it("still uses a real API-provided example when generateFallbackExamples is false", () => {
    const result = OnlineLookup.normalizeDictionaryResponse(SAMPLE_API_RESPONSE, "resilient", { generateFallbackExamples: false });
    expect(result.senses[0].examples).toEqual(["The structure is resilient to seismic loads."]);
    expect(result.senses[1].examples).toEqual([]);
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
    // Fails on every source (primary, direct Wiktionary, and the
    // Wiktionary search fallback all return not-ok) each time.
    const fetchImpl = vi.fn(() => jsonResponse([], false));
    const cache = OnlineLookup.createMemoryCache();
    await OnlineLookup.fetchOnlineDefinition("zzzznotaword", { fetchImpl, isOnline: () => true, cache });
    await OnlineLookup.fetchOnlineDefinition("zzzznotaword", { fetchImpl, isOnline: () => true, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(6); // 3 sources x 2 attempts
  });

  it("falls back to the secondary source (Wiktionary) when the primary has nothing", async () => {
    const wiktionaryResponse = {
      en: [{
        partOfSpeech: "Verb",
        definitions: [{ definition: "To apply steady force against something.", examples: ["She pressed the button."] }]
      }]
    };
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("press")) return jsonResponse([], false);
      if (url === OnlineLookup.buildWiktionaryUrl("press")) return jsonResponse(wiktionaryResponse);
      throw new Error("unexpected url: " + url);
    });
    const result = await OnlineLookup.fetchOnlineDefinition("press", { fetchImpl, isOnline: () => true });
    expect(result).not.toBeNull();
    expect(result.w).toBe("press");
    expect(result.senses[0].use).toContain("apply steady force");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("resolves to null when all three sources have nothing", async () => {
    const fetchImpl = vi.fn(() => jsonResponse([], false));
    const result = await OnlineLookup.fetchOnlineDefinition("zzzznotaword", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
  });

  it("does not call the secondary source when the primary already succeeded", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(SAMPLE_API_RESPONSE));
    await OnlineLookup.fetchOnlineDefinition("resilient", { fetchImpl, isOnline: () => true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to a Wiktionary SEARCH match when neither direct-title source has an exact entry for the phrase", async () => {
    // "It slipped my mind." has no page of its own — the real Wiktionary
    // entry is titled "slip someone's mind". This is exactly the gap
    // the search-based third tier exists to close for idioms/sentences.
    const searchResponse = { query: { search: [{ title: "slip someone's mind" }] } };
    const definitionResponse = {
      en: [{ partOfSpeech: "Verb", definitions: [{ definition: "To be forgotten.", examples: ["It slipped my mind that we had a meeting."] }] }]
    };
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("It slipped my mind")) return jsonResponse([], false);
      if (url === OnlineLookup.buildWiktionaryUrl("It slipped my mind")) return jsonResponse({}, false);
      if (url === OnlineLookup.buildWiktionarySearchUrl("It slipped my mind")) return jsonResponse(searchResponse);
      if (url === OnlineLookup.buildWiktionaryUrl("slip someone's mind")) return jsonResponse(definitionResponse);
      throw new Error("unexpected url: " + url);
    });

    const result = await OnlineLookup.fetchOnlineDefinition("It slipped my mind.", { fetchImpl, isOnline: () => true });

    expect(result).not.toBeNull();
    // The saved headword stays exactly what was typed (including the
    // trailing period) — only the LOOKUP used the normalized query and
    // the matched title, never what gets stored.
    expect(result.w).toBe("It slipped my mind.");
    expect(result.senses[0].use).toContain("To be forgotten");
  });

  it("does not call the search fallback when a direct-title source already matched", async () => {
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("resilient")) return jsonResponse(SAMPLE_API_RESPONSE);
      throw new Error("unexpected url: " + url);
    });
    await OnlineLookup.fetchOnlineDefinition("resilient", { fetchImpl, isOnline: () => true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not re-fetch a title identical to the already-failed direct lookup, even if search returns it again", async () => {
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildWiktionarySearchUrl("nonsenseword")) {
        return jsonResponse({ query: { search: [{ title: "nonsenseword" }] } });
      }
      return jsonResponse([], false);
    });
    const result = await OnlineLookup.fetchOnlineDefinition("nonsenseword", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
    // 2 direct sources + the search call itself = 3 (no 4th "re-fetch
    // the same title" call).
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("strips wrapping quotes and trailing sentence punctuation from the query, without changing the saved word", async () => {
    // No `word` field in the response on purpose — normalizeDictionaryResponse
    // falls back to the `word` argument it was called with in that case,
    // which is what this test is actually checking stays untouched.
    const response = [{ meanings: [{ partOfSpeech: "phrase", definitions: [{ definition: "Used to reassure someone that something is fine." }] }] }];
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("No worries")) return jsonResponse(response);
      return jsonResponse([], false);
    });
    const result = await OnlineLookup.fetchOnlineDefinition('"No worries."', { fetchImpl, isOnline: () => true });
    expect(result).not.toBeNull();
    expect(result.w).toBe('"No worries."');
  });
});

describe("normalizeQueryText", () => {
  it("strips wrapping quotes of several styles", () => {
    expect(OnlineLookup.normalizeQueryText('"no worries"')).toBe("no worries");
    expect(OnlineLookup.normalizeQueryText("'no worries'")).toBe("no worries");
    expect(OnlineLookup.normalizeQueryText("‘no worries’")).toBe("no worries");
  });

  it("strips trailing sentence punctuation but keeps internal apostrophes", () => {
    expect(OnlineLookup.normalizeQueryText("It slipped my mind.")).toBe("It slipped my mind");
    expect(OnlineLookup.normalizeQueryText("Would you mind?")).toBe("Would you mind");
    expect(OnlineLookup.normalizeQueryText("No way!")).toBe("No way");
    expect(OnlineLookup.normalizeQueryText("It's raining.")).toBe("It's raining");
  });

  it("leaves an already-clean phrase untouched", () => {
    expect(OnlineLookup.normalizeQueryText("break the ice")).toBe("break the ice");
  });
});

describe("extractWiktionarySearchTitle", () => {
  it("returns the top search result's title", () => {
    const json = { query: { search: [{ title: "slip someone's mind" }, { title: "other" }] } };
    expect(OnlineLookup.extractWiktionarySearchTitle(json)).toBe("slip someone's mind");
  });

  it("returns null for an empty or malformed search response", () => {
    expect(OnlineLookup.extractWiktionarySearchTitle({ query: { search: [] } })).toBeNull();
    expect(OnlineLookup.extractWiktionarySearchTitle({})).toBeNull();
    expect(OnlineLookup.extractWiktionarySearchTitle(null)).toBeNull();
  });
});

describe("normalizeWiktionaryResponse", () => {
  it("strips HTML from the definition and uses the language-keyed 'en' entries", () => {
    const response = {
      en: [{
        partOfSpeech: "Noun",
        definitions: [{ definition: 'A <a href="/wiki/breeze">gentle</a> wind, especially from the west.' }]
      }]
    };
    const result = OnlineLookup.normalizeWiktionaryResponse(response, "zephyr");
    expect(result.w).toBe("zephyr");
    expect(result.senses[0].use).toBe("(noun) A gentle wind, especially from the west.");
  });

  it("generates a fallback example when Wiktionary provides none", () => {
    const response = { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "A gentle breeze." }] }] };
    const result = OnlineLookup.normalizeWiktionaryResponse(response, "zephyr");
    expect(result.senses[0].examples).toHaveLength(1);
    expect(result.senses[0].examples[0]).toContain("zephyr");
  });

  it("returns null when the response has no English entries or is malformed", () => {
    expect(OnlineLookup.normalizeWiktionaryResponse({}, "x")).toBeNull();
    expect(OnlineLookup.normalizeWiktionaryResponse({ en: [] }, "x")).toBeNull();
    expect(OnlineLookup.normalizeWiktionaryResponse(null, "x")).toBeNull();
    expect(OnlineLookup.normalizeWiktionaryResponse({ en: [{ definitions: [] }] }, "x")).toBeNull();
  });

  it("leaves examples empty when generateFallbackExamples is false and Wiktionary provides none", () => {
    const response = { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "A gentle breeze." }] }] };
    const result = OnlineLookup.normalizeWiktionaryResponse(response, "zephyr", { generateFallbackExamples: false });
    expect(result.senses[0].examples).toEqual([]);
  });
});

describe("fetchOnlineDefinition with generateFallbackExamples: false", () => {
  it("threads the option through to the normalizer, leaving fabricated-example-free senses", async () => {
    const response = [{
      word: "zephyr",
      meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A gentle breeze." }] }]
    }];
    const fetchImpl = vi.fn(() => jsonResponse(response));
    const result = await OnlineLookup.fetchOnlineDefinition("zephyr", {
      fetchImpl,
      isOnline: () => true,
      generateFallbackExamples: false
    });
    expect(result.senses[0].examples).toEqual([]);
  });
});
