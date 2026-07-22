// Integration tests for the "English-Filipino Dictionary Expansion"
// feature: Definition-by-Part-of-Speech rendering on the Vocabulary tab,
// the auto Filipino/Tagalog enrichment triggered from renderRuleEntry
// (both for an existing local word missing a translation and for a
// brand-new online-search preview), and the Tagalog-to-English reverse
// search fallback. Mirrors search-coverage.test.js's and
// vocab-expansion.test.js's style; the network is always mocked via
// window.TagalogLookup/window.OnlineLookup overrides, never a real call.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PRESS_POS_ENTRY = {
  w: "press-test",
  senses: [
    { use: "(verb) To apply steady force against something.", examples: ["She pressed the button."] },
    { use: "(verb) To urge or pressure someone.", examples: ["They pressed him for an answer."] },
    { use: "(noun) Newspapers and journalists collectively.", examples: ["The press covered the story."] }
  ],
  syn: [], ant: [], mistake: null, tagalog: null, source: "online"
};

const FLAT_ENTRY = {
  w: "wobble-test",
  senses: [
    { use: "To move unsteadily from side to side.", examples: ["The table wobbled on the floor."] }
  ],
  syn: [], ant: [], mistake: null, tagalog: null, source: "online"
};

describe("Vocabulary tab: Definition grouped by Part of Speech", () => {
  it("renames the section label to 'Definition' (not 'Rule & usage') for Vocabulary Bank entries", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.TagalogLookup.fetchTagalogTranslation = async () => null;
    const item = { ...FLAT_ENTRY };
    hooks.addVocabEntry(item, { persist: false });

    hooks.renderRuleEntry(item, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");

    const label = document.getElementById("vocabEntry").querySelector(".section-label");
    expect(label.textContent).toBe("Definition");
  });

  it("keeps 'Rule & usage' unchanged for a non-Vocabulary rule module (Distinctions)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const item = { w: "sample-distinction", senses: [{ use: "A sample rule.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null };

    const scratch = document.createElement("div");
    hooks.renderRuleEntry(item, scratch, "Distinctions", "distinctions");
    expect(scratch.querySelector(".section-label").textContent).toBe("Rule & usage");
  });

  it("groups senses under a heading per detected part of speech, in first-appearance order", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.TagalogLookup.fetchTagalogTranslation = async () => null;
    const item = { ...PRESS_POS_ENTRY };
    hooks.addVocabEntry(item, { persist: false });

    hooks.renderRuleEntry(item, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");

    const headings = Array.from(document.getElementById("vocabEntry").querySelectorAll(".pos-heading")).map((el) => el.textContent);
    expect(headings).toEqual(["VERB", "NOUN"]);
    // Both verb senses land under the single VERB heading, not two separate ones.
    const groups = document.getElementById("vocabEntry").querySelectorAll(".pos-group");
    expect(groups.length).toBe(2);
    expect(groups[0].querySelectorAll(".sense").length).toBe(2);
    expect(groups[1].querySelectorAll(".sense").length).toBe(1);
    // The "(verb) "/"(noun) " marker itself is stripped from the displayed text.
    expect(document.getElementById("vocabEntry").textContent).toContain("To apply steady force against something.");
    expect(document.getElementById("vocabEntry").textContent).not.toContain("(verb) To apply steady force against something.");
  });

  it("degrades gracefully to the old flat rendering (no heading) for data with no POS prefix, like every built-in entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.TagalogLookup.fetchTagalogTranslation = async () => null;
    const item = { ...FLAT_ENTRY };
    hooks.addVocabEntry(item, { persist: false });

    hooks.renderRuleEntry(item, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");

    expect(document.getElementById("vocabEntry").querySelectorAll(".pos-heading").length).toBe(0);
    expect(document.getElementById("vocabEntry").querySelectorAll(".sense").length).toBe(1);
  });

  it("never invents a part of speech for a real built-in vocabData entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const builtIn = hooks.vocabData[0]; // already has a tagalog value, so no lookup fires

    hooks.renderRuleEntry(builtIn, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");

    expect(document.getElementById("vocabEntry").querySelectorAll(".pos-heading").length).toBe(0);
  });
});

describe("Auto Filipino/Tagalog enrichment (existing local word missing a translation)", () => {
  it("fetches a missing translation once displayed, shows it, and persists it to IndexedDB for offline use", async () => {
    const idb = new IDBFactory();
    const { window, hooks } = await loadApp({ indexedDBFactory: idb });
    const document = window.document;
    let calledWith = null;
    window.TagalogLookup.fetchTagalogTranslation = async (word) => {
      calledWith = word;
      return { text: "pindutin; idiin", candidates: ["pindutin", "idiin"] };
    };
    const item = { ...PRESS_POS_ENTRY, w: "press-enrich" };
    hooks.addVocabEntry(item, { persist: true });
    await wait(30);

    hooks.renderRuleEntry(item, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");
    await wait(30);

    expect(calledWith).toBe("press-enrich");
    expect(item.tagalog).toBe("pindutin; idiin");
    const box = document.getElementById("vocabEntry").querySelector(".tagalog-box");
    expect(box.textContent).toBe("pindutin; idiin");
    expect(box.classList.contains("muted")).toBe(false);

    const stored = await VocabCache.get("press-enrich", { indexedDB: idb });
    expect(stored.tagalog).toBe("pindutin; idiin");
  });

  it("never re-fetches or overwrites a word that already has a verified translation", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let called = false;
    window.TagalogLookup.fetchTagalogTranslation = async () => { called = true; return { text: "should-not-appear", candidates: ["should-not-appear"] }; };
    const item = { ...PRESS_POS_ENTRY, w: "press-verified", tagalog: "pindutin (verified)" };
    hooks.addVocabEntry(item, { persist: false });

    hooks.renderRuleEntry(item, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");
    await wait(30);

    expect(called).toBe(false);
    expect(item.tagalog).toBe("pindutin (verified)");
    expect(document.getElementById("vocabEntry").querySelector(".tagalog-box").textContent).toBe("pindutin (verified)");
  });

  it("shows an explicit 'no direct equivalent found' message rather than inventing one when the API has nothing reliable", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.TagalogLookup.fetchTagalogTranslation = async () => null;
    const item = { ...FLAT_ENTRY, w: "wobble-notfound" };
    hooks.addVocabEntry(item, { persist: false });

    hooks.renderRuleEntry(item, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");
    await wait(30);

    const box = document.getElementById("vocabEntry").querySelector(".tagalog-box");
    expect(box.textContent).toBe("No direct Filipino equivalent found.");
    expect(box.classList.contains("muted")).toBe(true);
    expect(item.tagalog).toBeFalsy();
  });

  it("the 'not found' state is transient (in-memory only) — a fresh load retries the lookup rather than persisting a permanent unknown marker", async () => {
    const idb = new IDBFactory();
    const { window, hooks } = await loadApp({ indexedDBFactory: idb });
    const document = window.document;
    window.TagalogLookup.fetchTagalogTranslation = async () => null;
    hooks.addVocabEntry({ ...FLAT_ENTRY, w: "wobble-transient" }, { persist: true });
    await wait(30);
    document.getElementById("vocabSelect").value = "wobble-transient";
    document.getElementById("vocabSelect").dispatchEvent(new window.Event("change"));
    await wait(30);

    const stored = await VocabCache.get("wobble-transient", { indexedDB: idb });
    expect(stored.__tagalogNotFound).toBeUndefined();
    expect(stored.tagalog).toBeFalsy();
  });

  it("never persists to IndexedDB for an unsaved online-search preview — that rides along only through the explicit Save step", async () => {
    const idb = new IDBFactory();
    const { window, hooks } = await loadApp({ indexedDBFactory: idb });
    const document = window.document;
    window.TagalogLookup.fetchTagalogTranslation = async () => ({ text: "bagong-salita", candidates: ["bagong-salita"] });
    window.OnlineLookup.fetchOnlineDefinition = async (word) => {
      if (word !== "zibblewock-tg") return null;
      return { w: "zibblewock-tg", senses: [{ use: "(noun) A made-up test word.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" };
    };

    hooks.runSearchPipeline("zibblewock-tg");
    await wait(600);

    expect(document.getElementById("vocabEntry").querySelector(".tagalog-box").textContent).toBe("bagong-salita");
    expect(hooks.vocabData.some((v) => v.w === "zibblewock-tg")).toBe(false);
    const stored = await VocabCache.get("zibblewock-tg", { indexedDB: idb });
    expect(stored).toBeUndefined();

    // Saving now carries the auto-fetched translation along automatically.
    document.getElementById("saveOnlineVocabBtn").click();
    await wait(50);
    expect(hooks.vocabData.find((v) => v.w === "zibblewock-tg").tagalog).toBe("bagong-salita");
  });
});

describe("Tagalog-to-English reverse search fallback", () => {
  it("translates an unrecognized query as Tagalog, then runs the translated English word through the normal online dictionary pipeline", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async (word) => {
      if (word !== "sparkle-test") return null;
      return { w: "sparkle-test", senses: [{ use: "(verb) To shine with flashes of light.", examples: ["The lake sparkled in the sun."] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" };
    };
    window.TagalogLookup.fetchEnglishTranslation = async (word) => {
      if (word !== "kislap-test") return null;
      return { text: "sparkle-test", candidates: ["sparkle-test"] };
    };
    window.TagalogLookup.fetchTagalogTranslation = async () => null;

    hooks.runSearchPipeline("kislap-test");
    await wait(600);

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("sparkle-test");
    // The original Tagalog query is stamped as the translation immediately,
    // never left blank just because the dictionary source only knows English.
    expect(document.getElementById("vocabEntry").querySelector(".tagalog-box").textContent).toBe("kislap-test");
  });

  it("navigates straight to an already-known local word instead of a second network round trip, when the translated word is already in the Vocabulary Bank", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "conundrum-tg", senses: [{ use: "(noun) A confusing problem.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: "palaisipan", source: "online" },
      { persist: false }
    );
    let onlineCalls = 0;
    window.OnlineLookup.fetchOnlineDefinition = async () => { onlineCalls++; return null; };
    window.TagalogLookup.fetchEnglishTranslation = async (word) => {
      if (word !== "palaisipan-test") return null;
      return { text: "conundrum-tg", candidates: ["conundrum-tg"] };
    };

    hooks.runSearchPipeline("palaisipan-test");
    await wait(600);

    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("conundrum-tg");
    // Only the one lookup for the original (untranslatable-as-English) query itself.
    expect(onlineCalls).toBe(1);
  });

  it("falls back to 'No matches' when neither the English nor the Tagalog translation attempt finds anything", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    window.TagalogLookup.fetchEnglishTranslation = async () => null;

    hooks.runSearchPipeline("zzznotarealword-test");
    await wait(600);

    expect(document.getElementById("searchResults").textContent).toContain("No matches");
  });
});
