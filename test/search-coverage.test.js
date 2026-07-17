// Regression coverage for a bug where a word with no exact local match
// (e.g. "press") never got an online lookup because some OTHER local
// word happened to contain it as a substring (e.g. "express" contains
// "press"), so the pipeline stopped at local results and never checked
// online. Now the exact word is still looked up online in the
// background whenever there's no exact local match, and the result is
// appended to whatever local matches were already shown.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("online lookup runs even when a partial local match exists", () => {
  it("augments local substring matches with the online result for the exact typed word", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    // Sanity check the fixture this test relies on: "press" has no exact
    // local match, but does substring-match "express".
    expect(hooks.wordIndexMap.has("press")).toBe(false);
    expect(hooks.searchIndex.some((i) => i.label.toLowerCase() === "express")).toBe(true);

    window.OnlineLookup.fetchOnlineDefinition = async (word) => {
      if (word !== "press") return null;
      return window.OnlineLookup.normalizeDictionaryResponse([
        { word: "press", meanings: [{ partOfSpeech: "verb", definitions: [
          { definition: "To apply steady force against something.", example: "She pressed the button." }
        ] }] }
      ], "press");
    };

    hooks.runSearchPipeline("press");
    // Local substring match ("express") shows immediately, synchronously.
    expect(document.getElementById("searchResults").textContent).toContain("express");
    expect(document.getElementById("searchResults").textContent).not.toContain("Online dictionary");

    await wait(600); // past the 350ms debounce + the mocked fetch resolving

    const resultsText = document.getElementById("searchResults").textContent;
    expect(resultsText).toContain("express");
    expect(resultsText).toContain("press");
    // The online result is adopted into the Vocabulary Bank immediately
    // (see test/vocab-cache-integration.test.js) — no separate "Online
    // dictionary" label, indistinguishable from a local match.
    expect(resultsText).not.toContain("Online dictionary");
    expect(document.getElementById("searchResults").textContent).toContain("Vocabulary Bank");
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
});
