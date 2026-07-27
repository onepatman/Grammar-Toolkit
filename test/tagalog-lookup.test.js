// Unit tests for js/tagalog-lookup.js — the Filipino/Tagalog translation
// fallback (MyMemory API). Network access is always mocked; these never
// make a real HTTP request. Mirrors test/online-lookup.test.js's shape
// and design rules on purpose, since this module is built to match.
import { describe, it, expect, vi } from "vitest";
import TagalogLookup from "../js/tagalog-lookup.js";

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

const PRESS_RESPONSE = {
  responseData: { translatedText: "pindutin", match: 0.85 },
  responseDetails: "",
  matches: [
    { translation: "pindutin", match: "0.85" },
    { translation: "idiin", match: "0.72" },
    { translation: "pindutin", match: "0.6" }, // duplicate, should be deduped
    { translation: "somelowqualityguess", match: "0.2" } // below threshold, excluded
  ]
};

describe("extractCandidates", () => {
  it("collects distinct, high-confidence translations, top pick first, low-quality ones excluded", () => {
    const candidates = TagalogLookup.extractCandidates(PRESS_RESPONSE, "press");
    expect(candidates).toEqual(["pindutin", "idiin"]);
  });

  it("never echoes the query itself back as a translation", () => {
    const echoResponse = {
      responseData: { translatedText: "press", match: 1 },
      matches: [{ translation: "press", match: "1" }]
    };
    expect(TagalogLookup.extractCandidates(echoResponse, "press")).toEqual([]);
  });

  it("returns an empty array for a malformed/empty response", () => {
    expect(TagalogLookup.extractCandidates(null, "press")).toEqual([]);
    expect(TagalogLookup.extractCandidates({}, "press")).toEqual([]);
    expect(TagalogLookup.extractCandidates({ responseData: {} }, "press")).toEqual([]);
  });
});

describe("extractMatchConfidence", () => {
  it("returns the highest score among candidates that actually passed the quality filter", () => {
    expect(TagalogLookup.extractMatchConfidence(PRESS_RESPONSE, "press")).toBe(0.85);
  });

  it("ignores the low-quality/echoed candidates that extractCandidates also excludes", () => {
    const echoResponse = {
      responseData: { translatedText: "press", match: 1 },
      matches: [{ translation: "press", match: "1" }, { translation: "pindutin", match: "0.6" }]
    };
    expect(TagalogLookup.extractMatchConfidence(echoResponse, "press")).toBe(0.6);
  });

  it("returns 0 for a malformed/empty response", () => {
    expect(TagalogLookup.extractMatchConfidence(null, "press")).toBe(0);
    expect(TagalogLookup.extractMatchConfidence({}, "press")).toBe(0);
  });
});

describe("fetchTagalogTranslation (English -> Filipino)", () => {
  it("returns joined candidates and the raw candidate list on a reliable match", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(PRESS_RESPONSE));
    const result = await TagalogLookup.fetchTagalogTranslation("press", { fetchImpl, isOnline: () => true });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("langpair=en%7Ctl"),
      expect.any(Object)
    );
    expect(result).toEqual({
      text: "pindutin; idiin",
      candidates: ["pindutin", "idiin"],
      confidence: 0.85,
      lowConfidence: false
    });
  });

  it("never attempts a request while offline", async () => {
    const fetchImpl = vi.fn();
    const result = await TagalogLookup.fetchTagalogTranslation("press", { fetchImpl, isOnline: () => false });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves null (never throws) on a network failure", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("network down")));
    const result = await TagalogLookup.fetchTagalogTranslation("press", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
  });

  it("resolves null for an HTTP error response", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({}, false));
    const result = await TagalogLookup.fetchTagalogTranslation("press", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
  });

  it("resolves null for an empty/whitespace word without attempting a request", async () => {
    const fetchImpl = vi.fn();
    const result = await TagalogLookup.fetchTagalogTranslation("   ", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("flags lowConfidence:true for a translation that passed the hard cutoff but isn't a solid match", async () => {
    // This is the gap a real-word mistranslation (like "juggle" ->
    // "Salamangka") could hide in: MyMemory returned genuine, non-empty
    // Filipino text, just not confidently enough to trust outright.
    const shakyResponse = {
      responseData: { translatedText: "malabo", match: 0.6 },
      matches: [{ translation: "malabo", match: "0.6" }]
    };
    const fetchImpl = vi.fn(() => jsonResponse(shakyResponse));
    const result = await TagalogLookup.fetchTagalogTranslation("vague", { fetchImpl, isOnline: () => true });
    expect(result.confidence).toBe(0.6);
    expect(result.lowConfidence).toBe(true);
  });

  it("flags lowConfidence:false for a solidly high-quality match", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(PRESS_RESPONSE));
    const result = await TagalogLookup.fetchTagalogTranslation("press", { fetchImpl, isOnline: () => true });
    expect(result.confidence).toBe(0.85);
    expect(result.lowConfidence).toBe(false);
  });

  it("treats a low-confidence-only match as no reliable translation, never inventing one", async () => {
    const weakResponse = {
      responseData: { translatedText: "maybe-this", match: 0.2 },
      matches: [{ translation: "maybe-this", match: "0.2" }]
    };
    const fetchImpl = vi.fn(() => jsonResponse(weakResponse));
    const result = await TagalogLookup.fetchTagalogTranslation("obscureword", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
  });

  it("treats an anonymous-quota warning response as no reliable translation, not a real result", async () => {
    const warningResponse = {
      responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS", match: 0 },
      responseDetails: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY",
      matches: []
    };
    const fetchImpl = vi.fn(() => jsonResponse(warningResponse));
    const result = await TagalogLookup.fetchTagalogTranslation("press", { fetchImpl, isOnline: () => true });
    expect(result).toBeNull();
  });

  it("caches a result per direction+word, never re-fetching a already-answered query (case-insensitive)", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(PRESS_RESPONSE));
    const cache = TagalogLookup.createMemoryCache();
    await TagalogLookup.fetchTagalogTranslation("press", { fetchImpl, isOnline: () => true, cache });
    await TagalogLookup.fetchTagalogTranslation("Press", { fetchImpl, isOnline: () => true, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("also caches a null (no reliable translation) result, so a known-empty word isn't re-queried every render", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({ responseData: {}, matches: [] }));
    const cache = TagalogLookup.createMemoryCache();
    await TagalogLookup.fetchTagalogTranslation("zzznotaword", { fetchImpl, isOnline: () => true, cache });
    await TagalogLookup.fetchTagalogTranslation("zzznotaword", { fetchImpl, isOnline: () => true, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("fetchEnglishTranslation (Filipino -> English)", () => {
  it("uses the reverse language pair", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({
      responseData: { translatedText: "press", match: 0.9 },
      matches: [{ translation: "press", match: "0.9" }]
    }));
    const result = await TagalogLookup.fetchEnglishTranslation("pindutin", { fetchImpl, isOnline: () => true });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("langpair=tl%7Cen"),
      expect.any(Object)
    );
    expect(result.candidates).toEqual(["press"]);
  });

  it("uses a separate cache namespace from the English->Filipino direction (same word, different langpair)", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ responseData: { translatedText: "pindutin", match: 0.9 }, matches: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ responseData: { translatedText: "press", match: 0.9 }, matches: [] }) });
    const cache = TagalogLookup.createMemoryCache();
    const enToTl = await TagalogLookup.fetchTagalogTranslation("press", { fetchImpl, isOnline: () => true, cache });
    // Cache is keyed by langpair+word, so looking up "pindutin" (tl->en)
    // is a distinct cache slot from "press" (en->tl) even though the
    // mocked response text happens to be "press" either way.
    const tlToEn = await TagalogLookup.fetchEnglishTranslation("pindutin", { fetchImpl, isOnline: () => true, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(enToTl.candidates).toEqual(["pindutin"]);
    expect(tlToEn.candidates).toEqual(["press"]);
  });
});
