// Regression coverage for a bug where a word with no exact local match
// (e.g. "press") never got an online lookup because some OTHER local
// word happened to contain it as a substring (e.g. "express" contains
// "press"), so the pipeline stopped at local results and never checked
// online. Now the exact word is still looked up online in the
// background whenever there's no exact local match, and the result is
// appended to whatever local matches were already shown.
//
// Also covers the "Intelligent Vocabulary Bank Expansion" rework: an
// online result is shown as a temporary, NOT-YET-SAVED preview via the
// same Vocabulary Bank interface — it never auto-persists into
// vocabData/wordIndexMap/IndexedDB just from being searched. Only the
// authenticated Owner can turn it into a permanent entry, via the
// explicit "Save to Vocabulary Bank" button below Previous/Next.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stubPressLookup(window) {
  window.OnlineLookup.fetchOnlineDefinition = async (word) => {
    if (word !== "press") return null;
    return window.OnlineLookup.normalizeDictionaryResponse([
      { word: "press", meanings: [{ partOfSpeech: "verb", definitions: [
        { definition: "To apply steady force against something.", example: "She pressed the button." }
      ] }] }
    ], "press");
  };
}

// "zibblewock" has no local substring match at all (unlike "press",
// which substring-matches "express"), so runSearchPipeline takes the
// shown.length===0 branch and shows the online preview directly instead
// of appending it to a list of local matches.
function stubZibblewockLookup(window) {
  window.OnlineLookup.fetchOnlineDefinition = async (word) => {
    if (word !== "zibblewock") return null;
    return window.OnlineLookup.normalizeDictionaryResponse([
      { word: "zibblewock", meanings: [{ partOfSpeech: "noun", definitions: [
        { definition: "A made-up test word.", example: "The zibblewock sat on the shelf." }
      ] }] }
    ], "zibblewock");
  };
}

describe("online lookup runs even when a partial local match exists", () => {
  it("augments local substring matches with a NOT-YET-SAVED online result for the exact typed word", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    // Sanity check the fixture this test relies on: "press" has no exact
    // local match, but does substring-match "express".
    expect(hooks.wordIndexMap.has("press")).toBe(false);
    expect(hooks.searchIndex.some((i) => i.label.toLowerCase() === "express")).toBe(true);

    stubPressLookup(window);

    hooks.runSearchPipeline("press");
    // Local substring match ("express") shows immediately, synchronously.
    expect(document.getElementById("searchResults").textContent).toContain("express");

    await wait(600); // past the 350ms debounce + the mocked fetch resolving

    const resultsText = document.getElementById("searchResults").textContent;
    expect(resultsText).toContain("express");
    expect(resultsText).toContain("press");
    // Labeled distinctly from a real local match, and NOT silently
    // absorbed into the Vocabulary Bank just by being searched.
    expect(resultsText).toContain("Online result");
    expect(hooks.wordIndexMap.has("press")).toBe(false);
    expect(hooks.vocabData.some((v) => v.w.toLowerCase() === "press")).toBe(false);
  });

  it("leaves local matches in place if the online augment finds nothing", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    window.OnlineLookup.fetchOnlineDefinition = async () => null;

    hooks.runSearchPipeline("press");
    const before = document.getElementById("searchResults").textContent;
    expect(before).toContain("express");

    await wait(600);

    const after = document.getElementById("searchResults").textContent;
    expect(after).toContain("express");
    expect(after).not.toContain("No matches");
  });

  it("does not attempt an online lookup when there IS an exact local match", async () => {
    const { window, hooks } = await loadApp();
    let called = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { called = true; return null; };

    hooks.runSearchPipeline("above"); // exact vocabData headword
    await wait(600);

    expect(called).toBe(false);
  });

  it("a locked/non-owner device sees a read-only preview with no Save button, and searching never persists the word", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    stubZibblewockLookup(window);

    hooks.runSearchPipeline("zibblewock"); // no local match at all -> shown.length === 0 path
    await wait(600);

    expect(document.getElementById("vocabSaveArea").textContent).toContain("Online preview");
    expect(document.getElementById("saveOnlineVocabBtn")).toBeNull();
    expect(hooks.wordIndexMap.has("zibblewock")).toBe(false);
    expect(hooks.vocabData.some((v) => v.w.toLowerCase() === "zibblewock")).toBe(false);
  });

  it("the authenticated Owner sees a Save button, and clicking it is the ONLY thing that persists the word", async () => {
    const { window, hooks } = await loadApp(); // ownerUnlocked defaults to true
    const document = window.document;
    stubZibblewockLookup(window);

    expect(hooks.isDeviceUnlocked()).toBe(true);

    hooks.runSearchPipeline("zibblewock");
    await wait(600);

    const saveBtn = document.getElementById("saveOnlineVocabBtn");
    expect(saveBtn).not.toBeNull();
    expect(hooks.vocabData.some((v) => v.w.toLowerCase() === "zibblewock")).toBe(false);

    saveBtn.click();
    await wait(50);

    expect(hooks.vocabData.some((v) => v.w.toLowerCase() === "zibblewock")).toBe(true);
    expect(hooks.wordIndexMap.has("zibblewock")).toBe(true);
    expect(document.getElementById("vocabSaveArea").textContent).toContain("has been added to your Vocabulary Bank");
  });

  it("dedup: searching a word already in the Vocabulary Bank never shows a Save/preview prompt", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    // "above" is a built-in vocabData headword — already known.
    hooks.runSearchPipeline("above");
    await wait(50);

    expect(document.getElementById("vocabSaveArea").style.display).toBe("none");
  });
});
