// Integration tests for the Word Bank tab (#panel-wordbank) — two
// manual-only categories sharing one tab via a segmented switcher:
// Basic → Advanced English and Tagalog → English. The Add flow is
// direct entry, no modal — two plain inputs plus a Save button right in
// the box, the exact same shape as Distinctions Words' own inline
// "Word 1 / Word 2" add box. An optional definition and example(s) for
// each side only ever show up in the Edit form, never at creation.
// Edit/Delete are owner-gated the same way Distinctions Words' entries are.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Word Bank tab — shell and category switcher", () => {
  it("appears as its own tab with a 2-category segmented switcher, defaulting to Basic → Advanced", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const tabs = Array.from(document.querySelectorAll(".thumb-tab")).map((t) => t.dataset.tab);
    expect(tabs).toContain("wordbank");

    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    expect(document.getElementById("panel-wordbank").style.display).toBe("block");
    expect(document.getElementById("wordbank-basicAdvanced").style.display).not.toBe("none");
    expect(document.getElementById("wordbank-tagalogEnglish").style.display).toBe("none");
    expect(document.querySelector('#wordBankCategorySeg button[data-val="basicAdvanced"]').classList.contains("active")).toBe(true);
  });

  it("switches to Tagalog → English and back", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();

    document.querySelector('#wordBankCategorySeg button[data-val="tagalogEnglish"]').click();
    expect(document.getElementById("wordbank-tagalogEnglish").style.display).toBe("block");
    expect(document.getElementById("wordbank-basicAdvanced").style.display).toBe("none");
    expect(document.querySelector('#wordBankCategorySeg button[data-val="tagalogEnglish"]').classList.contains("active")).toBe(true);

    document.querySelector('#wordBankCategorySeg button[data-val="basicAdvanced"]').click();
    expect(document.getElementById("wordbank-basicAdvanced").style.display).toBe("block");
  });
});

describe("Word Bank — Basic → Advanced English (manual-only, no online lookup)", () => {
  it("renders the add box with two plain inputs and a Save button — no modal involved", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("basicAdvancedAddBox")).not.toBeNull();
    expect(document.getElementById("basicAdvancedAddBasicInput")).not.toBeNull();
    expect(document.getElementById("basicAdvancedAddAdvancedInput")).not.toBeNull();
    expect(document.getElementById("basicAdvancedAddBtn")).not.toBeNull();
    expect(document.getElementById("basicAdvancedAddBtn").textContent).toContain("Save");
  });

  it("shows an error when both fields are empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(10);
    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("Please fill in");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("basicAdvancedAddBasicInput").value = "happy";
    document.getElementById("basicAdvancedAddAdvancedInput").value = "elated";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);
    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(false);
  });

  it("requires both the basic and advanced word before saving", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("basicAdvancedAddBasicInput").value = "happy";
    // Advanced word left blank.
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(10);

    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("Please fill in");
    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(false);
  });

  it("saves directly from the two inputs — no modal ever opens, null definitions and empty example arrays, persists it, and navigates to it", async () => {
    const idb = new IDBFactory();
    const { window, hooks } = await loadApp({ indexedDBFactory: idb });
    const document = window.document;
    document.getElementById("basicAdvancedAddBasicInput").value = "happy";
    document.getElementById("basicAdvancedAddAdvancedInput").value = "elated";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);

    expect(document.getElementById("lookupModal").style.display).toBe("none");
    const saved = hooks.basicAdvancedData.find((e) => e.basic === "happy");
    expect(saved).toBeTruthy();
    expect(saved.advanced).toBe("elated");
    expect(saved.basicDef).toBeNull();
    expect(saved.advancedDef).toBeNull();
    expect(saved.basicExamples).toEqual([]);
    expect(saved.advancedExamples).toEqual([]);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("wordbank");
    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("has been added to Word Bank");

    // Inputs clear after a successful save.
    expect(document.getElementById("basicAdvancedAddBasicInput").value).toBe("");
    expect(document.getElementById("basicAdvancedAddAdvancedInput").value).toBe("");

    const stored = await VocabCache.getBasicAdvanced("happy", { indexedDB: idb });
    expect(stored.advanced).toBe("elated");
  });

  it("submitting Enter in either input saves the pair, same as clicking the button", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("basicAdvancedAddBasicInput").value = "happy";
    document.getElementById("basicAdvancedAddAdvancedInput").value = "elated";
    document.getElementById("basicAdvancedAddAdvancedInput").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
    await wait(30);

    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(true);
  });

  it("does not duplicate a basic word already in Word Bank, and offers to view the existing pair instead", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addBasicAdvancedEntry({ basic: "happy", advanced: "elated", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [] }, { persist: false });

    document.getElementById("basicAdvancedAddBasicInput").value = "happy";
    document.getElementById("basicAdvancedAddAdvancedInput").value = "something else";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);

    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("already in the database");
    expect(hooks.basicAdvancedData.filter((e) => e.basic === "happy")).toHaveLength(1);
  });

  it("a saved pair is findable via global search by its basic word", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addBasicAdvancedEntry({ basic: "happy", advanced: "elated", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [] }, { persist: false });

    hooks.runSearchPipeline("happy");
    const labels = Array.from(document.querySelectorAll("#searchResults .search-result-item .label")).map((el) => el.textContent.toLowerCase());
    expect(labels).toContain("happy");
  });
});

describe("Word Bank — Basic → Advanced Edit/Delete (owner-gated)", () => {
  function seed(hooks) {
    hooks.addBasicAdvancedEntry({ basic: "happy", advanced: "elated", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [] }, { persist: false });
  }

  it("shows no Edit/Delete buttons while locked", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    seed(hooks);
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    expect(document.querySelector("#basicAdvancedEntry .lb-edit-btn")).toBeNull();
    expect(document.querySelector("#basicAdvancedEntry .lb-delete-btn")).toBeNull();
  });

  it("shows Edit/Delete buttons once unlocked", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    expect(document.querySelector("#basicAdvancedEntry .lb-edit-btn")).not.toBeNull();
    expect(document.querySelector("#basicAdvancedEntry .lb-delete-btn")).not.toBeNull();
  });

  it("Edit opens a form with word + optional definition + example(s) for both sides, prefilled", async () => {
    const { window, hooks } = await loadApp();
    hooks.addBasicAdvancedEntry({ basic: "happy", advanced: "elated", basicDef: "Feeling pleasure.", basicExamples: ["She is happy."], advancedDef: "Very happy.", advancedExamples: ["She was elated."] }, { persist: false });
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);

    document.querySelector("#basicAdvancedEntry .lb-edit-btn").click();

    expect(document.getElementById("baEditBasic").value).toBe("happy");
    expect(document.getElementById("baEditBasicDef").value).toBe("Feeling pleasure.");
    expect(document.getElementById("baEditBasicExample").value).toBe("She is happy.");
    expect(document.getElementById("baEditAdvanced").value).toBe("elated");
    expect(document.getElementById("baEditAdvancedDef").value).toBe("Very happy.");
    expect(document.getElementById("baEditAdvancedExample").value).toBe("She was elated.");
  });

  it("saving the edit form adds a definition and examples that weren't set at creation", async () => {
    const idb = new IDBFactory();
    const { window, hooks } = await loadApp({ indexedDBFactory: idb });
    seed(hooks);
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    document.querySelector("#basicAdvancedEntry .lb-edit-btn").click();

    document.getElementById("baEditBasicDef").value = "Feeling or showing pleasure.";
    document.getElementById("baEditBasicExample").value = "She is happy.\nHe looked happy.";
    document.getElementById("baEditAdvancedDef").value = "Extremely happy.";
    document.getElementById("baEditAdvancedExample").value = "She was elated by the news.";
    document.getElementById("baEditSaveBtn").click();
    await wait(30);

    const saved = hooks.basicAdvancedData.find((e) => e.basic === "happy");
    expect(saved.basicDef).toBe("Feeling or showing pleasure.");
    expect(saved.basicExamples).toEqual(["She is happy.", "He looked happy."]);
    expect(saved.advancedDef).toBe("Extremely happy.");
    expect(saved.advancedExamples).toEqual(["She was elated by the news."]);

    const entryText = document.getElementById("basicAdvancedEntry").textContent;
    expect(entryText).toContain("Feeling or showing pleasure.");
    expect(entryText).toContain("He looked happy.");

    const stored = await VocabCache.getBasicAdvanced("happy", { indexedDB: idb });
    expect(stored.basicDef).toBe("Feeling or showing pleasure.");
  });

  it("renaming the basic word to a value already used by another entry is refused, restoring the original", async () => {
    const { window, hooks } = await loadApp();
    hooks.addBasicAdvancedEntry({ basic: "happy", advanced: "elated", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [] }, { persist: false });
    hooks.addBasicAdvancedEntry({ basic: "sad", advanced: "sorrowful", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [] }, { persist: false });
    const document = window.document;
    const happyEntry = hooks.basicAdvancedData.find((e) => e.basic === "happy");
    hooks.renderBasicAdvancedPair(happyEntry);
    document.querySelector("#basicAdvancedEntry .lb-edit-btn").click();

    document.getElementById("baEditBasic").value = "sad";
    document.getElementById("baEditSaveBtn").click();
    await wait(30);

    expect(document.getElementById("baEditStatus").textContent).toContain("already used");
    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(true);
    expect(hooks.basicAdvancedData.filter((e) => e.basic === "sad")).toHaveLength(1);
  });

  it("Cancel discards edits and re-renders the original entry", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    document.querySelector("#basicAdvancedEntry .lb-edit-btn").click();

    document.getElementById("baEditBasicDef").value = "should not be saved";
    document.getElementById("baEditCancelBtn").click();

    expect(document.getElementById("baEditBasic")).toBeNull();
    expect(hooks.basicAdvancedData[0].basicDef).toBeNull();
    expect(document.querySelector("#basicAdvancedEntry .lb-edit-btn")).not.toBeNull();
  });

  it("Delete removes the entry once unlocked, after confirmation", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    window.confirm = () => true;
    document.querySelector("#basicAdvancedEntry .lb-delete-btn").click();
    await wait(30);

    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(false);
  });

  it("Delete does nothing if the confirmation is declined", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    window.confirm = () => false;
    document.querySelector("#basicAdvancedEntry .lb-delete-btn").click();
    await wait(30);

    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(true);
  });
});

describe("Word Bank — Tagalog → English (manual-only, no online lookup)", () => {
  it("renders the add box with two plain inputs and a Save button — no modal involved", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("tagalogEnglishAddBox")).not.toBeNull();
    expect(document.getElementById("tagalogEnglishAddTagalogInput")).not.toBeNull();
    expect(document.getElementById("tagalogEnglishAddEnglishInput")).not.toBeNull();
    expect(document.getElementById("tagalogEnglishAddBtn")).not.toBeNull();
    expect(document.getElementById("tagalogEnglishAddBtn").textContent).toContain("Save");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("tagalogEnglishAddTagalogInput").value = "tiyaga";
    document.getElementById("tagalogEnglishAddEnglishInput").value = "perseverance";
    document.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);
    expect(document.getElementById("tagalogEnglishAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.tagalogEnglishData.some((e) => e.tagalog === "tiyaga")).toBe(false);
  });

  it("requires both the Tagalog and English word before saving", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("tagalogEnglishAddTagalogInput").value = "tiyaga";
    // English word left blank.
    document.getElementById("tagalogEnglishAddBtn").click();
    await wait(10);

    expect(document.getElementById("tagalogEnglishAddStatus").textContent).toContain("Please fill in");
    expect(hooks.tagalogEnglishData.some((e) => e.tagalog === "tiyaga")).toBe(false);
  });

  it("saves directly from the two inputs — no modal ever opens, null definitions and empty example arrays, and it survives a reload", async () => {
    const idb = new IDBFactory();
    const first = await loadApp({ indexedDBFactory: idb });
    const doc = first.window.document;
    doc.getElementById("tagalogEnglishAddTagalogInput").value = "tiyaga";
    doc.getElementById("tagalogEnglishAddEnglishInput").value = "perseverance";
    doc.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);

    expect(doc.getElementById("lookupModal").style.display).toBe("none");
    const saved = first.hooks.tagalogEnglishData.find((e) => e.tagalog === "tiyaga");
    expect(saved.english).toBe("perseverance");
    expect(saved.tagalogDef).toBeNull();
    expect(saved.englishExamples).toEqual([]);
    expect(doc.getElementById("tagalogEnglishAddTagalogInput").value).toBe("");
    expect(doc.getElementById("tagalogEnglishAddEnglishInput").value).toBe("");

    const second = await loadApp({ indexedDBFactory: idb });
    const reloaded = second.hooks.tagalogEnglishData.find((e) => e.tagalog === "tiyaga");
    expect(reloaded).toBeTruthy();
    expect(reloaded.english).toBe("perseverance");
  });

  it("does not duplicate a Tagalog word already in Word Bank", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addTagalogEnglishEntry({ tagalog: "tiyaga", english: "perseverance", tagalogDef: null, tagalogExamples: [], englishDef: null, englishExamples: [] }, { persist: false });

    document.getElementById("tagalogEnglishAddTagalogInput").value = "tiyaga";
    document.getElementById("tagalogEnglishAddEnglishInput").value = "something else";
    document.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);

    expect(document.getElementById("tagalogEnglishAddStatus").textContent).toContain("already in the database");
    expect(hooks.tagalogEnglishData.filter((e) => e.tagalog === "tiyaga")).toHaveLength(1);
  });
});

describe("Word Bank — Tagalog → English Edit/Delete (owner-gated)", () => {
  function seed(hooks) {
    hooks.addTagalogEnglishEntry({ tagalog: "tiyaga", english: "perseverance", tagalogDef: null, tagalogExamples: [], englishDef: null, englishExamples: [] }, { persist: false });
  }

  it("shows no Edit/Delete buttons while locked, and shows them once unlocked", async () => {
    const locked = await loadApp({ ownerUnlocked: false });
    seed(locked.hooks);
    locked.hooks.renderTagalogEnglishPair(locked.hooks.tagalogEnglishData[0]);
    expect(locked.window.document.querySelector("#tagalogEnglishEntry .lb-edit-btn")).toBeNull();

    const unlocked = await loadApp();
    seed(unlocked.hooks);
    unlocked.hooks.renderTagalogEnglishPair(unlocked.hooks.tagalogEnglishData[0]);
    expect(unlocked.window.document.querySelector("#tagalogEnglishEntry .lb-edit-btn")).not.toBeNull();
    expect(unlocked.window.document.querySelector("#tagalogEnglishEntry .lb-delete-btn")).not.toBeNull();
  });

  it("saving the edit form adds a definition and examples that weren't set at creation", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderTagalogEnglishPair(hooks.tagalogEnglishData[0]);
    document.querySelector("#tagalogEnglishEntry .lb-edit-btn").click();

    document.getElementById("teEditTagalogDef").value = "Katatagan ng loob.";
    document.getElementById("teEditTagalogExample").value = "Kailangan ng tiyaga.";
    document.getElementById("teEditEnglishDef").value = "Continued effort.";
    document.getElementById("teEditEnglishExample").value = "Perseverance pays off.";
    document.getElementById("teEditSaveBtn").click();
    await wait(30);

    const saved = hooks.tagalogEnglishData.find((e) => e.tagalog === "tiyaga");
    expect(saved.tagalogDef).toBe("Katatagan ng loob.");
    expect(saved.englishExamples).toEqual(["Perseverance pays off."]);
  });

  it("Delete removes the entry once unlocked, after confirmation", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderTagalogEnglishPair(hooks.tagalogEnglishData[0]);
    window.confirm = () => true;
    document.querySelector("#tagalogEnglishEntry .lb-delete-btn").click();
    await wait(30);

    expect(hooks.tagalogEnglishData.some((e) => e.tagalog === "tiyaga")).toBe(false);
  });
});

// Basic → Advanced and Tagalog → English are "pairing word" categories,
// same as Distinctions Words — one favorite star per PAIR (not one per
// word), saved under the pair's own unique key (entry.basic / entry.tagalog).
// See test/distinctions-words.test.js for the equivalent Distinctions
// Words coverage this mirrors.
describe("Word Bank — Basic → Advanced favorites (one star per PAIR)", () => {
  function seed(hooks) {
    hooks.addBasicAdvancedEntry({
      basic: "happy", advanced: "elated",
      basicDef: "(adjective) Feeling or showing pleasure.", basicExamples: ["I am happy today."],
      advancedDef: "(adjective) Extremely happy.", advancedExamples: ["She was elated by the news."]
    }, { persist: false });
  }

  it("shows exactly ONE ☆ star for the whole pair, not one per word", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);

    expect(document.querySelectorAll("#basicAdvancedEntry .fav-toggle")).toHaveLength(1);
  });

  it("favoriting saves the pair under its own key (entry.basic), not the advanced word's own spelling", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);

    document.querySelector("#basicAdvancedEntry .fav-toggle").click();

    expect(hooks.favoriteKeys.has("happy")).toBe(true);
    expect(hooks.favoriteKeys.has("elated")).toBe(false);
  });

  it("resolveFavoriteEntryData() resolves BOTH words' own definition/examples from the pair's key", async () => {
    const { hooks } = await loadApp();
    seed(hooks);
    const data = hooks.resolveFavoriteEntryData({ word: "happy", cat: "Basic → Advanced" });
    expect(data.word).toBe("happy");
    expect(data.meanings[0].use).toContain("pleasure");
    expect(data.pairWord).toBe("elated");
    expect(data.pairMeanings[0].use).toContain("Extremely happy");
    expect(data.divider).toBe("→");
  });

  it("resolveFavoriteEntryData() also resolves correctly when queried by the advanced word alone (Practice's 'All Available Content' source)", async () => {
    const { hooks } = await loadApp();
    seed(hooks);
    const data = hooks.resolveFavoriteEntryData({ word: "elated", cat: "Basic → Advanced" });
    expect(data.word).toBe("elated");
    expect(data.pairWord).toBe("happy");
  });

  it("isPairedFavorite() identifies a Basic → Advanced favorite as paired", async () => {
    const { hooks } = await loadApp();
    expect(hooks.isPairedFavorite({ cat: "Basic → Advanced" })).toBe(true);
  });

  it("shows up as ONE row in the Favorites tab labeled 'happy → elated'", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    document.querySelector("#basicAdvancedEntry .fav-toggle").click();

    document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await wait();

    const rows = Array.from(document.querySelectorAll("#favoritesList .search-result-item"));
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".label").textContent).toBe("happy → elated");
  });
});

describe("Word Bank — Tagalog → English favorites (one star per PAIR)", () => {
  function seed(hooks) {
    hooks.addTagalogEnglishEntry({
      tagalog: "tiyaga", english: "perseverance",
      tagalogDef: "Katatagan ng loob.", tagalogExamples: ["Kailangan ng tiyaga."],
      englishDef: "Continued effort.", englishExamples: ["Perseverance pays off."]
    }, { persist: false });
  }

  it("shows exactly ONE ☆ star for the whole pair, not one per word", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderTagalogEnglishPair(hooks.tagalogEnglishData[0]);

    expect(document.querySelectorAll("#tagalogEnglishEntry .fav-toggle")).toHaveLength(1);
  });

  it("favoriting saves the pair under its own key (entry.tagalog), not the English word's own spelling", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderTagalogEnglishPair(hooks.tagalogEnglishData[0]);

    document.querySelector("#tagalogEnglishEntry .fav-toggle").click();

    expect(hooks.favoriteKeys.has("tiyaga")).toBe(true);
    expect(hooks.favoriteKeys.has("perseverance")).toBe(false);
  });

  it("resolveFavoriteEntryData() resolves BOTH words' own definition/examples from the pair's key", async () => {
    const { hooks } = await loadApp();
    seed(hooks);
    const data = hooks.resolveFavoriteEntryData({ word: "tiyaga", cat: "Tagalog → English" });
    expect(data.word).toBe("tiyaga");
    expect(data.meanings[0].use).toBe("Katatagan ng loob.");
    expect(data.pairWord).toBe("perseverance");
    expect(data.pairMeanings[0].use).toBe("Continued effort.");
    expect(data.divider).toBe("→");
  });

  it("shows up as ONE row in the Favorites tab labeled 'tiyaga → perseverance'", async () => {
    const { window, hooks } = await loadApp();
    seed(hooks);
    const document = window.document;
    hooks.renderTagalogEnglishPair(hooks.tagalogEnglishData[0]);
    document.querySelector("#tagalogEnglishEntry .fav-toggle").click();

    document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await wait();

    const rows = Array.from(document.querySelectorAll("#favoritesList .search-result-item"));
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".label").textContent).toBe("tiyaga → perseverance");
  });
});
