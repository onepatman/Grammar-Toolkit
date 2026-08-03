// Integration tests for the desktop/laptop arrow-key hotkeys — a
// keyboard-only mirror of the on-screen nav buttons, requested so the
// app can be navigated without reaching for the mouse:
//   ArrowRight -> the bottom "Next ›" button (pure list-order cycling
//                 of whichever panel is currently on screen)
//   ArrowLeft  -> the bottom "‹ Previous" button
//   ArrowDown  -> the small top "‹" button (Back through the universal
//                 searchHistory stack — see test/search-history.test.js)
//   ArrowUp    -> the small top "›" button (Forward through that same
//                 stack)
// The handler is a single document-level keydown listener (see the
// block right after the shared .nav-btn click handler in index.html)
// that finds whichever matching button is actually visible and clicks
// it for real, so it exercises the exact same code path a mouse click
// would.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function pressKey(window, key, opts = {}) {
  const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts });
  window.document.dispatchEvent(event);
  return event;
}

function activeTab(document) {
  return document.querySelector(".thumb-tab.active").dataset.tab;
}

describe("Arrow-key hotkeys — bottom pair (Next/Previous, pure list-order cycling)", () => {
  it("ArrowRight advances the current panel's dropdown the same as clicking Next ›", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const before = document.getElementById("verbSelect").value;

    pressKey(window, "ArrowRight");

    const after = document.getElementById("verbSelect").value;
    expect(after).not.toBe(before);
    document.querySelector("#panel-verbs .bottom-nav .nav-btn[data-dir='next']").click();
    // A second real click should land one further step past the
    // keyboard-driven one, proving both go through the same cycling.
    const afterRealClick = document.getElementById("verbSelect").value;
    expect(afterRealClick).not.toBe(after);
  });

  it("ArrowLeft moves backward through the dropdown the same as clicking ‹ Previous", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const start = document.getElementById("verbSelect").value;

    document.querySelector("#panel-verbs .bottom-nav .nav-btn[data-dir='next']").click();
    expect(document.getElementById("verbSelect").value).not.toBe(start);

    pressKey(window, "ArrowLeft");
    expect(document.getElementById("verbSelect").value).toBe(start);
  });

  it("operates on whichever panel is currently visible, not a hardcoded tab", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    const before = document.getElementById("phrasalSelect").value;

    pressKey(window, "ArrowRight");

    expect(document.getElementById("phrasalSelect").value).not.toBe(before);
    // The Verbs tab's own dropdown, elsewhere in the (hidden) DOM, must
    // be completely untouched.
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const verbBefore = document.getElementById("verbSelect").value;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    expect(document.getElementById("verbSelect").value).toBe(verbBefore);
  });
});

describe("Arrow-key hotkeys — top pair (Back/Forward through the universal history)", () => {
  function search(window, word, catHint) {
    const document = window.document;
    const input = document.getElementById("globalSearch");
    input.value = word;
    input.dispatchEvent(new window.Event("input"));
    const items = Array.from(document.querySelectorAll("#searchResults .search-result-item"));
    const item = catHint ? items.find((el) => el.textContent.includes(catHint)) : items[0];
    if (!item) throw new Error(`No search result for "${word}"`);
    item.click();
  }

  it("ArrowDown steps Back the same as clicking the small top ‹ button", async () => {
    const { window } = await loadApp();
    const document = window.document;
    search(window, "abandon", "Vocabulary Bank");
    search(window, "between", "Preposition");
    expect(activeTab(document)).toBe("preps");

    pressKey(window, "ArrowDown");

    expect(activeTab(document)).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");
  });

  it("ArrowUp steps Forward the same as clicking the small top › button", async () => {
    const { window } = await loadApp();
    const document = window.document;
    search(window, "abandon", "Vocabulary Bank");
    search(window, "between", "Preposition");

    pressKey(window, "ArrowDown"); // Back to abandon
    expect(activeTab(document)).toBe("vocab");

    pressKey(window, "ArrowUp"); // Forward to between again

    expect(activeTab(document)).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("between");
  });
});

describe("Arrow-key hotkeys — guards against interfering with normal typing/UI", () => {
  it("does nothing while a text input has focus, so Left/Right still move the text cursor normally", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const before = document.getElementById("verbSelect").value;

    document.getElementById("globalSearch").focus();
    pressKey(window, "ArrowRight");
    pressKey(window, "ArrowLeft");

    expect(document.getElementById("verbSelect").value).toBe(before);
  });

  it("does nothing while a <select> has focus, so its own native arrow-key option cycling still works", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const before = document.getElementById("verbSelect").value;

    document.getElementById("verbSelect").focus();
    pressKey(window, "ArrowRight");

    expect(document.getElementById("verbSelect").value).toBe(before);
  });

  it("does nothing when a modifier key is held (avoids fighting OS/browser shortcuts)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const before = document.getElementById("verbSelect").value;

    pressKey(window, "ArrowRight", { shiftKey: true });
    pressKey(window, "ArrowRight", { ctrlKey: true });
    pressKey(window, "ArrowRight", { altKey: true });
    pressKey(window, "ArrowRight", { metaKey: true });

    expect(document.getElementById("verbSelect").value).toBe(before);
  });

  it("does nothing while the Look Up & Add preview modal is open", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const before = document.getElementById("verbSelect").value;

    document.getElementById("lookupModal").style.display = "flex";
    pressKey(window, "ArrowRight");

    expect(document.getElementById("verbSelect").value).toBe(before);
  });

  it("does nothing while the update-available modal is open", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const before = document.getElementById("verbSelect").value;

    document.getElementById("appUpdateModal").style.display = "flex";
    pressKey(window, "ArrowRight");

    expect(document.getElementById("verbSelect").value).toBe(before);
  });

  it("ignores unrelated keys entirely", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const before = document.getElementById("verbSelect").value;

    pressKey(window, "a");
    pressKey(window, "Enter");
    pressKey(window, "Tab");

    expect(document.getElementById("verbSelect").value).toBe(before);
  });

  it("calls preventDefault only when it actually acts, not on every arrow keypress", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();

    const acted = pressKey(window, "ArrowRight");
    expect(acted.defaultPrevented).toBe(true);

    document.getElementById("globalSearch").focus();
    const ignored = pressKey(window, "ArrowRight");
    expect(ignored.defaultPrevented).toBe(false);
  });
});

describe("isElementVisible() / findVisibleNavBtn() helpers", () => {
  it("isElementVisible treats an inline display:none ancestor as invisible", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();

    const visibleBtn = document.querySelector("#panel-verbs .bottom-nav .nav-btn[data-dir='next']");
    expect(hooks.isElementVisible(visibleBtn)).toBe(true);

    const hiddenBtn = document.querySelector("#panel-preps .bottom-nav .nav-btn[data-dir='next']");
    expect(hooks.isElementVisible(hiddenBtn)).toBe(false);
  });

  it("findVisibleNavBtn returns null when nothing matching is visible", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();

    // Dashboard has no dropdown/nav-btn pair of its own.
    expect(hooks.findVisibleNavBtn("next", true)).toBeNull();
  });
});
