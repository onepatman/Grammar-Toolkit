// Integration tests for the two separate Previous/Next navigation
// systems: the small buttons beside each dropdown (search history, like
// a browser's Back/Forward) and the "‹ Previous" / "Next ›" buttons at
// the bottom of each panel (always that panel's own list order). Loads
// the real index.html in jsdom and dispatches real DOM clicks so the
// actual event wiring is exercised.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

const { window } = await loadApp();
const document = window.document;

function searchAndClick(word, catHint) {
  const input = document.getElementById("globalSearch");
  input.value = word;
  input.dispatchEvent(new window.Event("input"));
  const items = Array.from(document.querySelectorAll("#searchResults .search-result-item"));
  const item = catHint ? items.find((el) => el.textContent.includes(catHint)) : items[0];
  if (!item) throw new Error(`No search result for "${word}"${catHint ? ` matching "${catHint}"` : ""}`);
  item.click();
}

function activeTab() {
  return document.querySelector(".thumb-tab.active").dataset.tab;
}

describe("top nav-btn (beside each dropdown) follows search history", () => {
  it("steps back through three distinct searches across different tabs, then forward again", () => {
    searchAndClick("abandon", "Vocabulary Bank");
    expect(activeTab()).toBe("vocab");

    searchAndClick("under", "Preposition");
    expect(activeTab()).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("under");

    // "worked" is indexed as a conjugated verb form now, an exact match
    // on its own — confirm it lands on Verbs.
    searchAndClick("worked");
    expect(activeTab()).toBe("verbs");

    document.querySelector("#panel-verbs .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab()).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("under");

    document.querySelector("#panel-preps .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab()).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='next']").click();
    expect(activeTab()).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("under");
  });

  it("does not go past the oldest or newest entry (no wraparound)", () => {
    document.querySelector("#panel-preps .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab()).toBe("vocab");
    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    // Still on the oldest entry — clicking prev again is a no-op, not a wrap to the newest.
    expect(activeTab()).toBe("vocab");
  });

  it("starting a new search after going back truncates the forward path (browser-style)", () => {
    searchAndClick("above", "Vocabulary Bank");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("above");

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    const beforeNewSearch = document.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(beforeNewSearch).not.toBe("above");

    searchAndClick("accept", "Vocabulary Bank");
    // "Next" should NOT bring back "above" — that forward branch was discarded.
    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='next']").click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).not.toBe("above");
  });
});

describe("bottom nav-btn always uses that panel's own list order, unaffected by search history", () => {
  it("cycles the Vocabulary Bank dropdown in its default order regardless of prior searches", () => {
    searchAndClick("abandon", "Vocabulary Bank");
    const before = document.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(before).toBe("abandon");

    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    const after = document.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(after).toBe("about"); // the next word alphabetically in vocabData, not a history entry
  });
});

describe("top nav-btn falls back to list order before any search has happened", () => {
  it("behaves exactly like the bottom nav-btn on a fresh page with no search history", async () => {
    const { window: freshWindow } = await loadApp();
    const freshDocument = freshWindow.document;
    const before = freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent;
    freshDocument.querySelector("#panel-vocab .controls .nav-btn[data-dir='next']").click();
    const after = freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(before).toBe("abandon");
    expect(after).toBe("about");
  });
});
