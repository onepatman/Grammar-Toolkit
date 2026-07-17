// These tests load the real index.html (see test/helpers/load-app.js) and
// walk the actual content data sets, so a malformed entry — a missing
// field, an empty examples array, a duplicate headword — fails a test
// instead of only surfacing when a user happens to click that exact
// entry. No content is duplicated here; everything is read from the app.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

// Top-level await: the describe/it tree below is built from these dataset
// names, so the app must already be loaded by the time that tree is
// *collected* (not just by the time tests run) — a beforeAll() would run
// too late for that.
const { hooks } = await loadApp();

function expectNonEmptyString(value, label) {
  expect(typeof value, label).toBe("string");
  expect(value.trim().length, label + " should not be blank").toBeGreaterThan(0);
}

function expectNonEmptyStringArray(value, label) {
  expect(Array.isArray(value), label + " should be an array").toBe(true);
  expect(value.length, label + " should not be empty").toBeGreaterThan(0);
  value.forEach((v, i) => expectNonEmptyString(v, `${label}[${i}]`));
}

// Shared shape used by everything rendered through renderRuleEntry():
// { w, senses: [{ use, examples }], mistake?, syn?, ant?, tagalog? }
function checkRuleModuleDataset(name, data) {
  describe(name, () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it("has no duplicate headwords (case-insensitive)", () => {
      const seen = new Map();
      const dupes = [];
      data.forEach((item) => {
        const key = String(item.w).trim().toLowerCase();
        if (seen.has(key)) dupes.push(item.w);
        seen.set(key, true);
      });
      expect(dupes, `duplicate headwords: ${dupes.join(", ")}`).toEqual([]);
    });

    it("every entry has a non-empty headword and at least one usable sense", () => {
      data.forEach((item, i) => {
        expectNonEmptyString(item.w, `${name}[${i}].w`);
        expect(Array.isArray(item.senses), `${name}[${i}].senses`).toBe(true);
        expect(item.senses.length, `${name}[${i}] (${item.w}) has no senses`).toBeGreaterThan(0);

        item.senses.forEach((sense, j) => {
          expectNonEmptyString(sense.use, `${name}[${i}] (${item.w}).senses[${j}].use`);
          expect(Array.isArray(sense.examples), `${name}[${i}] (${item.w}).senses[${j}].examples`).toBe(true);
          sense.examples.forEach((ex, k) =>
            expectNonEmptyString(ex, `${name}[${i}] (${item.w}).senses[${j}].examples[${k}]`)
          );
        });
      });
    });

    it("optional syn/ant/mistake/tagalog fields are well-formed when present", () => {
      data.forEach((item, i) => {
        if (item.syn !== undefined && item.syn !== null) {
          expect(Array.isArray(item.syn), `${name}[${i}] (${item.w}).syn`).toBe(true);
        }
        if (item.ant !== undefined && item.ant !== null) {
          expect(Array.isArray(item.ant), `${name}[${i}] (${item.w}).ant`).toBe(true);
        }
        if (item.mistake !== undefined && item.mistake !== null) {
          expect(typeof item.mistake, `${name}[${i}] (${item.w}).mistake`).toBe("string");
        }
        if (item.tagalog !== undefined && item.tagalog !== null) {
          expectNonEmptyString(item.tagalog, `${name}[${i}] (${item.w}).tagalog`);
        }
      });
    });
  });
}

describe("rule-module datasets (rendered via renderRuleEntry)", () => {
  const datasets = [
    "articleData", "modalData", "capitalData", "orderData",
    "mistakeData", "qaData", "vocabData", "phrasalData",
    "upgradeData", "prepVerbData"
  ];

  it("all expected datasets are exposed by the app", () => {
    datasets.forEach((name) => {
      expect(hooks[name], `window.__TOOLKIT_TEST_HOOKS__.${name}`).toBeDefined();
    });
  });

  datasets.forEach((name) => checkRuleModuleDataset(name, hooks[name]));
});

describe("vocabData synonym/antonym coverage", () => {
  // Guards the vocabulary expansion done in this project: most entries
  // should carry a rich set of synonyms/antonyms rather than the 1-2
  // that used to be typical. Function words (modals, bare prepositions)
  // genuinely have none, so this checks aggregate coverage and names the
  // known no-synonym/no-antonym exceptions explicitly, rather than
  // requiring every single entry to hit a fixed count.
  const KNOWN_WORDS_WITHOUT_SYN_OR_ANT = new Set([
    "can", "could", "may", "might", "must", "shall", "should", "will", "would"
  ]);

  it("averages a rich set of synonyms across the Vocabulary Bank", () => {
    const counts = hooks.vocabData.map((v) => (v.syn || []).length);
    const average = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(average).toBeGreaterThanOrEqual(3.5);
  });

  it("averages a meaningful set of antonyms across the Vocabulary Bank", () => {
    const counts = hooks.vocabData.map((v) => (v.ant || []).length);
    const average = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(average).toBeGreaterThanOrEqual(1.2);
  });

  it("only the known function words have neither a synonym nor an antonym", () => {
    const bare = hooks.vocabData
      .filter((v) => (v.syn || []).length === 0 && (v.ant || []).length === 0)
      .map((v) => v.w);
    expect(new Set(bare)).toEqual(KNOWN_WORDS_WITHOUT_SYN_OR_ANT);
  });
});

describe("verbData (regular/irregular conjugations)", () => {
  it("has both regular and irregular groups, non-empty", () => {
    expect(hooks.verbData).toBeTypeOf("object");
    ["regular", "irregular"].forEach((group) => {
      expect(Array.isArray(hooks.verbData[group]), group).toBe(true);
      expect(hooks.verbData[group].length, group).toBeGreaterThan(0);
    });
  });

  it("every verb entry has a base form and either full conjugation fields or custom examples", () => {
    ["regular", "irregular"].forEach((group) => {
      hooks.verbData[group].forEach((v, i) => {
        expectNonEmptyString(v.w, `verbData.${group}[${i}].w`);
        if (v.custom) {
          expectNonEmptyStringArray(v.custom, `verbData.${group}[${i}] (${v.w}).custom`);
        } else {
          ["s", "ing", "past", "pp"].forEach((field) =>
            expectNonEmptyString(v[field], `verbData.${group}[${i}] (${v.w}).${field}`)
          );
        }
      });
    });
  });

  it("has no duplicate base forms within a group", () => {
    ["regular", "irregular"].forEach((group) => {
      const seen = new Set();
      const dupes = [];
      hooks.verbData[group].forEach((v) => {
        const key = v.w.trim().toLowerCase();
        if (seen.has(key)) dupes.push(v.w);
        seen.add(key);
      });
      expect(dupes, `verbData.${group} duplicates: ${dupes.join(", ")}`).toEqual([]);
    });
  });
});

describe("prepData", () => {
  it("every preposition has categories and at least one sense", () => {
    hooks.prepData.forEach((p, i) => {
      expectNonEmptyString(p.w, `prepData[${i}].w`);
      expectNonEmptyStringArray(p.cats, `prepData[${i}] (${p.w}).cats`);
      expect(p.senses.length, `prepData[${i}] (${p.w}).senses`).toBeGreaterThan(0);
    });
  });
});

describe("tenseData", () => {
  it("every tense has a formula, group, uses, and positive/negative/question examples", () => {
    hooks.tenseData.forEach((t, i) => {
      expectNonEmptyString(t.name, `tenseData[${i}].name`);
      expectNonEmptyString(t.group, `tenseData[${i}] (${t.name}).group`);
      expectNonEmptyString(t.formula, `tenseData[${i}] (${t.name}).formula`);
      expectNonEmptyStringArray(t.uses, `tenseData[${i}] (${t.name}).uses`);
      ["pos", "neg", "q"].forEach((field) =>
        expectNonEmptyString(t.examples[field], `tenseData[${i}] (${t.name}).examples.${field}`)
      );
    });
  });

  it("has no duplicate tense names", () => {
    const seen = new Set();
    const dupes = [];
    hooks.tenseData.forEach((t) => {
      if (seen.has(t.name)) dupes.push(t.name);
      seen.add(t.name);
    });
    expect(dupes).toEqual([]);
  });
});

describe("wordFamilyData", () => {
  it("every family has a verb, noun, adjective form and example sentences", () => {
    // "—" is the dataset's placeholder for "no natural form exists" (see
    // renderFamily(), index.html) — when adj is "—" there's nothing to
    // exemplify, so renderFamily() deliberately skips the exAdj line
    // (`item.exAdj ? ... : ""`). Everything else must always be present.
    hooks.wordFamilyData.forEach((f, i) => {
      expectNonEmptyString(f.verb, `wordFamilyData[${i}].verb`);
      expectNonEmptyString(f.noun, `wordFamilyData[${i}] (${f.verb}).noun`);
      expectNonEmptyString(f.adj, `wordFamilyData[${i}] (${f.verb}).adj`);
      expectNonEmptyString(f.exNoun, `wordFamilyData[${i}] (${f.verb}).exNoun`);
      if (f.adj !== "—") {
        expectNonEmptyString(f.exAdj, `wordFamilyData[${i}] (${f.verb}).exAdj`);
      }
    });
  });

  it("has no duplicate base verbs", () => {
    const seen = new Set();
    const dupes = [];
    hooks.wordFamilyData.forEach((f) => {
      const key = f.verb.trim().toLowerCase();
      if (seen.has(key)) dupes.push(f.verb);
      seen.add(key);
    });
    expect(dupes).toEqual([]);
  });
});

describe("searchIndex", () => {
  it("is built from the datasets and has no blank labels", () => {
    expect(hooks.searchIndex.length).toBeGreaterThan(0);
    hooks.searchIndex.forEach((item, i) => {
      expectNonEmptyString(item.label, `searchIndex[${i}].label`);
      expect(typeof item.action, `searchIndex[${i}].action`).toBe("function");
    });
  });
});
