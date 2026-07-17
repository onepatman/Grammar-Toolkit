// Integration tests proving the IndexedDB vocab cache is a real,
// persistent extension of the local Vocabulary Bank — not just a
// session-only lookup history. Loads the real index.html in jsdom
// (with a fake IndexedDB injected, see test/helpers/load-app.js) so the
// actual addVocabEntry()/restore wiring is exercised end to end.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

const ONLINE_ENTRY = {
  w: "zephyr",
  senses: [{ use: "(noun) A gentle breeze.", examples: ["A zephyr drifted through the window."] }],
  syn: ["breeze"],
  ant: [],
  mistake: null,
  tagalog: null,
  source: "online"
};

const RICHER_ONLINE_ENTRY = {
  w: "zephyr",
  senses: [
    { use: "(noun) A gentle breeze.", examples: ["A zephyr drifted through the window."] },
    { use: "(noun) Something light and insubstantial.", examples: ["His promise was a mere zephyr."] }
  ],
  syn: ["breeze", "waft"],
  ant: ["gale"],
  mistake: null,
  tagalog: null,
  source: "online"
};

describe("a word cached from a previous session is restored as a first-class local entry", () => {
  it("shows up in vocabData, the dropdown, and search — indistinguishable from a built-in word", async () => {
    const indexedDBFactory = new IDBFactory();

    // Simulate a prior session that looked up "zephyr" online and cached it.
    const first = await loadApp({ indexedDBFactory });
    first.hooks.addVocabEntry(ONLINE_ENTRY, { persist: true });
    // Let the persistence write settle.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // A brand new session, same browser (same IndexedDB) — nothing else primed.
    const { window, hooks } = await loadApp({ indexedDBFactory });
    const document = window.document;

    expect(hooks.vocabData.some((v) => v.w === "zephyr")).toBe(true);
    expect(hooks.wordIndexMap.get("zephyr")).toBeTruthy();
    expect(hooks.wordIndexMap.get("zephyr").cat).toBe("Vocabulary Bank");
    expect(Array.from(document.getElementById("vocabSelect").options).some((o) => o.value === "zephyr")).toBe(true);

    hooks.runSearchPipeline("zephyr");
    const resultsText = document.getElementById("searchResults").textContent;
    expect(resultsText).toContain("zephyr");
    expect(resultsText).toContain("Vocabulary Bank");
    expect(resultsText).not.toContain("Online dictionary");
  });

  it("does not attempt another online fetch for a word already restored from cache", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    first.hooks.addVocabEntry(ONLINE_ENTRY, { persist: true });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const { window, hooks } = await loadApp({ indexedDBFactory });
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    hooks.runSearchPipeline("zephyr");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fetchCalled).toBe(false);
  });

  it("a cached entry's synonym/antonym chips are clickable and land back on the Vocab tab, same as a built-in entry", async () => {
    const { window, hooks } = await loadApp();
    hooks.addVocabEntry(ONLINE_ENTRY, { persist: false });

    hooks.runSearchPipeline("zephyr");
    const document = window.document;
    const item = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("zephyr"));
    item.click();

    const chip = document.querySelector("#vocabEntry .word-chips .clickable");
    expect(chip).toBeTruthy();
    expect(chip.dataset.word).toBe("breeze");
  });

  it("a cached entry participates in search history like any other search", async () => {
    const { window, hooks } = await loadApp();
    hooks.addVocabEntry(ONLINE_ENTRY, { persist: false });
    const document = window.document;

    hooks.runSearchPipeline("above"); // built-in word, first history entry
    Array.from(document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("Vocabulary Bank"))
      .click();

    hooks.runSearchPipeline("zephyr"); // cached word, second history entry
    document.querySelector("#searchResults .search-result-item").click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("zephyr");

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("above");
  });
});

describe("deduplication and richer-data updates", () => {
  it("adding the same word twice does not create a duplicate entry", async () => {
    const { hooks } = await loadApp();
    hooks.addVocabEntry(ONLINE_ENTRY, { persist: false });
    hooks.addVocabEntry({ ...ONLINE_ENTRY }, { persist: false });

    expect(hooks.vocabData.filter((v) => v.w === "zephyr")).toHaveLength(1);
    expect(hooks.searchIndex.filter((i) => i.label === "zephyr")).toHaveLength(1);
  });

  it("updates a previously-cached entry in place when richer online data arrives later", async () => {
    const { hooks } = await loadApp();
    hooks.addVocabEntry(ONLINE_ENTRY, { persist: false });
    hooks.addVocabEntry(RICHER_ONLINE_ENTRY, { persist: false });

    const entries = hooks.vocabData.filter((v) => v.w === "zephyr");
    expect(entries).toHaveLength(1); // still deduplicated, not appended
    expect(entries[0].senses).toHaveLength(2);
    expect(entries[0].ant).toEqual(["gale"]);
  });

  it("does not downgrade an already-richer cached entry with a thinner result", async () => {
    const { hooks } = await loadApp();
    hooks.addVocabEntry(RICHER_ONLINE_ENTRY, { persist: false });
    hooks.addVocabEntry(ONLINE_ENTRY, { persist: false }); // thinner than what's already there

    const entries = hooks.vocabData.filter((v) => v.w === "zephyr");
    expect(entries[0].senses).toHaveLength(2); // unchanged, still the richer version
  });

  it("persists the updated (richer) entry to IndexedDB when persist is true", async () => {
    const idb = new IDBFactory();
    const { hooks } = await loadApp({ indexedDBFactory: idb });
    hooks.addVocabEntry(ONLINE_ENTRY, { persist: true });
    await new Promise((resolve) => setTimeout(resolve, 30));
    hooks.addVocabEntry(RICHER_ONLINE_ENTRY, { persist: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const stored = await VocabCache.get("zephyr", { indexedDB: idb });
    expect(stored.senses).toHaveLength(2);
  });

  it("never overwrites a built-in local entry, no matter how much richer the candidate is", async () => {
    const { hooks } = await loadApp();
    const builtin = hooks.vocabData.find((v) => v.w === "above");
    const originalSenseCount = builtin.senses.length;

    const fakeRicherAbove = {
      w: "above",
      senses: new Array(10).fill({ use: "fabricated", examples: ["fabricated example"] }),
      syn: ["over", "atop", "on top of", "higher", "beyond", "up"],
      ant: ["under", "below", "beneath"],
      mistake: null,
      tagalog: null,
      source: "online"
    };
    hooks.addVocabEntry(fakeRicherAbove, { persist: false });

    expect(builtin.senses).toHaveLength(originalSenseCount);
    expect(builtin.senses[0].use).not.toBe("fabricated");
  });
});
