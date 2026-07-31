// Integration tests for the new Word Bank tab (#panel-wordbank) — two
// manual-only categories sharing one tab via a segmented switcher:
// Basic → Advanced English and Tagalog → English. Same "no online
// lookup, everything is Owner-typed" shape as Tenses' own "Add my own
// construction" box (see tenses-add.test.js), since the whole point is
// letting the Owner type in whatever they've already researched
// elsewhere, with an optional example sentence.
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
    // Never explicitly set until activateWordBankCategory() runs — the
    // static markup just relies on the div's default block display.
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

  it("shows the manual form immediately for a new word — no online lookup step at all", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("basicAdvancedAddInput").value = "happy";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);

    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("basicAdvancedFormBasic").value).toBe("happy");
    expect(document.getElementById("basicAdvancedFormAdvanced").value).toBe("");
  });

  it("requires both the basic and advanced word before saving — the example stays optional", async () => {
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

  it("saves a pair without an example (null, not empty string), persists it, and navigates to it", async () => {
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
    expect(saved.example).toBeNull();
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("wordbank");
    expect(document.getElementById("basicAdvancedAddStatus").textContent).toContain("has been added to Word Bank");
    expect(document.getElementById("lookupModal").style.display).toBe("none");

    const stored = await VocabCache.getBasicAdvanced("happy", { indexedDB: idb });
    expect(stored.advanced).toBe("elated");
  });

  it("saves the optional example sentence when provided", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("basicAdvancedAddInput").value = "happy";
    document.getElementById("basicAdvancedAddBtn").click();
    await wait(30);

    document.getElementById("basicAdvancedFormAdvanced").value = "elated";
    document.getElementById("basicAdvancedFormExample").value = "She was elated by the good news.";
    document.getElementById("basicAdvancedAddSaveBtn").click();
    await wait(30);

    const saved = hooks.basicAdvancedData.find((e) => e.basic === "happy");
    expect(saved.example).toBe("She was elated by the good news.");
    expect(document.getElementById("basicAdvancedEntry").textContent).toContain("She was elated by the good news.");
  });

  it("does not duplicate a basic word already in Word Bank, and opens the existing pair instead", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addBasicAdvancedEntry({ basic: "happy", advanced: "elated", example: null }, { persist: false });

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
    hooks.addBasicAdvancedEntry({ basic: "happy", advanced: "elated", example: null }, { persist: false });

    hooks.runSearchPipeline("happy");
    const labels = Array.from(document.querySelectorAll("#searchResults .search-result-item .label")).map((el) => el.textContent.toLowerCase());
    expect(labels).toContain("happy");
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

  it("saves a complete pair with an example, persists it, and it survives a reload", async () => {
    const idb = new IDBFactory();
    const first = await loadApp({ indexedDBFactory: idb });
    first.window.document.getElementById("tagalogEnglishAddInput").value = "tiyaga";
    first.window.document.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);

    first.window.document.getElementById("tagalogEnglishFormEnglish").value = "perseverance";
    first.window.document.getElementById("tagalogEnglishFormExample").value = "Kailangan ng tiyaga para matuto ng bagong wika.";
    first.window.document.getElementById("tagalogEnglishAddSaveBtn").click();
    await wait(30);

    const saved = first.hooks.tagalogEnglishData.find((e) => e.tagalog === "tiyaga");
    expect(saved.english).toBe("perseverance");
    expect(saved.example).toBe("Kailangan ng tiyaga para matuto ng bagong wika.");

    const second = await loadApp({ indexedDBFactory: idb });
    const reloaded = second.hooks.tagalogEnglishData.find((e) => e.tagalog === "tiyaga");
    expect(reloaded).toBeTruthy();
    expect(reloaded.english).toBe("perseverance");
  });

  it("does not duplicate a Tagalog word already in Word Bank", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addTagalogEnglishEntry({ tagalog: "tiyaga", english: "perseverance", example: null }, { persist: false });

    document.getElementById("tagalogEnglishAddInput").value = "tiyaga";
    document.getElementById("tagalogEnglishAddBtn").click();
    await wait(30);

    expect(document.getElementById("tagalogEnglishAddStatus").textContent).toContain("already in the database");
  });
});
