// Integration tests that load the real index.html in jsdom (see
// test/helpers/load-app.js) and exercise the actual search pipeline —
// bilingual (Tagalog) search, "did you mean" suggestions, and the
// searchAndNavigate() path used by clickable synonym/antonym chips.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

const { window, hooks } = await loadApp();
const document = window.document;

function searchResultsText() {
  return document.getElementById("searchResults").textContent;
}

describe("Tagalog → English search index", () => {
  it("indexes each split term from a vocab entry's tagalog field", () => {
    const abandonEntries = hooks.searchIndex.filter((i) => i.cat === "Tagalog → abandon");
    expect(abandonEntries.map((i) => i.label)).toEqual(["iwan", "talikuran"]);
  });

  it("every indexed Tagalog term resolves back to a real vocabData entry", () => {
    const tagalogEntries = hooks.searchIndex.filter((i) => i.cat.startsWith("Tagalog → "));
    expect(tagalogEntries.length).toBeGreaterThan(0);
    tagalogEntries.forEach((entry) => {
      const englishWord = entry.cat.replace("Tagalog → ", "");
      expect(hooks.vocabData.some((v) => v.w === englishWord)).toBe(true);
    });
  });

  it("indexes a Tagalog term with no separator as a single phrase", () => {
    expect(hooks.searchIndex.some((i) => i.label === "tungkol sa" && i.cat === "Tagalog → about")).toBe(true);
  });
});

describe("runSearchPipeline — bilingual + fuzzy suggestions", () => {
  it("finds the English entry when searching by its Tagalog translation", () => {
    hooks.runSearchPipeline("tanggapin");
    expect(searchResultsText()).toContain("tanggapin");
    expect(searchResultsText()).toContain("Tagalog → accept");
  });

  it("navigating a Tagalog search result opens the correct English Vocabulary Bank entry", () => {
    hooks.runSearchPipeline("tanggapin");
    const item = document.querySelector("#searchResults .search-result-item");
    expect(item).not.toBeNull();
    item.click();
    expect(document.getElementById("vocabEntry").innerHTML).toContain("accept");
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
  });

  it("suggests a close match ('did you mean') for a misspelled local word instead of an empty result", () => {
    hooks.runSearchPipeline("abandn"); // missing the second "o" in "abandon"
    expect(searchResultsText()).toContain("Did you mean?");
    expect(searchResultsText()).toContain("abandon");
  });

  it("falls back to 'No matches' for a query with nothing close locally and no network", () => {
    hooks.runSearchPipeline("qzxjkvw");
    expect(searchResultsText()).toContain("No matches");
  });
});

describe("searchAndNavigate — used by clickable synonym/antonym chips", () => {
  it("jumps straight to an exact match found anywhere in the app", () => {
    hooks.searchAndNavigate("above"); // an exact vocabData headword
    expect(document.getElementById("vocabEntry").innerHTML).toContain("above");
  });

  it("falls back to the search pipeline (with fuzzy suggestions) for an unknown word", () => {
    hooks.searchAndNavigate("abandn");
    expect(document.getElementById("globalSearch").value).toBe("abandn");
    expect(searchResultsText()).toContain("Did you mean?");
  });
});
