// Unit tests for js/duplicate-checker.js — the DuplicateChecker service
// (Phase 1 architecture-plan slice 2). Formalizes the case/whitespace-
// insensitive matching rule this app already enforced (index.html's own
// normalizeWordKey()/normalizeForDuplicateCheck()) as one named,
// independently-testable service.
import { describe, it, expect } from "vitest";
import DuplicateChecker from "../js/duplicate-checker.js";

describe("normalizeKey", () => {
  it("treats different casings of the same word as identical", () => {
    expect(DuplicateChecker.normalizeKey("Run")).toBe(DuplicateChecker.normalizeKey("run"));
    expect(DuplicateChecker.normalizeKey("RUN")).toBe(DuplicateChecker.normalizeKey("run"));
  });

  it("trims leading/trailing whitespace", () => {
    expect(DuplicateChecker.normalizeKey("  run  ")).toBe("run");
  });

  it("collapses internal whitespace runs", () => {
    expect(DuplicateChecker.normalizeKey("give   up")).toBe("give up");
  });

  it("treats null/undefined as an empty string, never throws", () => {
    expect(DuplicateChecker.normalizeKey(null)).toBe("");
    expect(DuplicateChecker.normalizeKey(undefined)).toBe("");
  });
});

describe("normalizeForFuzzyMatch", () => {
  it("does everything normalizeKey does, plus strips trailing sentence punctuation", () => {
    expect(DuplicateChecker.normalizeForFuzzyMatch("Let me know.")).toBe("let me know");
    expect(DuplicateChecker.normalizeForFuzzyMatch("Let me know")).toBe("let me know");
    expect(DuplicateChecker.normalizeForFuzzyMatch("Really?!")).toBe("really");
  });

  it("only strips a TRAILING run of punctuation, not punctuation elsewhere in the text", () => {
    expect(DuplicateChecker.normalizeForFuzzyMatch("Wait... really?")).toBe("wait... really");
  });
});

describe("isMatch", () => {
  it("defaults to the strict key rule", () => {
    expect(DuplicateChecker.isMatch("Run", "run")).toBe(true);
    expect(DuplicateChecker.isMatch("Let me know.", "Let me know")).toBe(false);
  });

  it("uses the fuzzy rule when mode:'fuzzy' is passed", () => {
    expect(DuplicateChecker.isMatch("Let me know.", "Let me know", "fuzzy")).toBe(true);
  });

  it("returns false for genuinely different text under either rule", () => {
    expect(DuplicateChecker.isMatch("run", "walk")).toBe(false);
    expect(DuplicateChecker.isMatch("run", "walk", "fuzzy")).toBe(false);
  });
});

describe("findByKey", () => {
  const items = [
    { w: "Run", meaning: "to move fast" },
    { w: "walk", meaning: "to move slowly" }
  ];

  it("finds an item by a case/whitespace-insensitive key match", () => {
    expect(DuplicateChecker.findByKey(items, (i) => i.w, "RUN")).toBe(items[0]);
    expect(DuplicateChecker.findByKey(items, (i) => i.w, "  walk  ")).toBe(items[1]);
  });

  it("returns undefined when nothing matches", () => {
    expect(DuplicateChecker.findByKey(items, (i) => i.w, "jump")).toBeUndefined();
  });

  it("returns undefined (never throws) for an empty or missing array", () => {
    expect(DuplicateChecker.findByKey([], (i) => i.w, "run")).toBeUndefined();
    expect(DuplicateChecker.findByKey(undefined, (i) => i.w, "run")).toBeUndefined();
  });

  it("supports the fuzzy mode for sentence-shaped keys", () => {
    const sentences = [{ w: "Let me know if that works." }];
    expect(DuplicateChecker.findByKey(sentences, (i) => i.w, "let me know if that works", "fuzzy")).toBe(sentences[0]);
    expect(DuplicateChecker.findByKey(sentences, (i) => i.w, "let me know if that works")).toBeUndefined();
  });
});
