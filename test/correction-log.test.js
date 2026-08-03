// Unit tests for js/correction-log.js in isolation — no jsdom/index.html
// load needed, since this module has no DOM dependency by design.
import { describe, it, expect, beforeEach } from "vitest";
import CorrectionLog from "../js/correction-log.js";

// A minimal in-memory Storage stand-in (same shape as window.localStorage).
function createFakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}

describe("loadPersonalCorrections / savePersonalCorrections", () => {
  let storage;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("returns an empty array when nothing has been saved yet", () => {
    expect(CorrectionLog.loadPersonalCorrections(storage)).toEqual([]);
  });

  it("round-trips a saved list", () => {
    const entries = [{ id: "pc_1", wrong: "I go yesterday", right: "I went yesterday", why: "past tense" }];
    expect(CorrectionLog.savePersonalCorrections(entries, storage)).toBe(true);
    expect(CorrectionLog.loadPersonalCorrections(storage)).toEqual(entries);
  });

  it("falls back to an empty array when stored JSON is corrupt", () => {
    storage.setItem(CorrectionLog.CORRECTION_LOG_KEY, "{not valid json");
    expect(CorrectionLog.loadPersonalCorrections(storage)).toEqual([]);
  });

  it("returns false from save (instead of throwing) when storage is unavailable", () => {
    const throwingStorage = {
      getItem: () => null,
      setItem: () => { throw new Error("quota exceeded"); }
    };
    expect(CorrectionLog.savePersonalCorrections([{ id: "pc_1" }], throwingStorage)).toBe(false);
  });

  it("returns an empty array (not a throw) when storage.getItem itself throws", () => {
    const throwingStorage = {
      getItem: () => { throw new Error("blocked"); }
    };
    expect(CorrectionLog.loadPersonalCorrections(throwingStorage)).toEqual([]);
  });
});

describe("personalEntryToSense", () => {
  it("shapes a correction entry into a renderable sense", () => {
    const sense = CorrectionLog.personalEntryToSense({
      id: "pc_42",
      wrong: "He don't like it",
      right: "He doesn't like it",
      why: "third-person singular needs 'doesn't'"
    });
    expect(sense).toEqual({
      use: "third-person singular needs 'doesn't'",
      examples: ["✗ He don't like it → ✓ <b>He doesn't like it</b>"],
      personal: true,
      id: "pc_42"
    });
  });

  it("falls back to a default explanation when 'why' is blank", () => {
    const sense = CorrectionLog.personalEntryToSense({ id: "pc_1", wrong: "a", right: "b", why: "" });
    expect(sense.use).toBe("Personal correction — added by you.");
  });

  it("shapes a group of examples into ONE sense with multiple numbered examples, like a built-in rule", () => {
    const sense = CorrectionLog.personalEntryToSense({
      id: "pc_7",
      why: "subject-verb agreement in the present tense",
      examples: [
        { wrong: "He go to the site", right: "He goes to the site" },
        { wrong: "She have a car", right: "She has a car" },
        { wrong: "It don't work", right: "It doesn't work" }
      ]
    });
    expect(sense).toEqual({
      use: "subject-verb agreement in the present tense",
      examples: [
        "✗ He go to the site → ✓ <b>He goes to the site</b>",
        "✗ She have a car → ✓ <b>She has a car</b>",
        "✗ It don't work → ✓ <b>It doesn't work</b>"
      ],
      personal: true,
      id: "pc_7"
    });
  });

  it("still falls back to the old single wrong/right shape when entry.examples is absent — pre-existing saved data", () => {
    const sense = CorrectionLog.personalEntryToSense({
      id: "pc_old",
      wrong: "He don't like it",
      right: "He doesn't like it",
      why: "old-format entry, no examples array"
    });
    expect(sense.examples).toEqual(["✗ He don't like it → ✓ <b>He doesn't like it</b>"]);
  });

  it("falls back to the old single-pair shape when entry.examples is an empty array", () => {
    const sense = CorrectionLog.personalEntryToSense({
      id: "pc_empty",
      wrong: "a", right: "b", why: "why",
      examples: []
    });
    expect(sense.examples).toEqual(["✗ a → ✓ <b>b</b>"]);
  });
});

describe("buildCorrectionSenses", () => {
  it("appends saved entries after the built-in senses, in order", () => {
    const builtins = [{ use: "builtin 1", examples: ["ex"] }];
    const saved = [
      { id: "pc_1", wrong: "a", right: "b", why: "why1" },
      { id: "pc_2", wrong: "c", right: "d", why: "why2" }
    ];
    const result = CorrectionLog.buildCorrectionSenses(builtins, saved);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(builtins[0]);
    expect(result[1].id).toBe("pc_1");
    expect(result[2].id).toBe("pc_2");
  });

  it("returns just the built-ins, unmodified, when nothing is saved", () => {
    const builtins = [{ use: "builtin 1", examples: ["ex"] }];
    expect(CorrectionLog.buildCorrectionSenses(builtins, [])).toEqual(builtins);
    expect(CorrectionLog.buildCorrectionSenses(builtins, undefined)).toEqual(builtins);
  });

  it("never mutates the built-in senses array it was given", () => {
    const builtins = [{ use: "builtin 1", examples: ["ex"] }];
    const before = builtins.slice();
    CorrectionLog.buildCorrectionSenses(builtins, [{ id: "pc_1", wrong: "a", right: "b" }]);
    expect(builtins).toEqual(before);
  });
});

describe("groupCorrectionsByCategory", () => {
  it("buckets entries by their category field", () => {
    const saved = [
      { id: "pc_1", wrong: "a", right: "b", category: "subject-verb agreement" },
      { id: "pc_2", wrong: "c", right: "d", category: "subject-verb agreement" },
      { id: "pc_3", wrong: "e", right: "f", category: "articles" }
    ];
    const grouped = CorrectionLog.groupCorrectionsByCategory(saved, "my correction log (personal history)");
    expect(grouped["subject-verb agreement"]).toHaveLength(2);
    expect(grouped["subject-verb agreement"].map((e) => e.id)).toEqual(["pc_1", "pc_2"]);
    expect(grouped["articles"]).toHaveLength(1);
    expect(grouped["my correction log (personal history)"]).toBeUndefined();
  });

  it("falls back to defaultCategory for an entry with no category — old entries predating per-category filing", () => {
    const saved = [{ id: "pc_1", wrong: "a", right: "b" }];
    const grouped = CorrectionLog.groupCorrectionsByCategory(saved, "my correction log (personal history)");
    expect(grouped["my correction log (personal history)"]).toHaveLength(1);
    expect(grouped["my correction log (personal history)"][0].id).toBe("pc_1");
  });

  it("returns an empty object for no saved entries", () => {
    expect(CorrectionLog.groupCorrectionsByCategory([], "general")).toEqual({});
    expect(CorrectionLog.groupCorrectionsByCategory(undefined, "general")).toEqual({});
  });
});
