// Unit tests for js/grammar-check.js — the LanguageTool-backed grammar
// checker behind the Journal tab. Network access is always mocked; these
// never make a real HTTP request.
import { describe, it, expect, vi } from "vitest";
import GrammarCheck from "../js/grammar-check.js";

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

const SAMPLE_LT_RESPONSE = {
  matches: [
    {
      message: "This sentence does not start with an uppercase letter.",
      shortMessage: "",
      offset: 0,
      length: 2,
      replacements: [{ value: "He" }],
      rule: { description: "Uppercase sentence start" }
    },
    {
      message: "Did you mean 'goes'?",
      shortMessage: "Subject-verb agreement",
      offset: 3,
      length: 2,
      replacements: [{ value: "goes" }],
      rule: { description: "Subject-verb agreement" }
    }
  ]
};

describe("GrammarCheck.normalizeResponse", () => {
  it("maps LanguageTool matches into {wrong, right, why} using the original text's own offsets", () => {
    const result = GrammarCheck.normalizeResponse(SAMPLE_LT_RESPONSE, "he go to the site");
    expect(result.ok).toBe(true);
    expect(result.corrections).toEqual([
      { wrong: "he", right: "He", why: "This sentence does not start with an uppercase letter." },
      { wrong: "go", right: "goes", why: "Did you mean 'goes'?" }
    ]);
  });

  it("falls back to the rule description when a match has no message", () => {
    const result = GrammarCheck.normalizeResponse(
      { matches: [{ offset: 0, length: 2, replacements: [{ value: "He" }], rule: { description: "Fallback reason" } }] },
      "he go"
    );
    expect(result.corrections[0].why).toBe("Fallback reason");
  });

  it("falls back to a generic explanation when neither message nor rule description exists", () => {
    const result = GrammarCheck.normalizeResponse(
      { matches: [{ offset: 0, length: 2, replacements: [{ value: "He" }] }] },
      "he go"
    );
    expect(result.corrections[0].why).toBe("This may be a grammar or spelling issue.");
  });

  it("drops a match that has no usable replacement text but keeps the wrong span and why", () => {
    const result = GrammarCheck.normalizeResponse(
      { matches: [{ message: "Possible issue.", offset: 0, length: 2, replacements: [] }] },
      "he go"
    );
    expect(result.corrections[0]).toEqual({ wrong: "he", right: "", why: "Possible issue." });
  });

  it("handles zero matches as a perfect score with an empty corrections list", () => {
    const result = GrammarCheck.normalizeResponse({ matches: [] }, "This is a perfectly written sentence.");
    expect(result.corrections).toEqual([]);
    expect(result.score).toBe(10);
    expect(result.grade.tier).toBe("excellent");
  });
});

describe("GrammarCheck.scoreFromDensity", () => {
  it("scores empty text as a perfect 10", () => {
    expect(GrammarCheck.scoreFromDensity(0, 0)).toBe(10);
  });

  it("scores zero errors as a perfect 10 regardless of length", () => {
    expect(GrammarCheck.scoreFromDensity(200, 0)).toBe(10);
  });

  it("penalizes a short, error-dense text more than a long text with the same error count", () => {
    const shortTextScore = GrammarCheck.scoreFromDensity(10, 3);
    const longTextScore = GrammarCheck.scoreFromDensity(200, 3);
    expect(shortTextScore).toBeLessThan(longTextScore);
  });

  it("never returns a score below 0 even with very high error density", () => {
    expect(GrammarCheck.scoreFromDensity(5, 50)).toBe(0);
  });
});

describe("GrammarCheck.gradeLabel", () => {
  it("tiers scores into excellent / good / fair / needs-practice bands", () => {
    expect(GrammarCheck.gradeLabel(10).tier).toBe("excellent");
    expect(GrammarCheck.gradeLabel(9).tier).toBe("excellent");
    expect(GrammarCheck.gradeLabel(8.9).tier).toBe("good");
    expect(GrammarCheck.gradeLabel(7).tier).toBe("good");
    expect(GrammarCheck.gradeLabel(6.9).tier).toBe("fair");
    expect(GrammarCheck.gradeLabel(5).tier).toBe("fair");
    expect(GrammarCheck.gradeLabel(4.9).tier).toBe("needs-practice");
    expect(GrammarCheck.gradeLabel(0).tier).toBe("needs-practice");
  });
});

describe("GrammarCheck.countWords", () => {
  it("counts words separated by any whitespace", () => {
    expect(GrammarCheck.countWords("He   go\nto the site.")).toBe(5);
  });

  it("counts empty/blank text as zero words", () => {
    expect(GrammarCheck.countWords("")).toBe(0);
    expect(GrammarCheck.countWords("   ")).toBe(0);
    expect(GrammarCheck.countWords(undefined)).toBe(0);
  });
});

describe("GrammarCheck.checkText", () => {
  it("resolves ok:false with reason 'empty' for blank text, without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await GrammarCheck.checkText("   ", { fetchImpl, isOnline: true });
    expect(result).toEqual({ ok: false, reason: "empty" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves ok:false with reason 'offline' when isOnline is false, without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await GrammarCheck.checkText("He go to the site.", { fetchImpl, isOnline: false });
    expect(result).toEqual({ ok: false, reason: "offline" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs the trimmed text as a form-encoded body to the LanguageTool endpoint", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({ matches: [] }));
    await GrammarCheck.checkText("  He go to the site.  ", { fetchImpl, isOnline: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      GrammarCheck.API_URL,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "text=" + encodeURIComponent("He go to the site.") + "&language=en-US&level=picky"
      })
    );
  });

  it("defaults to LanguageTool's 'picky' level (catches wordiness/style, not just hard grammar errors), overridable via opts.level", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({ matches: [] }));
    await GrammarCheck.checkText("Some text.", { fetchImpl, isOnline: true, level: "default" });
    expect(fetchImpl.mock.calls[0][1].body).toContain("level=default");

    fetchImpl.mockClear();
    await GrammarCheck.checkText("Some text.", { fetchImpl, isOnline: true });
    expect(fetchImpl.mock.calls[0][1].body).toContain("level=picky");
  });

  it("resolves a full graded result on a successful response", async () => {
    const fetchImpl = vi.fn(() => jsonResponse(SAMPLE_LT_RESPONSE));
    const result = await GrammarCheck.checkText("he go to the site", { fetchImpl, isOnline: true });
    expect(result.ok).toBe(true);
    expect(result.corrections).toHaveLength(2);
    expect(result.wordCount).toBe(5);
    expect(result.errorCount).toBe(2);
    expect(typeof result.score).toBe("number");
  });

  it("resolves ok:false with reason 'http-error' on a non-OK HTTP response", async () => {
    const fetchImpl = vi.fn(() => jsonResponse({}, false));
    const result = await GrammarCheck.checkText("He go to the site.", { fetchImpl, isOnline: true });
    expect(result).toEqual({ ok: false, reason: "http-error" });
  });

  it("resolves ok:false with reason 'network-error' (never throws/rejects) on a fetch failure", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("network down")));
    const result = await GrammarCheck.checkText("He go to the site.", { fetchImpl, isOnline: true });
    expect(result).toEqual({ ok: false, reason: "network-error" });
  });

  it("resolves ok:false with reason 'no-fetch' when no fetch implementation is available", async () => {
    vi.stubGlobal("fetch", undefined);
    try {
      const result = await GrammarCheck.checkText("He go to the site.", { isOnline: true });
      expect(result).toEqual({ ok: false, reason: "no-fetch" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
