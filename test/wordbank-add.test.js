// Integration tests for the Word Bank tab (#panel-wordbank) — two
// manual-only categories sharing one tab via a segmented switcher:
// Basic → Advanced English and Tagalog → English. The Add flow is
// deliberately minimal (just the two words, same shape as Distinctions
// Words' own "Word 1 / Word 2" add box) — an optional definition and
// example(s) for each side only ever show up in the Edit form, never at
// creation. Edit/Delete are owner-gated the same way Distinctions
// Words' entries are.
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
  it("renders the add box", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("basicAdvancedAddBox")).not.toBeNull();
    expect(document.getElementById("basicAdvancedAddInput")).not.toBeNull();
    expect(document.getElementById("basicAdvancedAddBtn")).not.toBeNull();
  });

  it("shows an error when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(10);
    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("basicAdvancedAddInput").value = "happy";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);
    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(false);
  });

  it("shows the manual form immediately for a new word — just the two words, no definition/example fields at this step", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("basicAdvancedAddInput").value = "happy";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);

    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("basicAdvancedFormBasic").value).toBe("happy");
    expect(document.getElementById("basicAdvancedFormAdvanced").value).toBe("");
    expect(document.getElementById("basicAdvancedFormBasicDef")).toBeNull();
    expect(document.getElementById("basicAdvancedFormAdvancedDef")).toBeNull();
    expect(document.getElementById("basicAdvancedFormBasicExample")).toBeNull();
  });

  it("requires both the basic and advanced word before saving", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("basicAdvancedAddInput").value = "happy";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);

    // Advanced word left blank.
    document.getElementById("basicAdvancedAddSaveBtn").click();
    await wait(10);

    expect(document.getElementById("basicAdvancedAddFormStatus").textContent).toContain("Please fill in");
    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(false);
  });

  it("saves a pair with null definitions and empty example arrays, persists it, and navigates to it", async () => {
    const idb = new IDBFactory();
    const { window, hooks } = await loadApp({ indexedDBFactory: idb });
    const document = window.document;
    document.getElementById("basicAdvancedAddInput").value = "happy";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);

    document.getElementById("basicAdvancedFormAdvanced").value = "elated";
    document.getElementById("basicAdvancedAddSaveBtn").click();
    await wait(30);

    const saved = hooks.basicAdvancedData.find((e) => e.basic === "happy");
    expect(saved).toBeTruthy();
    expect(saved.advanced).toBe("elated");
    expect(saved.basicDef).toBeNull();
    expect(saved.advancedDef).toBeNull();
    expect(saved.basicExamples).toEqual([]);
    expect(saved.advancedExamples).toEqual([]);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("wordbank");
    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("has been added to Word Bank");
    expect(document.getElementById("lookupModal").style.display).toBe("none");

    const stored = await VocabCache.getBasicAdvanced("happy", { indexedDB: idb });
    expect(stored.advanced).toBe("elated");
  });

  it("does not duplicate a basic word already in Word Bank, and opens the existing pair instead", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addBasicAdvancedEntry({ basic: "happy", advanced: "elated", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [] }, { persist: false });

    document.getElementById("basicAdvancedAddInput").value = "happy";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);

    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("already in the database");
    expect(document.getElementById("lookupModal").style.display).toBe("none");
  });

  it("Cancel discards the pending entry — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("basicAdvancedAddInput").value = "happy";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);

    document.getElementById("basicAdvancedAddCancelBtn").click();

    expect(document.getElementById("lookupModal").style.display).toBe("none");
    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(false);
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
  it("renders the add box", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("tagalogEnglishAddBox")).not.toBeNull();
    expect(document.getElementById("tagalogEnglishAddInput")).not.toBeNull();
    expect(document.getElementById("tagalogEnglishAddBtn")).not.toBeNull();
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("tagalogEnglishAddInput").value = "tiyaga";
    document.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);
    expect(document.getElementById("tagalogEnglishAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.tagalogEnglishData.some((e) => e.tagalog === "tiyaga")).toBe(false);
  });

  it("shows just the two words in the add form — no definition/example fields at this step", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("tagalogEnglishAddInput").value = "tiyaga";
    document.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);

    expect(document.getElementById("tagalogEnglishFormTagalog").value).toBe("tiyaga");
    expect(document.getElementById("tagalogEnglishFormTagalogDef")).toBeNull();
    expect(document.getElementById("tagalogEnglishFormEnglishDef")).toBeNull();
  });

  it("requires both the Tagalog and English word before saving", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("tagalogEnglishAddInput").value = "tiyaga";
    document.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);

    document.getElementById("tagalogEnglishAddSaveBtn").click();
    await wait(10);

    expect(document.getElementById("tagalogEnglishAddFormStatus").textContent).toContain("Please fill in");
    expect(hooks.tagalogEnglishData.some((e) => e.tagalog === "tiyaga")).toBe(false);
  });

  it("saves a pair with null definitions and empty example arrays, and it survives a reload", async () => {
    const idb = new IDBFactory();
    const first = await loadApp({ indexedDBFactory: idb });
    first.window.document.getElementById("tagalogEnglishAddInput").value = "tiyaga";
    first.window.document.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);

    first.window.document.getElementById("tagalogEnglishFormEnglish").value = "perseverance";
    first.window.document.getElementById("tagalogEnglishAddSaveBtn").click();
    await wait(30);

    const saved = first.hooks.tagalogEnglishData.find((e) => e.tagalog === "tiyaga");
    expect(saved.english).toBe("perseverance");
    expect(saved.tagalogDef).toBeNull();
    expect(saved.englishExamples).toEqual([]);

    const second = await loadApp({ indexedDBFactory: idb });
    const reloaded = second.hooks.tagalogEnglishData.find((e) => e.tagalog === "tiyaga");
    expect(reloaded).toBeTruthy();
    expect(reloaded.english).toBe("perseverance");
  });

  it("does not duplicate a Tagalog word already in Word Bank", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addTagalogEnglishEntry({ tagalog: "tiyaga", english: "perseverance", tagalogDef: null, tagalogExamples: [], englishDef: null, englishExamples: [] }, { persist: false });

    document.getElementById("tagalogEnglishAddInput").value = "tiyaga";
    document.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);

    expect(document.getElementById("tagalogEnglishAddStatus").textContent).toContain("already in the database");
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
