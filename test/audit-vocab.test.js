// Tests for the dictionary-accuracy audit tooling (scripts/extract-vocab-data.js,
// scripts/audit-vocab.js) — a read-only reporting tool, never modifies
// vocabData. These tests lock in each heuristic's precision (they exist
// specifically because earlier drafts of these checks had real false-
// positive problems: irregular verbs like "became"/"bought"/"chose" were
// wrongly flagged as not matching their headword, and a real hand-authored
// sentence "The system responded to the rapid pressure change." was
// wrongly flagged as machine-generated filler).
import { describe, it, expect } from "vitest";
import { extractVocabData } from "../scripts/extract-vocab-data.js";
import {
  auditAll,
  isFillerExample,
  isVagueDefinition,
  isTerseGloss,
  looksUntranslated,
  exampleContainsHeadword,
  hasUnderdemonstratedBundledSense,
  findHeadwordCollision
} from "../scripts/audit-vocab.js";

describe("extractVocabData", () => {
  it("extracts the real vocabData array from index.html as valid, parsed objects", () => {
    const data = extractVocabData();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(700);
    expect(data[0]).toHaveProperty("w");
    expect(data[0]).toHaveProperty("senses");
    expect(data[0]).toHaveProperty("tagalog");
  });

  it("does not include 'juggle' — confirms it is not part of the built-in dictionary data", () => {
    const data = extractVocabData();
    expect(data.some((e) => e.w.toLowerCase() === "juggle")).toBe(false);
  });
});

describe("exampleContainsHeadword — inflection matching", () => {
  it("matches regular inflections", () => {
    expect(exampleContainsHeadword("They abandoned the site.", "abandon")).toBe(true);
    expect(exampleContainsHeadword("She is running late.", "run")).toBe(true);
  });

  it("matches irregular verb forms (past tense/participle not covered by suffix rules)", () => {
    expect(exampleContainsHeadword("He applied for the permit.", "apply")).toBe(true);
    expect(exampleContainsHeadword("The rule became stricter.", "become")).toBe(true);
    expect(exampleContainsHeadword("They broke the seal.", "break")).toBe(true);
    expect(exampleContainsHeadword("We bought new parts.", "buy")).toBe(true);
    expect(exampleContainsHeadword("He chose the smaller pump.", "choose")).toBe(true);
    expect(exampleContainsHeadword("They built the extension.", "build")).toBe(true);
  });

  it("matches consonant+y -> ied/ies inflections", () => {
    expect(exampleContainsHeadword("He denied the claim.", "deny")).toBe(true);
    expect(exampleContainsHeadword("He tried on the vest.", "try on")).toBe(true);
  });

  it("returns false when no recognizable form of the headword is present (a genuine mismatch)", () => {
    expect(exampleContainsHeadword("The panel will critique the proposed design.", "review")).toBe(false);
    expect(exampleContainsHeadword("Workers perceived the risk too late.", "discern")).toBe(false);
  });
});

describe("isFillerExample — machine-template detection", () => {
  it("matches the app's real fallback example templates (js/online-lookup.js FALLBACK_EXAMPLE_TEMPLATES)", () => {
    expect(isFillerExample("The system responded quickly.")).toBe(true);
    expect(isFillerExample("The system responded <b>quickly</b>.")).toBe(true);
    expect(isFillerExample("Understanding torque is useful in this context.")).toBe(true);
    expect(isFillerExample('"resilience" is a word commonly used in everyday English.')).toBe(true);
    expect(isFillerExample("Everyone agreed the plan was solid.")).toBe(true);
  });

  it("does NOT flag a real, hand-authored sentence that merely shares some wording with a template", () => {
    // Regression case: this genuine sentence was a false positive before
    // the filler-pattern regexes were anchored to a single-word slot.
    expect(isFillerExample("The system responded to the rapid pressure change.")).toBe(false);
    expect(isFillerExample("They had to abandon the original design after the test failed.")).toBe(false);
  });
});

describe("isVagueDefinition / isTerseGloss — distinct severities", () => {
  it("isVagueDefinition flags empty or genuinely vague text", () => {
    expect(isVagueDefinition("")).toBe(true);
    expect(isVagueDefinition("a thing")).toBe(true);
    expect(isVagueDefinition("something related to stuff")).toBe(true);
  });

  it("isVagueDefinition does NOT flag an accurate, terse gloss", () => {
    expect(isVagueDefinition("To cancel.")).toBe(false);
  });

  it("isTerseGloss flags a short-but-accurate gloss without calling it vague", () => {
    expect(isTerseGloss("To cancel.")).toBe(true);
    expect(isTerseGloss("Beside something.")).toBe(true);
    expect(isTerseGloss("To give up or stop doing something, often before finishing.")).toBe(false);
  });
});

describe("looksUntranslated — Tagalog field red flags", () => {
  it("flags a missing or English-identical translation", () => {
    expect(looksUntranslated(null, "simple")).toBe(true);
    expect(looksUntranslated("simple", "simple")).toBe(true);
    expect(looksUntranslated("Simple", "simple")).toBe(true);
  });

  it("does NOT flag a genuine Filipino translation, even a short one", () => {
    expect(looksUntranslated("iwan / talikuran", "abandon")).toBe(false);
    expect(looksUntranslated("mali", "incorrect")).toBe(false);
  });

  it("does NOT claim to catch a real-word mistranslation (e.g. juggle -> Salamangka) — only structural absence", () => {
    // "Salamangka" (Filipino for "magic") is genuine, non-empty Filipino
    // text — this heuristic layer cannot and does not detect that it's
    // semantically wrong for "juggle". Documented limitation, not a bug.
    expect(looksUntranslated("Salamangka", "juggle")).toBe(false);
  });
});

describe("hasUnderdemonstratedBundledSense", () => {
  it("flags a comma-or bundled definition with fewer than 2 examples", () => {
    expect(hasUnderdemonstratedBundledSense({
      use: "To shut something, or to be near in distance.",
      examples: ["Close the valve before disconnecting the hose."]
    })).toBe(true);
  });

  it("does not flag a bundled definition that already has 2+ examples", () => {
    expect(hasUnderdemonstratedBundledSense({
      use: "To use something up completely, or to make very tired.",
      examples: ["The generator exhausted its fuel overnight.", "The long shift exhausted the whole crew."]
    })).toBe(false);
  });

  it("does not flag a single unified sense that merely contains 'or' joining two near-synonyms", () => {
    expect(hasUnderdemonstratedBundledSense({
      use: "To lead or direct someone.",
      examples: ["He guided the new hires."]
    })).toBe(false);
  });
});

describe("findHeadwordCollision", () => {
  it("flags a single-word headword's example that actually demonstrates a separate multi-word headword", () => {
    const multiWordHeadwords = new Set(["move on", "go over"]);
    expect(findHeadwordCollision("Let's move on to the next agenda item.", "move", multiWordHeadwords)).toBe("move on");
  });

  it("returns null when the example genuinely demonstrates the plain headword", () => {
    const multiWordHeadwords = new Set(["move on"]);
    expect(findHeadwordCollision("They moved the equipment to a covered area.", "move", multiWordHeadwords)).toBeNull();
  });

  it("ignores multi-word headwords entirely (only single-word headwords can collide)", () => {
    const multiWordHeadwords = new Set(["move on"]);
    expect(findHeadwordCollision("Let's move on.", "move on", multiWordHeadwords)).toBeNull();
  });
});

describe("auditAll — end-to-end run against the real vocabData", () => {
  it("runs cleanly over all 795 entries and returns a well-formed report", () => {
    const report = auditAll();
    expect(report.totalEntries).toBeGreaterThan(700);
    expect(report.flaggedCount).toBeGreaterThan(0);
    expect(report.flaggedCount).toBeLessThan(report.totalEntries);
    expect(report.results).toHaveLength(report.totalEntries);
  });

  it("assigns 'needs_semantic_review' to entries that pass every heuristic check (never claims full verification)", () => {
    const report = auditAll();
    const clean = report.results.find((r) => r.flagCount === 0);
    expect(clean).toBeTruthy();
    expect(clean.source).toBe("needs_semantic_review");
  });

  it("assigns 'flagged_by_heuristic_audit' to entries with at least one flag", () => {
    const report = auditAll();
    const flagged = report.results.find((r) => r.flagCount > 0);
    expect(flagged).toBeTruthy();
    expect(flagged.source).toBe("flagged_by_heuristic_audit");
  });

  it("real known-issue entries from the manual review are flagged", () => {
    const report = auditAll();
    const byWord = Object.fromEntries(report.results.map((r) => [r.w, r]));
    expect(byWord["discern"].flagCount).toBeGreaterThan(0);
    expect(byWord["simple"].flagCount).toBeGreaterThan(0);
    expect(byWord["accelerate"].flags.some((f) => f.type === "bundled_sense_underdemonstrated")).toBe(true);
    expect(byWord["move"].flags.some((f) => f.type === "example_may_demonstrate_different_headword")).toBe(true);
  });

  it("known limitation: 'close' bundles two senses into one example-covered slot, but has 2 examples on the SAME sense — the fewer-than-2-examples proxy can't catch this, documenting why the bundled-sense check is a proxy, not proof", () => {
    const report = auditAll();
    const close = report.results.find((r) => r.w === "close");
    expect(close.flags.some((f) => f.type === "bundled_sense_underdemonstrated")).toBe(false);
  });
});
