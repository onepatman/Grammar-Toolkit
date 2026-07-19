// Integration tests for the two INDEPENDENT Previous/Next navigation
// systems, deliberately kept apart per the app's design:
//   - The small "‹ / ›" buttons BESIDE each dropdown follow the CONTEXT
//     stack (searchHistory) — a browser-style Back/Forward through every
//     entry the user has actually landed on: search results, online-
//     lookup previews, synonym/antonym/related-word chips, favorites,
//     Study Mode, etc.
//   - The "‹ Previous" / "Next ›" buttons at the BOTTOM of each panel
//     follow the TYPED-SEARCH stack (typedSearchHistory) — a separate
//     Back/Forward through ONLY the words the user explicitly searched
//     for via the global search box (typed a query and clicked a
//     result, or picked a recently-viewed suggestion). A synonym/
//     antonym/related-word chip hop never touches this stack, so it
//     stays a clean Word A -> B -> C sequence exactly matching what was
//     actually searched — see navigateToEntry()'s `isExplicitSearch`
//     flag in index.html.
// Loads the real index.html in jsdom and dispatches real DOM clicks so
// the actual event wiring is exercised.
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

describe("top nav-btn (beside each dropdown) follows the context stack", () => {
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

describe("bottom nav-btn follows the typed-search stack once an explicit search has happened", () => {
  it("replays Word A -> B -> C exactly as searched, independent of the context stack", async () => {
    const { window: freshWindow } = await loadApp();
    const freshDocument = freshWindow.document;
    function search(word, catHint) {
      const input = freshDocument.getElementById("globalSearch");
      input.value = word;
      input.dispatchEvent(new freshWindow.Event("input"));
      const items = Array.from(freshDocument.querySelectorAll("#searchResults .search-result-item"));
      const item = catHint ? items.find((el) => el.textContent.includes(catHint)) : items[0];
      item.click();
    }
    const headword = () => freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent;

    search("abandon", "Vocabulary Bank");
    search("above", "Vocabulary Bank");
    search("accept", "Vocabulary Bank");
    expect(headword()).toBe("accept");

    const prevBtn = () => freshDocument.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='prev']");
    const nextBtn = () => freshDocument.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']");

    prevBtn().click();
    expect(headword()).toBe("above");
    prevBtn().click();
    expect(headword()).toBe("abandon");
    // No wraparound at the oldest entry.
    prevBtn().click();
    expect(headword()).toBe("abandon");

    nextBtn().click();
    expect(headword()).toBe("above");
    nextBtn().click();
    expect(headword()).toBe("accept");
    // No wraparound at the newest entry.
    nextBtn().click();
    expect(headword()).toBe("accept");
  });

  it("falls back to the panel's own list order before any explicit search has happened", async () => {
    const { window: freshWindow } = await loadApp();
    const freshDocument = freshWindow.document;
    const before = freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent;
    freshDocument.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    const after = freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(before).toBe("abandon");
    expect(after).toBe("about");
  });

  it("a synonym/antonym chip hop is NOT recorded in the typed-search stack, so bottom nav ignores it", async () => {
    const { window: freshWindow, hooks } = await loadApp();
    const freshDocument = freshWindow.document;
    function search(word, catHint) {
      const input = freshDocument.getElementById("globalSearch");
      input.value = word;
      input.dispatchEvent(new freshWindow.Event("input"));
      const items = Array.from(freshDocument.querySelectorAll("#searchResults .search-result-item"));
      const item = catHint ? items.find((el) => el.textContent.includes(catHint)) : items[0];
      item.click();
    }

    search("abandon", "Vocabulary Bank");
    const typedLengthAfterSearch = hooks.getTypedSearchHistory().length;
    expect(typedLengthAfterSearch).toBe(1);

    freshDocument.querySelector('.thumb-tab[data-tab="langbank"]').click();
    const chip = Array.from(freshDocument.querySelectorAll("#phrasalEntry .word-chips .clickable"))
      .find((el) => el.dataset.word === "proceed");
    expect(chip).toBeTruthy();
    chip.click();
    expect(freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("proceed");

    // The chip hop updated the context stack, but NOT the typed-search
    // stack — bottom nav still only knows about "abandon".
    expect(hooks.getTypedSearchHistory().length).toBe(typedLengthAfterSearch);
    freshDocument.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='prev']").click();
    expect(freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");
  });
});

describe("top nav-btn falls back to list order before any navigation has happened", () => {
  it("behaves exactly like the bottom nav-btn on a fresh page with no history", async () => {
    const { window: freshWindow } = await loadApp();
    const freshDocument = freshWindow.document;
    const before = freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent;
    freshDocument.querySelector("#panel-vocab .controls .nav-btn[data-dir='next']").click();
    const after = freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(before).toBe("abandon");
    expect(after).toBe("about");
  });
});

// Regression coverage for a reported bug: clicking a synonym/antonym chip
// to jump to a related word "lost" the place the user came from, because
// only the DESTINATION of a jump was ever recorded in searchHistory — the
// ORIGIN was never captured unless it had itself already been reached via
// a tracked path (a search, another chip, etc). So the very first hop
// away from an entry reached by plain browsing (tab clicks, dropdown
// cycling — never a search) left searchHistory with nothing to step back
// to, and the top Previous button silently did nothing.
describe("top nav-btn supports context-aware back navigation across chip clicks", () => {
  it("remembers the exact Language Bank entry and category the user came from, even though it was never searched for", async () => {
    const { window: freshWindow } = await loadApp();
    const freshDocument = freshWindow.document;

    // Reach Language Bank > Phrasal Verbs > "move on" by plain tab
    // browsing only — never via search, so nothing has been pushed to
    // searchHistory yet.
    freshDocument.querySelector('.thumb-tab[data-tab="langbank"]').click();
    expect(freshDocument.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(freshDocument.getElementById("langbank-phrasal").style.display).not.toBe("none");
    expect(freshDocument.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("move on");

    // Click its synonym chip "proceed" — this is the untracked-origin hop.
    const chip = Array.from(freshDocument.querySelectorAll("#phrasalEntry .word-chips .clickable"))
      .find((el) => el.dataset.word === "proceed");
    expect(chip).toBeTruthy();
    chip.click();

    expect(freshDocument.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("proceed");

    // The top Previous button (beside the Vocab dropdown) must now be
    // able to step back to "move on" in the Language Bank's Phrasal
    // Verbs category — not a no-op, and not plain list-order cycling.
    freshDocument.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();

    expect(freshDocument.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(freshDocument.getElementById("langbank-phrasal").style.display).not.toBe("none");
    expect(freshDocument.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("move on");

    // And Next should return forward to "proceed" on Vocab again.
    freshDocument.querySelector("#panel-langbank .controls .nav-btn[data-dir='next']").click();
    expect(freshDocument.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("proceed");
  });

  it("does not break the bottom nav-btn's plain list-order cycling on the same panel", async () => {
    const { window: freshWindow } = await loadApp();
    const freshDocument = freshWindow.document;

    freshDocument.querySelector('.thumb-tab[data-tab="langbank"]').click();
    // Move to the second phrasal entry ("pass out") using the bottom
    // pair, which must always stay pure list-order regardless of any
    // history bookkeeping introduced for the top pair.
    freshDocument.querySelector("#panel-langbank .bottom-nav .nav-btn[data-dir='next']").click();
    expect(freshDocument.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("pass out");

    const chip = Array.from(freshDocument.querySelectorAll("#phrasalEntry .word-chips .clickable"))
      .find((el) => el.dataset.word === "faint");
    expect(chip).toBeTruthy();
    chip.click();
    expect(freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("faint");

    // Top Previous goes back to the exact origin, "pass out".
    freshDocument.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    expect(freshDocument.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(freshDocument.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("pass out");

    // Bottom pair on Language Bank still just cycles list order from here,
    // unaffected by the back/forward stack.
    freshDocument.querySelector("#panel-langbank .bottom-nav .nav-btn[data-dir='prev']").click();
    expect(freshDocument.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("move on");
  });

  it("does not duplicate an entry in history when navigating away and immediately back to the same spot", async () => {
    const { window: freshWindow, hooks } = await loadApp();
    const freshDocument = freshWindow.document;

    freshDocument.querySelector('.thumb-tab[data-tab="langbank"]').click();
    const chip = Array.from(freshDocument.querySelectorAll("#phrasalEntry .word-chips .clickable"))
      .find((el) => el.dataset.word === "proceed");
    chip.click();

    const historyAfterOneHop = hooks.getSearchHistory().length;
    expect(historyAfterOneHop).toBe(2); // ["move on", "proceed"]

    freshDocument.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    // Going back is a pointer move, not a new push — length unchanged.
    expect(hooks.getSearchHistory().length).toBe(historyAfterOneHop);
  });

  // Regression coverage for the reported bug: getCurrentlyDisplayedItem()
  // had no branch for panel-distinctions (added after this context-stack
  // mechanism was originally built), so it silently fell through to
  // wordIndexMap.get(key) — which can resolve to the WRONG entry when the
  // same word exists in more than one category — corrupting the origin
  // captured for the very first hop away from a Distinctions Words entry.
  it("remembers the exact Distinctions Words pair the user came from, even when the word also exists elsewhere", async () => {
    const { window: freshWindow, hooks } = await loadApp();
    const freshDocument = freshWindow.document;

    // Reach the built-in "Achieve vs Attain" pair (the default first entry)
    // by plain tab browsing only — never via search or the add form, so
    // nothing has been pushed to searchHistory yet, same as the Language
    // Bank test above.
    freshDocument.querySelector('.thumb-tab[data-tab="distinctions"]').click();
    expect(freshDocument.querySelector(".thumb-tab.active").dataset.tab).toBe("distinctions");
    expect(freshDocument.getElementById("distinctionsSelect").value).toBe("Achieve vs Attain");

    // "comply" is one of this pair's synonym chips, and it's ALSO an
    // ordinary local Vocabulary Bank word — exactly the ambiguous-word
    // case that used to resolve to the wrong entry via a bare
    // wordIndexMap.get() fallback.
    const chip = Array.from(freshDocument.querySelectorAll("#distinctionsEntry .word-chips .clickable"))
      .find((el) => el.dataset.word === "accomplish");
    expect(chip).toBeTruthy();
    chip.click();

    expect(freshDocument.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent.toLowerCase()).toBe("accomplish");

    freshDocument.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();

    expect(freshDocument.querySelector(".thumb-tab.active").dataset.tab).toBe("distinctions");
    expect(freshDocument.getElementById("distinctionsSelect").value).toBe("Achieve vs Attain");
    expect(hooks.getSearchHistory().length).toBe(2); // ["Achieve vs Attain", "comply"]

    // And Next returns forward to "comply" on Vocab again.
    freshDocument.querySelector("#panel-distinctions .controls .nav-btn[data-dir='next']").click();
    expect(freshDocument.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(freshDocument.getElementById("vocabEntry").querySelector(".headword").textContent.toLowerCase()).toBe("accomplish");
  });
});
