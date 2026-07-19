// Integration tests for the two COMPLETELY INDEPENDENT navigation
// systems, per the app's design:
//   - The small "‹ / ›" BACK/FORWARD buttons beside each dropdown are
//     browser-style application navigation history (searchHistory) —
//     every tab switch, Language Bank category switch, Verb type
//     switch, dropdown selection, synonym/antonym/related-word chip,
//     search result, online-lookup preview, favorite, and Study Mode
//     card all feed this ONE ordered stack, so Back/Forward replays
//     wherever the user has actually been, browser-style (including
//     forward-history truncation once a new destination is chosen after
//     going Back).
//   - The "‹ Previous" / "Next ›" buttons at the BOTTOM of each panel
//     are PURE list-order cycling through that panel's own (now always
//     alphabetically-sorted) dropdown — completely unaffected by
//     anything visited via the top pair.
// Loads the real index.html in jsdom and dispatches real DOM clicks so
// the actual event wiring is exercised.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function activeTab(document) {
  return document.querySelector(".thumb-tab.active").dataset.tab;
}

function search(window, word, catHint) {
  const document = window.document;
  const input = document.getElementById("globalSearch");
  input.value = word;
  input.dispatchEvent(new window.Event("input"));
  const items = Array.from(document.querySelectorAll("#searchResults .search-result-item"));
  const item = catHint ? items.find((el) => el.textContent.includes(catHint)) : items[0];
  if (!item) throw new Error(`No search result for "${word}"${catHint ? ` matching "${catHint}"` : ""}`);
  item.click();
}

describe("top Back/Forward: browser-style history across chips, searches, and plain browsing", () => {
  it("steps back through three distinct searches across different tabs, then forward again", async () => {
    const { window } = await loadApp();
    const document = window.document;

    search(window, "abandon", "Vocabulary Bank");
    expect(activeTab(document)).toBe("vocab");

    search(window, "between", "Preposition");
    expect(activeTab(document)).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("between");

    search(window, "worked");
    expect(activeTab(document)).toBe("verbs");

    document.querySelector("#panel-verbs .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab(document)).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("between");

    document.querySelector("#panel-preps .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab(document)).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='next']").click();
    expect(activeTab(document)).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("between");
  });

  it("does not go past the oldest or newest entry (no wraparound)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    search(window, "abandon", "Vocabulary Bank");
    search(window, "between", "Preposition");

    document.querySelector("#panel-preps .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab(document)).toBe("vocab");
    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    // Still on the oldest entry — clicking prev again is a no-op, not a wrap to the newest.
    expect(activeTab(document)).toBe("vocab");
  });

  it("starting a new destination after going Back truncates the forward path (browser-style)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    search(window, "above", "Vocabulary Bank");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("above");

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    const beforeNewNav = document.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(beforeNewNav).not.toBe("above");

    // A completely fresh navigation (a plain tab click) after Back — the
    // discarded "above" forward branch must not resurface.
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    document.querySelector('.thumb-tab[data-tab="vocab"]').click();
    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='next']").click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).not.toBe("above");
  });

  it("a plain tab click alone is recorded as a hop, with no search or chip involved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.querySelector('.thumb-tab[data-tab="distinctions"]').click();
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();

    // Vocab (default) -> Distinctions -> Language Bank -> Verbs, each a
    // distinct destination, so each hop adds exactly one new entry.
    expect(hooks.getSearchHistory().map((h) => h.cat)).toEqual([
      "Vocabulary Bank", "Distinction Word", "Phrasal verb", "Verb (regular)"
    ]);

    document.querySelector("#panel-verbs .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab(document)).toBe("langbank");
    document.querySelector("#panel-langbank .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab(document)).toBe("distinctions");
    document.querySelector("#panel-distinctions .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab(document)).toBe("vocab");
  });

  it("a Language Bank category switch and a Verb type switch are each recorded as hops too", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    document.querySelector('#langBankCategorySeg button[data-val="idioms"]').click();
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    document.querySelector('#verbTypeSeg button[data-val="irregular"]').click();

    const cats = hooks.getSearchHistory().map((h) => h.cat);
    expect(cats).toContain("Idiom / Expression");
    expect(cats).toContain("Verb (irregular)");

    // One hop back undoes the irregular/regular type switch (still on
    // Verbs); a second hop back undoes the tab switch itself, landing
    // back on the idiom category.
    document.querySelector("#panel-verbs .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab(document)).toBe("verbs");
    document.querySelector("#panel-verbs .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab(document)).toBe("langbank");
    expect(document.getElementById("langbank-idioms").style.display).not.toBe("none");
  });

  it("picking a different word directly from a panel's own dropdown is also recorded", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    const vocabSelect = document.getElementById("vocabSelect");
    vocabSelect.value = "above";
    vocabSelect.dispatchEvent(new window.Event("change", { bubbles: true }));

    const before = hooks.getSearchHistory().length;
    expect(before).toBeGreaterThan(0);

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");
  });

  it("the Language Bank edit form's category picker (#lbEditCategory) is never tracked as navigation", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    const before = hooks.getSearchHistory().length;

    // #lbEditCategory only exists once an edit form is open on an
    // owner-added entry; simulate its presence directly since this test
    // only cares that the tracker explicitly excludes that id.
    const fakeSelect = document.createElement("select");
    fakeSelect.id = "lbEditCategory";
    document.body.appendChild(fakeSelect);
    fakeSelect.dispatchEvent(new window.Event("change", { bubbles: true }));

    expect(hooks.getSearchHistory().length).toBe(before);
  });
});

describe("bottom Previous/Next: pure list-order cycling of the current dropdown, always", () => {
  it("cycles the Vocabulary Bank dropdown in its (alphabetically sorted) order regardless of prior searches or chip hops", async () => {
    const { window } = await loadApp();
    const document = window.document;

    search(window, "abandon", "Vocabulary Bank");
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    document.querySelector('.thumb-tab[data-tab="vocab"]').click();

    document.getElementById("vocabSelect").value = "abandon";
    document.getElementById("vocabSelect").dispatchEvent(new window.Event("change", { bubbles: true }));
    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("about");
    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("above");
    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='prev']").click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("about");
  });

  it("cycles the Verbs dropdown for whichever type (regular/irregular) is active", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    document.querySelector('#verbTypeSeg button[data-val="irregular"]').click();
    // Alphabetically-sorted irregular verbs start: be, become, begin, ...
    expect(document.getElementById("verbEntry").querySelector(".headword").textContent).toBe("be");
    document.querySelector("#panel-verbs .bottom-nav .nav-btn[data-dir='next']").click();
    expect(document.getElementById("verbEntry").querySelector(".headword").textContent).toBe("become");
  });

  it("cycles a Language Bank category's dropdown independent of the top pair's history", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    // Alphabetically-sorted phrasal verbs start: back up, blow up, break down, ...
    expect(document.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("back up");

    const chip = Array.from(document.querySelectorAll("#phrasalEntry .word-chips .clickable"))[0];
    if (chip) chip.click();

    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    document.querySelector("#panel-langbank .bottom-nav .nav-btn[data-dir='next']").click();
    expect(document.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("blow up");
  });

  it("cycles the Distinctions Words dropdown in alphabetical pair order", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="distinctions"]').click();
    expect(document.getElementById("distinctionsSelect").value).toBe("Accept vs Except");
    document.querySelector("#panel-distinctions .bottom-nav .nav-btn[data-dir='next']").click();
    expect(document.getElementById("distinctionsSelect").value).toBe("Achieve vs Attain");
  });

  it("falls back to the panel's own list order before any top-nav history has happened", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const before = document.getElementById("vocabEntry").querySelector(".headword").textContent;
    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    const after = document.getElementById("vocabEntry").querySelector(".headword").textContent;
    expect(before).toBe("abandon");
    expect(after).toBe("about");
  });

  it("never touches the top pair's history stack", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const before = hooks.getSearchHistory().length;
    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    document.querySelector("#panel-vocab .bottom-nav .nav-btn[data-dir='next']").click();
    expect(hooks.getSearchHistory().length).toBe(before);
  });
});

// Regression coverage for a reported bug: clicking a synonym/antonym chip
// to jump to a related word "lost" the place the user came from, because
// only the DESTINATION of a jump was ever recorded — the ORIGIN was never
// captured unless it had itself already been reached via a tracked path.
// So the very first hop away from an entry reached by plain browsing (tab
// clicks, dropdown cycling — never a search) left nothing to step back
// to, and the top Previous button silently did nothing.
describe("top Back/Forward supports context-aware navigation across chip clicks", () => {
  it("remembers the exact Language Bank entry and category the user came from, even though it was never searched for", async () => {
    const { window } = await loadApp();
    const document = window.document;

    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    expect(activeTab(document)).toBe("langbank");
    expect(document.getElementById("langbank-phrasal").style.display).not.toBe("none");
    const startWord = document.getElementById("phrasalEntry").querySelector(".headword").textContent;

    const chip = document.querySelector("#phrasalEntry .word-chips .clickable");
    expect(chip).toBeTruthy();
    const chipWord = chip.dataset.word;
    chip.click();

    expect(activeTab(document)).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent.toLowerCase()).toBe(chipWord);

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();

    expect(activeTab(document)).toBe("langbank");
    expect(document.getElementById("langbank-phrasal").style.display).not.toBe("none");
    expect(document.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe(startWord);

    document.querySelector("#panel-langbank .controls .nav-btn[data-dir='next']").click();
    expect(activeTab(document)).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent.toLowerCase()).toBe(chipWord);
  });

  it("does not break the bottom nav-btn's plain list-order cycling on the same panel", async () => {
    const { window } = await loadApp();
    const document = window.document;

    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    document.querySelector("#panel-langbank .bottom-nav .nav-btn[data-dir='next']").click();
    const secondWord = document.getElementById("phrasalEntry").querySelector(".headword").textContent;

    const chip = document.querySelector("#phrasalEntry .word-chips .clickable");
    expect(chip).toBeTruthy();
    chip.click();
    expect(activeTab(document)).toBe("vocab");

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    expect(activeTab(document)).toBe("langbank");
    expect(document.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe(secondWord);
  });

  it("does not duplicate an entry when navigating away and immediately back to the same spot", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    // Vocab (default, untracked-until-now) -> Language Bank tab click
    // (hop 1) -> chip click (hop 2) = 3 total entries.
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    const chip = document.querySelector("#phrasalEntry .word-chips .clickable");
    chip.click();

    const historyAfterBothHops = hooks.getSearchHistory().length;
    expect(historyAfterBothHops).toBe(3);

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();
    // Going back is a pointer move, not a new push — length unchanged.
    expect(hooks.getSearchHistory().length).toBe(historyAfterBothHops);
  });

  // Regression coverage: getCurrentlyDisplayedItem() had no branch for
  // panel-distinctions (added after this mechanism was built), so it
  // silently fell through to wordIndexMap.get(key) — which can resolve
  // to the WRONG entry when the same word exists in more than one
  // category — corrupting the origin captured for the very first hop
  // away from a Distinctions Words entry.
  it("remembers the exact Distinctions Words pair the user came from, even when the word also exists elsewhere", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.querySelector('.thumb-tab[data-tab="distinctions"]').click();
    expect(activeTab(document)).toBe("distinctions");
    const startPair = document.getElementById("distinctionsSelect").value;

    // "comply" is a synonym chip on "Adhere vs Stick", and it's ALSO an
    // ordinary local Vocabulary Bank word — the ambiguous case that used
    // to resolve to the wrong entry via a bare wordIndexMap.get() fallback.
    document.getElementById("distinctionsSelect").value = "Adhere vs Stick";
    document.getElementById("distinctionsSelect").dispatchEvent(new window.Event("change", { bubbles: true }));
    const chip = Array.from(document.querySelectorAll("#distinctionsEntry .word-chips .clickable"))
      .find((el) => el.dataset.word === "comply");
    expect(chip).toBeTruthy();
    chip.click();

    expect(activeTab(document)).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent.toLowerCase()).toBe("comply");

    document.querySelector("#panel-vocab .controls .nav-btn[data-dir='prev']").click();

    expect(activeTab(document)).toBe("distinctions");
    expect(document.getElementById("distinctionsSelect").value).toBe("Adhere vs Stick");
    expect(document.getElementById("distinctionsSelect").value).not.toBe(startPair);
  });
});

describe("dropdowns stay alphabetically sorted (case-insensitive) after every mutation", () => {
  function expectFullySorted(values) {
    const lower = values.map((v) => v.toLowerCase());
    const sorted = [...lower].sort((a, b) => a.localeCompare(b));
    expect(lower).toEqual(sorted);
  }

  it("a newly-saved Vocabulary Bank word is inserted at its correct alphabetical position, not appended at the end", async () => {
    const { window, hooks } = await loadApp();
    hooks.addVocabEntry(
      { w: "Conclusion", senses: [{ use: "(noun) A final decision.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const values = Array.from(window.document.getElementById("vocabSelect").options).map((o) => o.value);
    // Not appended at the very end (a built-in word starting with a
    // later letter than "c" still exists after it)...
    expect(values[values.length - 1]).not.toBe("Conclusion");
    // ...and the whole list is genuinely sorted, not just "somewhere
    // near the middle."
    expectFullySorted(values);
  });

  it("sorting is case-insensitive", async () => {
    const { window, hooks } = await loadApp();
    hooks.addVocabEntry(
      { w: "zebra crossing", senses: [{ use: "(noun) A pedestrian crossing.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    hooks.addVocabEntry(
      { w: "Aardvark", senses: [{ use: "(noun) A burrowing mammal.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const values = Array.from(window.document.getElementById("vocabSelect").options).map((o) => o.value);
    // "Aardvark" (capital A) sorts alongside lowercase "abandon" by
    // letter, not after every lowercase word purely due to case.
    expect(values[0]).toBe("Aardvark");
    expectFullySorted(values);
  });

  it("a newly-added Language Bank entry is inserted at its correct alphabetical position", async () => {
    const { window, hooks } = await loadApp();
    hooks.addIdiomEntry(
      { w: "zoom in on", senses: [{ use: "(idiom) Focus closely on something.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const values = Array.from(window.document.getElementById("idiomsSelect").options).map((o) => o.value);
    expect(values[values.length - 1]).toBe("zoom in on");
  });

  it("a newly-added Distinctions Words pair is inserted at its correct alphabetical position", async () => {
    const { window, hooks } = await loadApp();
    hooks.addDistinctionEntry({
      w: "Zonal vs Regional",
      word1: { w: "Zonal", senses: [{ use: "(adjective) Relating to a zone.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      word2: { w: "Regional", senses: [{ use: "(adjective) Relating to a region.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      source: "online"
    }, { persist: false });
    const values = Array.from(window.document.getElementById("distinctionsSelect").options).map((o) => o.textContent);
    expect(values[values.length - 1]).toBe("Zonal vs Regional");
  });

  it("restoring cached entries from IndexedDB also lands in sorted order", async () => {
    const { window, hooks } = await loadApp();
    // vocabCacheRestorePromise already resolved by the time loadApp()
    // returns (see helpers/load-app.js) — add two more "restored" words
    // out of order and confirm the dropdown stays sorted regardless of
    // the order they were added in.
    hooks.addVocabEntry(
      { w: "wobble", senses: [{ use: "(verb) To move unsteadily.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    hooks.addVocabEntry(
      { w: "vortex", senses: [{ use: "(noun) A mass of whirling fluid.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const values = Array.from(window.document.getElementById("vocabSelect").options).map((o) => o.value);
    const idxVortex = values.indexOf("vortex");
    const idxWobble = values.indexOf("wobble");
    expect(idxVortex).toBeLessThan(idxWobble);
  });
});
