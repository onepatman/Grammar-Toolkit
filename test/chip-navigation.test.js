// Regression coverage for a bug where clicking a synonym/antonym chip
// whose word wasn't indexed anywhere locally would open the search
// results dropdown and then have it immediately closed again by the
// document-level "click outside the search bar" listener — since a
// chip lives outside .search-bar, that listener fired right after and
// undid the chip's own click handler on the very same click event.
// Loads the real index.html in jsdom and dispatches real DOM clicks so
// the actual event-bubbling interaction between the two listeners is
// exercised, not just the underlying functions in isolation.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

const { window, hooks } = await loadApp();
const document = window.document;

function openVocabEntry(word) {
  hooks.runSearchPipeline(word);
  const match = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
    .find((el) => el.textContent.includes("Vocabulary Bank"));
  if (!match) throw new Error(`No Vocabulary Bank search result for "${word}"`);
  match.click();
}

describe("clicking a synonym/antonym chip for a word not indexed anywhere locally", () => {
  it("is not itself an exact match anywhere (sanity check for the fixture this test relies on)", () => {
    expect(hooks.wordIndexMap.has("forsake")).toBe(false);
  });

  it("keeps the search results dropdown visible instead of it flashing open and closing", () => {
    openVocabEntry("abandon");
    const chip = Array.from(document.querySelectorAll("#vocabEntry .word-chips .clickable"))
      .find((el) => el.dataset.word === "forsake");
    expect(chip).toBeTruthy();

    chip.click();

    expect(document.getElementById("globalSearch").value).toBe("forsake");
    expect(document.getElementById("searchResults").classList.contains("show")).toBe(true);
    expect(document.getElementById("searchResults").textContent.length).toBeGreaterThan(0);
  });

  it("still lets an exact local match jump straight to its entry, unaffected by the fix", () => {
    openVocabEntry("above");
    const chip = Array.from(document.querySelectorAll("#vocabEntry .word-chips .clickable"))
      .find((el) => el.dataset.word === "under");
    expect(chip).toBeTruthy();
    expect(hooks.wordIndexMap.has("under")).toBe(true);

    chip.click();

    expect(document.getElementById("vocabEntry").innerHTML).toContain("under");
  });
});
