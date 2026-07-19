// Integration tests for the Phrasal Words quick-add — mirrors the
// Fixes-tab "manually trigger, permanently save" idea, but the content
// itself (definition, usage, examples, synonyms, antonyms) comes from
// an online lookup rather than free-form manual fields. Loads the real
// index.html in jsdom and dispatches real DOM interactions.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

const ONLINE_PHRASAL_RESULT = {
  w: "wind down",
  senses: [{ use: "(verb) To relax before going to sleep.", examples: ["He likes to wind down with a book."] }],
  syn: ["relax"],
  ant: ["energize"],
  mistake: null,
  tagalog: null,
  source: "online"
};

function stubFetch(window, result) {
  window.OnlineLookup.fetchOnlineDefinition = async () => result;
}

describe("Phrasal Words quick-add UI", () => {
  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.getElementById("phrasalAddStatus").textContent).toContain("enter a phrasal verb");
  });

  it("looks up online, previews the result, and only adds it once Save is clicked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, ONLINE_PHRASAL_RESULT);

    document.getElementById("phrasalAddInput").value = "wind down";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    // Not saved yet — shown as a preview with Save/Decline first.
    const statusEl = document.getElementById("phrasalAddStatus");
    expect(statusEl.textContent).toContain("ready to be added");
    expect(hooks.phrasalData.some((p) => p.w === "wind down")).toBe(false);

    statusEl.querySelector(".lb-lookup-save-btn").click();
    await new Promise((r) => setTimeout(r, 30));

    expect(document.getElementById("phrasalAddStatus").textContent).toContain("Added");
    expect(hooks.phrasalData.some((p) => p.w === "wind down")).toBe(true);
    expect(hooks.wordIndexMap.get("wind down").cat).toBe("Phrasal Verb");
    // Navigates straight to the new entry.
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(document.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("wind down");
  });

  it("Decline discards the previewed phrase — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, ONLINE_PHRASAL_RESULT);

    document.getElementById("phrasalAddInput").value = "wind down";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    document.getElementById("phrasalAddStatus").querySelector(".lb-lookup-decline-btn").click();
    await new Promise((r) => setTimeout(r, 10));

    expect(document.getElementById("phrasalAddStatus").textContent).toContain("Not saved");
    expect(hooks.phrasalData.some((p) => p.w === "wind down")).toBe(false);
  });

  it("clears the input field after a successful add", async () => {
    const { window } = await loadApp();
    const document = window.document;
    stubFetch(window, ONLINE_PHRASAL_RESULT);

    document.getElementById("phrasalAddInput").value = "wind down";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    expect(document.getElementById("phrasalAddInput").value).toBe("");
  });

  it("shows a graceful error and adds nothing when the online source has no result", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, null);

    document.getElementById("phrasalAddInput").value = "zzznotaphrase";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    expect(document.getElementById("phrasalAddStatus").textContent).toContain("Couldn't find");
    expect(hooks.phrasalData.some((p) => p.w === "zzznotaphrase")).toBe(false);
  });

  it("leaves examples/synonyms/antonyms empty in the rendered entry rather than fabricating them", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, {
      w: "zonk out",
      senses: [{ use: "(verb) To fall asleep suddenly.", examples: [] }],
      syn: [],
      ant: [],
      mistake: null,
      tagalog: null,
      source: "online"
    });

    document.getElementById("phrasalAddInput").value = "zonk out";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));
    document.getElementById("phrasalAddStatus").querySelector(".lb-lookup-save-btn").click();
    await new Promise((r) => setTimeout(r, 30));

    const entryEl = document.getElementById("phrasalEntry");
    expect(entryEl.querySelectorAll(".ex")).toHaveLength(0);
    expect(entryEl.querySelectorAll(".word-chips .clickable")).toHaveLength(0);
    expect(hooks.phrasalData.find((p) => p.w === "zonk out").senses[0].examples).toEqual([]);
  });

  it("requests the lookup with generateFallbackExamples disabled", async () => {
    const { window } = await loadApp();
    const document = window.document;
    let capturedOptions = null;
    window.OnlineLookup.fetchOnlineDefinition = async (word, options) => {
      capturedOptions = options;
      return ONLINE_PHRASAL_RESULT;
    };

    document.getElementById("phrasalAddInput").value = "wind down";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    expect(capturedOptions.generateFallbackExamples).toBe(false);
  });

  it("does not create a duplicate and instead navigates to the existing entry when the phrase is already known", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    // "move on" is a built-in phrasal entry.
    document.getElementById("phrasalAddInput").value = "move on";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    expect(fetchCalled).toBe(false);
    expect(document.getElementById("phrasalAddStatus").textContent).toContain("already in the database");
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(document.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("move on");
    expect(hooks.phrasalData.filter((p) => p.w === "move on")).toHaveLength(1);
  });

  it("submits on Enter key, same as clicking the button", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, ONLINE_PHRASAL_RESULT);

    const input = document.getElementById("phrasalAddInput");
    input.value = "wind down";
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
    await new Promise((r) => setTimeout(r, 30));

    // Enter triggers the same lookup + preview as clicking the button —
    // still requires an explicit Save before anything is persisted.
    const statusEl = document.getElementById("phrasalAddStatus");
    expect(statusEl.textContent).toContain("ready to be added");
    statusEl.querySelector(".lb-lookup-save-btn").click();
    await new Promise((r) => setTimeout(r, 30));

    expect(hooks.phrasalData.some((p) => p.w === "wind down")).toBe(true);
  });
});

describe("Phrasal Words persistence (real IndexedDB, not mocked)", () => {
  it("a phrase added in one session is restored and searchable in the next", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    first.hooks.addPhrasalEntry(ONLINE_PHRASAL_RESULT, { persist: true });
    await new Promise((r) => setTimeout(r, 50));

    const { window, hooks } = await loadApp({ indexedDBFactory });
    const document = window.document;

    expect(hooks.phrasalData.some((p) => p.w === "wind down")).toBe(true);
    expect(Array.from(document.getElementById("phrasalSelect").options).some((o) => o.value === "wind down")).toBe(true);

    hooks.runSearchPipeline("wind down");
    const resultsText = document.getElementById("searchResults").textContent;
    expect(resultsText).toContain("wind down");
    expect(resultsText).toContain("Phrasal Verb");
  });

  it("is stored in the phrasalEntries store, independent of vocabEntries", async () => {
    const idb = new IDBFactory();
    const { hooks } = await loadApp({ indexedDBFactory: idb });
    hooks.addPhrasalEntry(ONLINE_PHRASAL_RESULT, { persist: true });
    await new Promise((r) => setTimeout(r, 50));

    const stored = await VocabCache.getPhrasal("wind down", { indexedDB: idb });
    expect(stored).toEqual(ONLINE_PHRASAL_RESULT);
    const vocabStored = await VocabCache.get("wind down", { indexedDB: idb });
    expect(vocabStored).toBeUndefined();
  });
});

describe("addPhrasalEntry deduplication and richer-data updates", () => {
  it("adding the same phrase twice does not create a duplicate entry", async () => {
    const { hooks } = await loadApp();
    hooks.addPhrasalEntry(ONLINE_PHRASAL_RESULT, { persist: false });
    hooks.addPhrasalEntry({ ...ONLINE_PHRASAL_RESULT }, { persist: false });

    expect(hooks.phrasalData.filter((p) => p.w === "wind down")).toHaveLength(1);
    expect(hooks.searchIndex.filter((i) => i.label === "wind down")).toHaveLength(1);
  });

  it("never overwrites a built-in phrasal entry, no matter how much richer the candidate is", async () => {
    const { hooks } = await loadApp();
    const builtin = hooks.phrasalData.find((p) => p.w === "move on");
    const originalSenseCount = builtin.senses.length;

    const fakeRicher = {
      w: "move on",
      senses: new Array(5).fill({ use: "fabricated", examples: ["fabricated"] }),
      syn: ["a", "b", "c"],
      ant: ["d", "e"],
      mistake: null,
      tagalog: null,
      source: "online"
    };
    hooks.addPhrasalEntry(fakeRicher, { persist: false });

    expect(builtin.senses).toHaveLength(originalSenseCount);
    expect(builtin.senses[0].use).not.toBe("fabricated");
  });
});

// Regression coverage for: "the lookup can't find most idioms/sentences,
// don't leave the entry unusable." Phrasal Verbs requires an actual
// meaning before saving (it's a dictionary-style category), unlike
// Useful Sentences/Sentence Patterns which allow an "Add without notes"
// skip — see test/language-bank.test.js for that side of the split.
describe("manual completion when no online source has the phrase", () => {
  it("shows the manual-entry box instead of refusing outright", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, null);

    document.getElementById("phrasalAddInput").value = "zzznotaphrase";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    expect(document.getElementById("phrasalManualBox").style.display).not.toBe("none");
    expect(document.getElementById("phrasalManualWord").textContent).toBe("zzznotaphrase");
    expect(hooks.languageBankPendingManual.phrasal).toBe("zzznotaphrase");
  });

  it("saves with a manually-typed meaning and optional example when Save is clicked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, null);

    document.getElementById("phrasalAddInput").value = "zonk out";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    document.getElementById("phrasalManualUse").value = "(verb) To fall asleep very suddenly.";
    document.getElementById("phrasalManualExample").value = "He zonked out right after dinner.";
    document.getElementById("phrasalManualSaveBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    expect(document.getElementById("phrasalAddStatus").className).toContain("success");
    const added = hooks.phrasalData.find((p) => p.w === "zonk out");
    expect(added.senses[0]).toEqual({
      use: "(verb) To fall asleep very suddenly.",
      examples: ["He zonked out right after dinner."]
    });
    expect(document.getElementById("phrasalManualBox").style.display).toBe("none");
  });

  it("refuses to save with a blank meaning — a phrasal verb entry needs an actual definition", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, null);

    document.getElementById("phrasalAddInput").value = "zzznotaphrase";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    document.getElementById("phrasalManualSaveBtn").click();
    await new Promise((r) => setTimeout(r, 20));

    expect(document.getElementById("phrasalAddStatus").className).toContain("error");
    expect(hooks.phrasalData.some((p) => p.w === "zzznotaphrase")).toBe(false);
    expect(document.getElementById("phrasalManualBox").style.display).not.toBe("none");
  });

  it("Cancel hides the manual box without adding anything", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, null);

    document.getElementById("phrasalAddInput").value = "zzznotaphrase";
    document.getElementById("phrasalAddBtn").click();
    await new Promise((r) => setTimeout(r, 30));

    document.getElementById("phrasalManualCancelBtn").click();
    await new Promise((r) => setTimeout(r, 10));

    expect(document.getElementById("phrasalManualBox").style.display).toBe("none");
    expect(document.getElementById("phrasalAddStatus").textContent).toContain("Cancelled");
    expect(hooks.phrasalData.some((p) => p.w === "zzznotaphrase")).toBe(false);
  });

  it("has no 'Add without notes' skip button for Phrasal Verbs — a blank dictionary entry isn't useful", () => {
    return loadApp().then(({ window }) => {
      expect(window.document.getElementById("phrasalManualSkipBtn")).toBeNull();
    });
  });
});
