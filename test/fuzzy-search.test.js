import { describe, it, expect } from "vitest";
import FuzzySearch from "../js/fuzzy-search.js";

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(FuzzySearch.levenshteinDistance("receive", "receive")).toBe(0);
  });

  it("counts a single substitution as 1", () => {
    expect(FuzzySearch.levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("counts a single insertion/deletion as 1", () => {
    expect(FuzzySearch.levenshteinDistance("cat", "cats")).toBe(1);
    expect(FuzzySearch.levenshteinDistance("cats", "cat")).toBe(1);
  });

  it("handles a classic transposition-style misspelling", () => {
    // "recieve" vs "receive" — two substitutions apart under plain Levenshtein.
    expect(FuzzySearch.levenshteinDistance("recieve", "receive")).toBe(2);
  });

  it("treats empty strings as the length of the other string", () => {
    expect(FuzzySearch.levenshteinDistance("", "abc")).toBe(3);
    expect(FuzzySearch.levenshteinDistance("abc", "")).toBe(3);
  });
});

describe("findClosestMatches", () => {
  const items = [
    { label: "receive" },
    { label: "resign" },
    { label: "listen to" },
    { label: "apprehend" },
    { label: "completely unrelated phrase" }
  ];

  it("finds a close misspelling", () => {
    const result = FuzzySearch.findClosestMatches("recieve", items, { getLabel: (i) => i.label });
    expect(result.map((r) => r.label)).toContain("receive");
  });

  it("matches an individual word inside a multi-word label", () => {
    const result = FuzzySearch.findClosestMatches("listn", items, { getLabel: (i) => i.label });
    expect(result.map((r) => r.label)).toContain("listen to");
  });

  it("excludes an exact match (that's the normal search path's job, not this one)", () => {
    const result = FuzzySearch.findClosestMatches("receive", items, { getLabel: (i) => i.label });
    expect(result.map((r) => r.label)).not.toContain("receive");
  });

  it("returns nothing for a query with no close candidates", () => {
    const result = FuzzySearch.findClosestMatches("xqzwjk", items, { getLabel: (i) => i.label });
    expect(result).toEqual([]);
  });

  it("returns an empty array for a blank query", () => {
    expect(FuzzySearch.findClosestMatches("   ", items, { getLabel: (i) => i.label })).toEqual([]);
  });

  it("respects the limit option", () => {
    const manyItems = ["cat", "bat", "rat", "hat", "mat", "sat"].map((label) => ({ label }));
    const result = FuzzySearch.findClosestMatches("cat", manyItems, { getLabel: (i) => i.label, limit: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("sorts closer matches first", () => {
    const result = FuzzySearch.findClosestMatches(
      "aprehend", // one edit from "apprehend"
      items,
      { getLabel: (i) => i.label, maxDistance: 5 }
    );
    expect(result[0].label).toBe("apprehend");
  });
});
