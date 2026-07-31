// Regression coverage for a bug where a word with no exact local match
// (e.g. "press") never got an online lookup because some OTHER local
// word happened to contain it as a substring (e.g. "express" contains
// "press"), so the pipeline stopped at local results and never checked
// online. Now the exact word is still looked up online in the
// background whenever there's no exact local match.
//
// Also covers the "Intelligent Vocabulary Bank Expansion" rework: an
// online result is shown as a temporary, NOT-YET-SAVED preview in the
// shared LookupModal (see renderVocabSavePreview/confirmVocabSave in
// index.html) — it never auto-persists into vocabData/wordIndexMap/
// IndexedDB just from being searched. Only the authenticated Owner can
// turn it into a permanent entry, via the modal's explicit "Save to
// Vocabulary Bank" button. A locked/non-owner device still gets to
// preview the definition (the global search bar has no unlock gate of
// its own) but sees no Save button at all — read-only.
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
// which substring-matches "express") — used for the tests below that
// don't care about that distinction, since both cases now open the
// online preview modal identically.
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
  it("opens the online preview modal for the exact typed word, even though a local substring match ('express') was already shown", async () => {
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

    // Once the online lookup resolves, the app opens the shared
    // LookupModal for "press" itself — it doesn't just add one more row
    // to the "express" results list for the user to notice and click.
    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("lookupModalTitle").textContent).toBe("press");
    expect(document.getElementById("lookupModalSubtitle").textContent).toContain("Ready to add");
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

  it("a locked/non-owner device sees a read-only preview modal with no Save button, and searching never persists the word", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    stubZibblewockLookup(window);

    hooks.runSearchPipeline("zibblewock"); // no local match at all -> shown.length === 0 path
    await wait(600);

    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("lookupModalTitle").textContent).toBe("zibblewock");
    expect(document.getElementById("lookupModalSubtitle").textContent).toContain("retrieved from an online dictionary");
    expect(document.getElementById("lookupModalSaveBtn")).toBeNull();
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

    const saveBtn = document.getElementById("lookupModalSaveBtn");
    expect(saveBtn).not.toBeNull();
    expect(hooks.vocabData.some((v) => v.w.toLowerCase() === "zibblewock")).toBe(false);

    saveBtn.click();
    await wait(50);

    expect(document.getElementById("lookupModal").style.display).toBe("none");
    expect(hooks.vocabData.some((v) => v.w.toLowerCase() === "zibblewock")).toBe(true);
    expect(hooks.wordIndexMap.has("zibblewock")).toBe(true);
    expect(document.getElementById("vocabAddStatus").textContent).toContain("has been added to your Vocabulary Bank");
  });

  it("dedup: searching a word already in the Vocabulary Bank never opens the online preview modal", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    // "above" is a built-in vocabData headword — already known.
    hooks.runSearchPipeline("above");
    await wait(50);

    expect(document.getElementById("lookupModal").style.display).not.toBe("flex");
  });

  it("does not attempt an online lookup when the word is already known via a DIFFERENT category (e.g. a Preposition), and shows that category's own tag, not Vocabulary Bank or Online Search", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let called = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { called = true; return null; };

    // "between" is a built-in Preposition, not a Vocabulary Bank word.
    expect(hooks.vocabData.some((v) => v.w.toLowerCase() === "between")).toBe(false);
    hooks.runSearchPipeline("between");
    await wait(600);

    expect(called).toBe(false);
    const match = document.querySelector("#searchResults .search-result-item");
    expect(match.querySelector(".label").textContent.toLowerCase()).toBe("between");
    expect(match.querySelector(".cat").textContent).toBe("Preposition");
    match.click();
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("between");
  });
});

describe("source tag labeling: 📚 Vocabulary Bank, only ever for a genuinely saved entry", () => {
  it("an unsaved online result appears only in the preview modal — #vocabEntry never shows it, tagged or otherwise, until it's actually saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubZibblewockLookup(window);

    hooks.runSearchPipeline("zibblewock");
    await wait(600);

    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("lookupModalTitle").textContent).toBe("zibblewock");
    const headwordEl = document.getElementById("vocabEntry").querySelector(".headword");
    expect(headwordEl ? headwordEl.textContent : null).not.toBe("zibblewock");
  });

  it("once saved via the modal, the word appears in #vocabEntry tagged '📚 Vocabulary Bank' and the modal closes", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubZibblewockLookup(window);

    hooks.runSearchPipeline("zibblewock");
    await wait(600);
    document.getElementById("lookupModalSaveBtn").click();
    await wait(50);

    expect(document.getElementById("lookupModal").style.display).toBe("none");
    const tagText = document.getElementById("vocabEntry").querySelector(".tag.ghost").textContent;
    expect(tagText).toBe("📚 Vocabulary Bank");
    expect(document.getElementById("vocabAddStatus").textContent).toContain("has been added to your Vocabulary Bank");
  });

  it("searching the same word again after saving shows the local result directly — no modal, no repeat online lookup", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubZibblewockLookup(window);

    hooks.runSearchPipeline("zibblewock");
    await wait(600);
    document.getElementById("lookupModalSaveBtn").click();
    await wait(50);

    let fetchCalledAgain = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalledAgain = true; return null; };
    hooks.runSearchPipeline("zibblewock");
    await wait(600);

    // Now a known local word — no online lookup, shown as a plain
    // clickable local match (like any other search result).
    expect(fetchCalledAgain).toBe(false);
    expect(document.getElementById("lookupModal").style.display).not.toBe("flex");
    const match = document.querySelector("#searchResults .search-result-item");
    expect(match.querySelector(".label").textContent.toLowerCase()).toBe("zibblewock");
    expect(match.querySelector(".cat").textContent).toBe("Vocabulary Bank");

    match.click();
    expect(document.getElementById("vocabEntry").querySelector(".tag.ghost").textContent).toBe("📚 Vocabulary Bank");
  });

  it("every genuine local Vocabulary Bank entry (built-in or owner-saved) is tagged '📚 Vocabulary Bank'", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    hooks.runSearchPipeline("abandon"); // a built-in Vocabulary Bank word
    document.querySelector("#searchResults .search-result-item").click();

    const tagText = document.getElementById("vocabEntry").querySelector(".tag.ghost").textContent;
    expect(tagText).toBe("📚 Vocabulary Bank");
    // The favorite-toggle/edit-delete identity underneath is unaffected —
    // still the plain "Vocabulary Bank" string, not the decorated one.
    expect(document.getElementById("vocabEntry").querySelector(".fav-toggle")).not.toBeNull();
  });
});

describe("no premature 'No matches' before an online lookup has actually run", () => {
  it("shows 'Searching online…' immediately for a brand-new word, not a false 'No matches'", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubZibblewockLookup(window);

    hooks.runSearchPipeline("zibblewock");
    // Synchronously, right after typing — before the debounce/fetch even
    // runs — the message must not claim the search already failed.
    const immediateText = document.getElementById("searchResults").textContent;
    expect(immediateText).not.toContain("No matches");
    expect(immediateText).toContain("Searching online…");

    await wait(600);
    // And it resolves to the real online result shortly after, shown in
    // the shared preview modal.
    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("lookupModalTitle").textContent).toBe("zibblewock");
  });

  it("shows the offline-specific message immediately (never 'Searching online…') when navigator.onLine is false", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });

    hooks.runSearchPipeline("zibblewock2");
    const text = document.getElementById("searchResults").textContent;
    expect(text).toContain("No matches in your offline Vocabulary Bank");
    expect(text).not.toContain("Searching online…");
  });
});
