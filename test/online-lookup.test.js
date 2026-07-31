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

  it("carries internal review-tracking metadata (needs_review), distinct from a reviewed built-in entry — for audit purposes only, not a UI warning trigger", () => {
    const result = OnlineLookup.normalizeDictionaryResponse(SAMPLE_API_RESPONSE, "resilient");
    expect(result.verified).toEqual({
      status: "needs_review",
      checkedAgainst: null,
      lastAuditedAt: null,
      heuristicFlags: []
    });
  });

  it("labels the result with its real source name — the Free Dictionary API, never a fabricated brand like Oxford or Merriam-Webster", () => {
    const result = OnlineLookup.normalizeDictionaryResponse(SAMPLE_API_RESPONSE, "resilient");
    expect(result.sourceName).toBe(OnlineLookup.SOURCE_FREE_DICTIONARY_API);
    expect(result.sourceName).toBe("Free Dictionary API");
  });

  it("captures the phonetic spelling when the API provides one", () => {
    const response = [{ ...SAMPLE_API_RESPONSE[0], phonetic: "/rɪˈzɪliənt/" }];
    const result = OnlineLookup.normalizeDictionaryResponse(response, "resilient");
    expect(result.phonetic).toBe("/rɪˈzɪliənt/");
  });

  it("falls back to phonetics[].text when the top-level phonetic field is blank", () => {
    const response = [{
      ...SAMPLE_API_RESPONSE[0],
      phonetic: "",
      phonetics: [{ text: "" }, { text: "/rɪˈzɪljənt/", audio: "https://example.com/audio.mp3" }]
    }];
    const result = OnlineLookup.normalizeDictionaryResponse(response, "resilient");
    expect(result.phonetic).toBe("/rɪˈzɪljənt/");
  });

  it("leaves phonetic null (never fabricated) when the API has neither field", () => {
    const result = OnlineLookup.normalizeDictionaryResponse(SAMPLE_API_RESPONSE, "resilient");
    expect(result.phonetic).toBeNull();
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

  it("keeps up to MAX_SYN_ANT (10) synonyms/antonyms, never fabricating more than the source actually returned", () => {
    const manySyn = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
    const response = [{
      word: "many",
      meanings: [{ partOfSpeech: "adjective", definitions: [{ definition: "def 1", synonyms: manySyn }] }]
    }];
    const result = OnlineLookup.normalizeDictionaryResponse(response, "many");
    expect(result.syn).toHaveLength(OnlineLookup.MAX_SYN_ANT);
    expect(result.syn).toEqual(manySyn.slice(0, OnlineLookup.MAX_SYN_ANT));
  });

  it("captures a word-origin string when the API provides one", () => {
    const response = [{ ...SAMPLE_API_RESPONSE[0], origin: "Old English, resilient" }];
    const result = OnlineLookup.normalizeDictionaryResponse(response, "resilient");
    expect(result.origin).toBe("Old English, resilient");
  });

  it("leaves origin null (never fabricated) when the API has none", () => {
    const result = OnlineLookup.normalizeDictionaryResponse(SAMPLE_API_RESPONSE, "resilient");
    expect(result.origin).toBeNull();
  });

  it("captures more than 2 definitions per part of speech (up to DEFINITIONS_PER_MEANING), matching the '2-5 meanings per part of speech' editorial target", () => {
    const response = [{
      word: "many-defs",
      meanings: [{
        partOfSpeech: "noun",
        definitions: [
          { definition: "def 1" }, { definition: "def 2" }, { definition: "def 3" }, { definition: "def 4" }, { definition: "def 5" }, { definition: "def 6 (should be dropped)" }
        ]
      }]
    }];
    const result = OnlineLookup.normalizeDictionaryResponse(response, "many-defs");
    expect(result.senses).toHaveLength(5);
    expect(result.senses.map((s) => s.use)).not.toContain("(noun) def 6 (should be dropped)");
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
      if (url === OnlineLookup.buildWiktionaryWikitextUrl("press")) return jsonResponse({ parse: { wikitext: "" } });
      throw new Error("unexpected url: " + url);
    });
    const result = await OnlineLookup.fetchOnlineDefinition("press", { fetchImpl, isOnline: () => true });
    expect(result).not.toBeNull();
    expect(result.w).toBe("press");
    expect(result.senses[0].use).toContain("apply steady force");
    // Wiktionary's own definition result has no synonyms/antonyms, so the
    // syn/ant-enrichment tier also fires (a 3rd call) to try to fill them in.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
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
      if (url === OnlineLookup.buildWiktionaryWikitextUrl("It slipped my mind.")) return jsonResponse({ parse: { wikitext: "" } });
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

describe("computeTitleSimilarity", () => {
  it("returns 1 for an identical (case-insensitive) match", () => {
    expect(OnlineLookup.computeTitleSimilarity("Juggle", "juggle")).toBe(1);
  });

  it("returns a moderate score for a genuine idiom whose canonical title is worded differently", () => {
    const score = OnlineLookup.computeTitleSimilarity("slip someone's mind", "it slipped my mind");
    expect(score).toBeGreaterThan(OnlineLookup.SEARCH_MATCH_REJECT_THRESHOLD);
    expect(score).toBeLessThan(OnlineLookup.SEARCH_MATCH_LOW_CONFIDENCE_THRESHOLD);
  });

  it("returns 0 for two words that share no meaningful overlap", () => {
    // The class of bug this guards against: a search fallback that
    // silently attaches an unrelated word's page (e.g. "magic trick")
    // to a query it doesn't actually match (e.g. "juggle").
    expect(OnlineLookup.computeTitleSimilarity("juggle", "magic trick")).toBe(0);
  });

  it("returns 0 when either string is empty", () => {
    expect(OnlineLookup.computeTitleSimilarity("", "juggle")).toBe(0);
    expect(OnlineLookup.computeTitleSimilarity("juggle", "")).toBe(0);
  });
});

describe("fetchOnlineDefinition — Wiktionary search-tier confidence guard", () => {
  it("discards a search hit whose title is essentially unrelated to the query, instead of showing it as a match", async () => {
    const searchResponse = { query: { search: [{ title: "completely unrelated topic" }] } };
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildWiktionarySearchUrl("zzzqueryword")) return jsonResponse(searchResponse);
      return jsonResponse([], false);
    });
    const result = await OnlineLookup.fetchOnlineDefinition("zzzqueryword", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
  });

  it("flags a plausible-but-not-exact search match as low confidence instead of presenting it as settled fact", async () => {
    const searchResponse = { query: { search: [{ title: "slip someone's mind" }] } };
    const definitionResponse = {
      en: [{ partOfSpeech: "Verb", definitions: [{ definition: "To be forgotten.", examples: ["It slipped my mind."] }] }]
    };
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildWiktionarySearchUrl("it slipped my mind")) return jsonResponse(searchResponse);
      if (url === OnlineLookup.buildWiktionaryUrl("slip someone's mind")) return jsonResponse(definitionResponse);
      return jsonResponse([], false);
    });
    const result = await OnlineLookup.fetchOnlineDefinition("it slipped my mind", { fetchImpl, isOnline: () => true });
    expect(result).not.toBeNull();
    expect(result.matchConfidence).toBe("low");
    expect(result.verified.heuristicFlags).toContain("low_confidence_title_match");
  });
});

describe("extractPhonetic", () => {
  it("prefers the top-level phonetic field", () => {
    const json = [{ phonetic: "/ˈwɜːd/", phonetics: [{ text: "/ˈother/" }] }];
    expect(OnlineLookup.extractPhonetic(json)).toBe("/ˈwɜːd/");
  });

  it("falls back to the first non-empty phonetics[].text", () => {
    const json = [{ phonetic: "", phonetics: [{ text: "" }, { text: "/ˈwɜːd/" }] }];
    expect(OnlineLookup.extractPhonetic(json)).toBe("/ˈwɜːd/");
  });

  it("returns null when nothing is available anywhere in the response", () => {
    expect(OnlineLookup.extractPhonetic([{ meanings: [] }])).toBeNull();
    expect(OnlineLookup.extractPhonetic([])).toBeNull();
    expect(OnlineLookup.extractPhonetic(null)).toBeNull();
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

  it("strips an embedded <style> block whole, never leaking its raw CSS text into the definition", () => {
    // A real Wiktionary REST API response for a word like "nightmare"
    // includes a <style>.mw-parser-output .defdate{font-size:smaller}</style>
    // block inside the definition HTML — stripping only the <style> tags
    // themselves (the old regex) would leave that CSS rule as visible
    // plain text right in the middle of the definition.
    const response = {
      en: [{
        partOfSpeech: "Noun",
        definitions: [{
          definition: '<style data-mw-deduplicate="TemplateStyles:r12345">.mw-parser-output .defdate{font-size:smaller}</style>A very unpleasant or frightening dream.'
        }]
      }]
    };
    const result = OnlineLookup.normalizeWiktionaryResponse(response, "nightmare");
    expect(result.senses[0].use).toBe("(noun) A very unpleasant or frightening dream.");
    expect(result.senses[0].use).not.toContain("mw-parser-output");
    expect(result.senses[0].use).not.toContain("font-size");
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

  it("also carries internal review-tracking metadata (needs_review)", () => {
    const response = { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "A gentle breeze." }] }] };
    const result = OnlineLookup.normalizeWiktionaryResponse(response, "zephyr");
    expect(result.verified.status).toBe("needs_review");
  });

  it("labels the result as sourced from Wiktionary", () => {
    const response = { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "A gentle breeze." }] }] };
    const result = OnlineLookup.normalizeWiktionaryResponse(response, "zephyr");
    expect(result.sourceName).toBe(OnlineLookup.SOURCE_WIKTIONARY);
    expect(result.sourceName).toBe("Wiktionary");
  });

  it("leaves examples empty when generateFallbackExamples is false and Wiktionary provides none", () => {
    const response = { en: [{ partOfSpeech: "Noun", definitions: [{ definition: "A gentle breeze." }] }] };
    const result = OnlineLookup.normalizeWiktionaryResponse(response, "zephyr", { generateFallbackExamples: false });
    expect(result.senses[0].examples).toEqual([]);
  });
});

describe("isMultiWordQuery", () => {
  it("is true for anything containing whitespace", () => {
    expect(OnlineLookup.isMultiWordQuery("burn the midnight oil")).toBe(true);
    expect(OnlineLookup.isMultiWordQuery("give up")).toBe(true);
  });

  it("is false for a single word", () => {
    expect(OnlineLookup.isMultiWordQuery("resilient")).toBe(false);
  });

  it("is false for empty/blank input", () => {
    expect(OnlineLookup.isMultiWordQuery("")).toBe(false);
    expect(OnlineLookup.isMultiWordQuery("   ")).toBe(false);
    expect(OnlineLookup.isMultiWordQuery(null)).toBe(false);
  });
});

describe("mergeLookupResults", () => {
  const fda = {
    w: "burn the midnight oil", phonetic: "/bɜːrn/", origin: null,
    senses: [{ use: "(verb) To work late into the night.", examples: ["He burned the midnight oil."] }],
    syn: ["work late"], ant: ["call it a day"], mistake: null, tagalog: null,
    source: "online", sourceName: "Free Dictionary API", verified: { status: "needs_review", heuristicFlags: [] }
  };
  const wiktSameSense = {
    w: "burn the midnight oil",
    senses: [{ use: "(verb) To work late into the night.", examples: ["Different example sentence."] }],
    syn: [], ant: [], mistake: null, tagalog: null, source: "online", sourceName: "Wiktionary", verified: {}
  };
  const wiktExtraSense = {
    w: "burn the midnight oil",
    senses: [{ use: "(idiom) To stay up working, especially studying.", examples: ["She burned the midnight oil before exams."] }],
    syn: [], ant: [], mistake: null, tagalog: null, source: "online", sourceName: "Wiktionary", verified: {}
  };

  it("returns the other result unchanged when one side is null", () => {
    expect(OnlineLookup.mergeLookupResults(fda, null)).toBe(fda);
    expect(OnlineLookup.mergeLookupResults(null, wiktExtraSense)).toBe(wiktExtraSense);
    expect(OnlineLookup.mergeLookupResults(null, null)).toBeNull();
  });

  it("keeps the Free Dictionary API's own senses, synonyms, antonyms, and phonetic untouched", () => {
    const merged = OnlineLookup.mergeLookupResults(fda, wiktExtraSense);
    expect(merged.senses[0]).toEqual(fda.senses[0]);
    expect(merged.syn).toEqual(["work late"]);
    expect(merged.ant).toEqual(["call it a day"]);
    expect(merged.phonetic).toBe("/bɜːrn/");
  });

  it("appends a Wiktionary sense whose definition text isn't already covered", () => {
    const merged = OnlineLookup.mergeLookupResults(fda, wiktExtraSense);
    expect(merged.senses).toHaveLength(2);
    expect(merged.senses[1].use).toContain("stay up working");
    expect(merged.sourceName).toBe("Free Dictionary API + Wiktionary");
  });

  it("does not duplicate a Wiktionary sense whose definition text already matches a Free Dictionary API sense", () => {
    const merged = OnlineLookup.mergeLookupResults(fda, wiktSameSense);
    expect(merged.senses).toHaveLength(1);
    // No new content actually added — stays attributed to the Free
    // Dictionary API alone, never claiming a "+" merge that added nothing.
    expect(merged.sourceName).toBe("Free Dictionary API");
  });
});

describe("fetchOnlineDefinition — hybrid Free Dictionary API + Wiktionary merge for multi-word queries", () => {
  it("does not call Wiktionary at all for a single-word query once the Free Dictionary API already succeeded", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(SAMPLE_API_RESPONSE));
    await OnlineLookup.fetchOnlineDefinition("resilient", { fetchImpl, isOnline: () => true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("also queries Wiktionary for a multi-word query even when the Free Dictionary API already succeeded, and merges in any new sense", async () => {
    const fdaResponse = [{
      word: "burn the midnight oil",
      meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To work late into the night.", example: "He burned the midnight oil." }] }]
    }];
    const wiktResponse = {
      en: [{ partOfSpeech: "Idiom", definitions: [{ definition: "To stay up working, especially studying.", examples: ["She burned the midnight oil before exams."] }] }]
    };
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("burn the midnight oil")) return jsonResponse(fdaResponse);
      if (url === OnlineLookup.buildWiktionaryUrl("burn the midnight oil")) return jsonResponse(wiktResponse);
      if (url === OnlineLookup.buildWiktionaryWikitextUrl("burn the midnight oil")) return jsonResponse({ parse: { wikitext: "" } });
      throw new Error("unexpected url: " + url);
    });

    const result = await OnlineLookup.fetchOnlineDefinition("burn the midnight oil", { fetchImpl, isOnline: () => true });

    // Neither source's synonyms/antonyms are populated here, so the
    // syn/ant-enrichment tier also fires (a 3rd call) trying to fill them in.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.senses).toHaveLength(2);
    expect(result.senses[0].use).toContain("work late into the night");
    expect(result.senses[1].use).toContain("stay up working");
    expect(result.sourceName).toBe("Free Dictionary API + Wiktionary");
  });

  it("stays attributed to the Free Dictionary API alone when Wiktionary has nothing new to add for a multi-word query", async () => {
    const fdaResponse = [{
      word: "give up",
      meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To stop trying.", example: "Don't give up." }] }]
    }];
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("give up")) return jsonResponse(fdaResponse);
      if (url === OnlineLookup.buildWiktionaryUrl("give up")) return jsonResponse({}, false);
      if (url === OnlineLookup.buildWiktionaryWikitextUrl("give up")) return jsonResponse({ parse: { wikitext: "" } });
      throw new Error("unexpected url: " + url);
    });

    const result = await OnlineLookup.fetchOnlineDefinition("give up", { fetchImpl, isOnline: () => true });

    // No synonyms/antonyms from the Free Dictionary API here either, so
    // the syn/ant-enrichment tier fires too (a 3rd call).
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.sourceName).toBe("Free Dictionary API");
    expect(result.senses).toHaveLength(1);
  });

  it("still falls back to Wiktionary alone for a multi-word query the Free Dictionary API has nothing for at all", async () => {
    const wiktResponse = {
      en: [{ partOfSpeech: "Idiom", definitions: [{ definition: "To relax before going to sleep.", examples: ["He likes to wind down with a book."] }] }]
    };
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("wind down")) return jsonResponse([], false);
      if (url === OnlineLookup.buildWiktionaryUrl("wind down")) return jsonResponse(wiktResponse);
      if (url === OnlineLookup.buildWiktionaryWikitextUrl("wind down")) return jsonResponse({ parse: { wikitext: "" } });
      throw new Error("unexpected url: " + url);
    });

    const result = await OnlineLookup.fetchOnlineDefinition("wind down", { fetchImpl, isOnline: () => true });

    expect(result).not.toBeNull();
    expect(result.sourceName).toBe("Wiktionary");
    // Wiktionary's own result has no synonyms/antonyms, so the
    // syn/ant-enrichment tier fires too (a 3rd call).
    expect(fetchImpl).toHaveBeenCalledTimes(3);
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

describe("extractSynAntFromWikitext", () => {
  it("finds a Synonyms/Antonyms section nested at level 5 (=====), which happens when a word has more than one Etymology section", () => {
    // A word with multiple etymologies (Etymology 1, Etymology 2, ...)
    // pushes every one of its own subsections one level deeper than a
    // single-etymology entry: ==English==>===Etymology 1===>====Noun====>
    // =====Synonyms=====. A cap of {3,4} (the original range) would miss
    // this entirely — this is exactly the real-world shape "process" has,
    // even though "process" itself has no Synonyms section (see the
    // fixture-based test below using its actual live wikitext).
    const wikitext = [
      "==English==",
      "===Etymology 1===",
      "====Noun====",
      "=====Synonyms=====",
      "* [[gauge]]",
      "=====Antonyms=====",
      "* [[chaos]]"
    ].join("\n");
    const result = OnlineLookup.extractSynAntFromWikitext(wikitext);
    expect(result.syn).toEqual(["gauge"]);
    expect(result.ant).toEqual(["chaos"]);
  });

  it("returns empty (not a crash, not a false positive off 'Related terms') for a real word that genuinely has no Synonyms/Antonyms section on Wiktionary", () => {
    // Real wikitext for "process" fetched directly from
    // en.wiktionary.org by a user of this app (this sandbox's own network
    // access to that host is blocked) — it has a multi-etymology,
    // multi-heading-level structure with "Hyponyms", "Derived terms", and
    // "Related terms" sections, but no "Synonyms" or "Antonyms" heading
    // anywhere. This is a genuine content gap in the source data itself,
    // not a parsing bug — "Related terms" (proceed, procedure) is
    // deliberately NOT treated as if it were a Synonyms list, since
    // Wiktionary's own editors chose not to classify it that way.
    const wikitext = [
      "{{also|Process}}",
      "==English==",
      "===Etymology 1===",
      "====Noun====",
      "{{en-noun}}",
      "",
      "# A series of events leading to a result.",
      "",
      "=====Hyponyms=====",
      "{{col4|en|Hawkes process|Bergius process}}",
      "",
      "=====Derived terms=====",
      "{{col4|en|due process|process manufacturing}}",
      "",
      "=====Related terms=====",
      "* {{l|en|proceed}}",
      "* {{l|en|procedure}}",
      "",
      "=====Descendants=====",
      "* {{desc|ja|プロセス|tr=purosesu|bor=1}}",
      "",
      "====Verb====",
      "{{en-verb}}",
      "",
      "# To perform a particular process on a thing."
    ].join("\n");
    const result = OnlineLookup.extractSynAntFromWikitext(wikitext);
    expect(result).toEqual({ syn: [], ant: [] });
  });

  it("returns empty syn/ant for missing, non-string, or English-section-free wikitext", () => {
    expect(OnlineLookup.extractSynAntFromWikitext(null)).toEqual({ syn: [], ant: [] });
    expect(OnlineLookup.extractSynAntFromWikitext("")).toEqual({ syn: [], ant: [] });
    expect(OnlineLookup.extractSynAntFromWikitext("==French==\n===Synonyms===\n* [[rapide]]")).toEqual({ syn: [], ant: [] });
  });

  it("extracts terms out of a {{syn|en|...}}/{{ant|en|...}} template", () => {
    const wikitext = [
      "==English==",
      "===Adjective===",
      "===Synonyms===",
      "* {{syn|en|fast|quick|speedy}}",
      "===Antonyms===",
      "* {{ant|en|slow|sluggish}}"
    ].join("\n");
    const result = OnlineLookup.extractSynAntFromWikitext(wikitext);
    expect(result.syn).toEqual(["fast", "quick", "speedy"]);
    expect(result.ant).toEqual(["slow", "sluggish"]);
  });

  it("extracts terms out of plain [[wikilinks]], including a piped display form, but skips Thesaurus: links", () => {
    const wikitext = [
      "==English==",
      "===Noun===",
      "===Synonyms===",
      "* {{sense|to measure}} [[gauge]], [[assess|assessment]]",
      "* [[Thesaurus:process]]"
    ].join("\n");
    const result = OnlineLookup.extractSynAntFromWikitext(wikitext);
    expect(result.syn).toEqual(["gauge", "assess"]);
  });

  it("skips named template parameters (q1=, t1=, ...) — they're qualifiers, not terms", () => {
    const wikitext = [
      "==English==",
      "===Synonyms===",
      "* {{syn|en|gauge|q1=informal|assess}}"
    ].join("\n");
    const result = OnlineLookup.extractSynAntFromWikitext(wikitext);
    expect(result.syn).toEqual(["gauge", "assess"]);
  });

  it("drops tokens that don't look like a plausible plain word/phrase after cleanup", () => {
    const wikitext = [
      "==English==",
      "===Synonyms===",
      "* [[gauge#English|gauge]]",
      "* [[123]]"
    ].join("\n");
    const result = OnlineLookup.extractSynAntFromWikitext(wikitext);
    // "123" isn't a plausible word and is dropped; "gauge" (before the
    // "#English" anchor, stripped by the [^\]|#]+ link-target capture)
    // survives.
    expect(result.syn).toEqual(["gauge"]);
  });

  it("collects terms from more than one Synonyms section (one per part of speech/sense)", () => {
    const wikitext = [
      "==English==",
      "===Noun===",
      "===Synonyms===",
      "* [[procedure]]",
      "===Verb===",
      "===Synonyms===",
      "* [[proceed]]"
    ].join("\n");
    const result = OnlineLookup.extractSynAntFromWikitext(wikitext);
    expect(result.syn).toEqual(["procedure", "proceed"]);
  });

  it("only reads the English-language section, ignoring another language's Synonyms further down the page", () => {
    const wikitext = [
      "==English==",
      "===Synonyms===",
      "* [[gauge]]",
      "==French==",
      "===Synonyms===",
      "* [[rapide]]"
    ].join("\n");
    const result = OnlineLookup.extractSynAntFromWikitext(wikitext);
    expect(result.syn).toEqual(["gauge"]);
  });
});

describe("fetchOnlineDefinition — synonym/antonym wikitext enrichment", () => {
  it("does not fetch the wikitext enrichment tier at all when the primary result already has both synonyms and antonyms", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(SAMPLE_API_RESPONSE));
    await OnlineLookup.fetchOnlineDefinition("resilient", { fetchImpl, isOnline: () => true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fills in missing synonyms and antonyms from Wiktionary's wikitext when the Free Dictionary API had none", async () => {
    const fdaResponse = [{
      word: "process",
      meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A series of actions toward an end." }] }]
    }];
    const wikitext = [
      "==English==",
      "===Noun===",
      "===Synonyms===",
      "* [[procedure]], [[method]]",
      "===Antonyms===",
      "* [[chaos]]"
    ].join("\n");
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("process")) return jsonResponse(fdaResponse);
      if (url === OnlineLookup.buildWiktionaryWikitextUrl("process")) return jsonResponse({ parse: { wikitext } });
      throw new Error("unexpected url: " + url);
    });

    const result = await OnlineLookup.fetchOnlineDefinition("process", { fetchImpl, isOnline: () => true });

    expect(result.syn).toEqual(["procedure", "method"]);
    expect(result.ant).toEqual(["chaos"]);
    expect(result.sourceName).toBe("Free Dictionary API + Wiktionary");
    // Single-word query, Free Dictionary API succeeded: only 2 calls total
    // (the FDA lookup itself, plus the syn/ant enrichment fetch) — no
    // Wiktionary definition-merge call, since that tier is multi-word-only.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fills in only the missing side (e.g. antonyms) without touching synonyms the primary source already had", async () => {
    const fdaResponse = [{
      word: "nuisance",
      meanings: [{
        partOfSpeech: "noun",
        definitions: [{ definition: "A person or thing causing trouble.", synonyms: ["annoyance"] }]
      }]
    }];
    const wikitext = ["==English==", "===Antonyms===", "* [[blessing]]"].join("\n");
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("nuisance")) return jsonResponse(fdaResponse);
      if (url === OnlineLookup.buildWiktionaryWikitextUrl("nuisance")) return jsonResponse({ parse: { wikitext } });
      throw new Error("unexpected url: " + url);
    });

    const result = await OnlineLookup.fetchOnlineDefinition("nuisance", { fetchImpl, isOnline: () => true });

    expect(result.syn).toEqual(["annoyance"]);
    expect(result.ant).toEqual(["blessing"]);
  });

  it("leaves the result exactly as-is (no crash, no attribution change) when the wikitext fetch itself fails", async () => {
    const fdaResponse = [{
      word: "process",
      meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A series of actions toward an end." }] }]
    }];
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("process")) return jsonResponse(fdaResponse);
      if (url === OnlineLookup.buildWiktionaryWikitextUrl("process")) return Promise.reject(new Error("network down"));
      throw new Error("unexpected url: " + url);
    });

    const result = await OnlineLookup.fetchOnlineDefinition("process", { fetchImpl, isOnline: () => true });

    expect(result).not.toBeNull();
    expect(result.syn).toEqual([]);
    expect(result.ant).toEqual([]);
    expect(result.sourceName).toBe("Free Dictionary API");
  });

  it("leaves the result as-is when the wikitext has no Synonyms/Antonyms sections at all", async () => {
    const fdaResponse = [{
      word: "process",
      meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "A series of actions toward an end." }] }]
    }];
    const fetchImpl = vi.fn((url) => {
      if (url === OnlineLookup.buildRequestUrl("process")) return jsonResponse(fdaResponse);
      if (url === OnlineLookup.buildWiktionaryWikitextUrl("process")) {
        return jsonResponse({ parse: { wikitext: "==English==\n===Noun===\nA series of actions." } });
      }
      throw new Error("unexpected url: " + url);
    });

    const result = await OnlineLookup.fetchOnlineDefinition("process", { fetchImpl, isOnline: () => true });

    expect(result.syn).toEqual([]);
    expect(result.ant).toEqual([]);
    expect(result.sourceName).toBe("Free Dictionary API");
  });
});
