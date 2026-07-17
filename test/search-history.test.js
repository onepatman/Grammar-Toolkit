// Integration tests for the two separate Previous/Next navigation
// systems: the small buttons beside each dropdown (always list order)
// and the "‹ Previous" / "Next ›" buttons at the bottom of each panel
// (search history once any search has happened, list order before
// that). Loads the real index.html in jsdom and dispatches real DOM
// clicks so the actual event wiring is exercised.
import { describe, it, expect, beforeEach } from "vitest";
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

describe("bottom Previous/Next buttons follow search history", () => {
  it("steps back through three distinct searches across different tabs, then forward again", () => {
    searchAndClick("abandon", "Vocabulary Bank");
    expect(activeTab()).toBe("vocab");

    searchAndClick("under", "Preposition");
    expect(activeTab()).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("under");

    // "worked" isn't an exact local match anywhere by itself here except
    // as a conjugated verb form now indexed — confirm it lands on Verbs.
    searchAndClick("worked");
    expect(activeTab()).toBe("verbs");

    document.querySelector("#panel-verbs .bottom-nav .nav-btn[data-dir='prev']").click();
    expect(activeTab()).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("under");

    document.querySelector("#panel-preps .bottom-nav .nav-btn[data-dir='prev']").click();
    expect(activeTab()).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");

    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    expect(activeTab()).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("under");
  });

  it("does not go past the oldest or newest entry (no wraparound)", () => {
    document.querySelector("#panel-preps .bottom-nav .nav-btn[data-dir='prev']").click();
    expect(activeTab()).toBe("vocab");
    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='prev']").click();
    // Still on the oldest entry — clicking prev again is a no-op, not a wrap to the newest.
    expect(activeTab()).toBe("vocab");
  });

  it("starting a new search after going back truncates the forward path (browser-style)", () => {
    searchAndClick("above", "Vocabulary Bank");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("above");

    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='prev']").click();
    const beforeNewSearch = document.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(beforeNewSearch).not.toBe("above");

    searchAndClick("accept", "Vocabulary Bank");
    // "Next" should NOT bring back "above" — that forward branch was discarded.
    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).not.toBe("above");
  });
});

describe("top nav-btn (beside each dropdown) always uses list order, unaffected by search history", () => {
  it("cycles the Vocabulary Bank dropdown in its default order regardless of prior searches", () => {
    searchAndClick("abandon", "Vocabulary Bank");
    const before = document.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(before).toBe("abandon");

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='next']").click();
    const after = document.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(after).toBe("about"); // the next word alphabetically in vocabData, not a history entry
  });
});

describe("bottom nav-btn falls back to list order before any search has happened", () => {
  it("behaves exactly like the top nav-btn on a fresh page with no search history", async () => {
    const { window: freshWindow } = await loadApp();
    const freshDocument = freshWindow.document;
    const before = freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent;
    freshDocument.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    const after = freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(before).toBe("abandon");
    expect(after).toBe("about");
  });
});
