// Integration tests for the desktop/laptop arrow-key hotkeys — a
// keyboard-only mirror of the on-screen nav buttons, requested so the
// app can be navigated without reaching for the mouse:
//   ArrowRight -> the bottom "Next ›" button (pure list-order cycling
//                 of whichever panel is currently on screen)
//   ArrowLeft  -> the bottom "‹ Previous" button
//   ArrowUp/ArrowDown are deliberately NOT intercepted — they used to
//                 walk the top Back/Forward searchHistory stack, but
//                 that shadowed the far more expected use of those
//                 keys: scrolling the page. Left completely alone now,
//                 so native scroll applies.
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

describe("Arrow-key hotkeys — Up/Down are left alone for native page scroll", () => {
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

  it("ArrowDown no longer walks the Back/Forward history — nothing changes, nothing is prevented", async () => {
    const { window } = await loadApp();
    const document = window.document;
    search(window, "abandon", "Vocabulary Bank");
    search(window, "days", "Capitalization");
    expect(activeTab(document)).toBe("capital");

    const event = pressKey(window, "ArrowDown");

    expect(activeTab(document)).toBe("capital");
    expect(event.defaultPrevented).toBe(false);
  });

  it("ArrowUp no longer walks the Back/Forward history — nothing changes, nothing is prevented", async () => {
    const { window } = await loadApp();
    const document = window.document;
    search(window, "abandon", "Vocabulary Bank");
    search(window, "days", "Capitalization");

    const event = pressKey(window, "ArrowUp");

    expect(activeTab(document)).toBe("capital");
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves ArrowUp/ArrowDown alone even while a text input has focus", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const input = document.getElementById("globalSearch");
    input.focus();

    const downEvent = pressKey(window, "ArrowDown");
    const upEvent = pressKey(window, "ArrowUp");

    expect(downEvent.defaultPrevented).toBe(false);
    expect(upEvent.defaultPrevented).toBe(false);
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

describe("F1 hotkey — clicks whatever favorite star is currently on screen", () => {
  it("favorites the currently displayed entry, same as clicking its star", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const star = document.querySelector("#panel-verbs .fav-toggle");
    expect(star.classList.contains("active")).toBe(false);
    const word = star.dataset.word;

    pressKey(window, "F1");

    expect(hooks.favoriteKeys.has(word.trim().toLowerCase())).toBe(true);
    expect(document.querySelector("#panel-verbs .fav-toggle").classList.contains("active")).toBe(true);
  });

  it("un-favorites it again on a second press, same as clicking the star twice", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const word = document.querySelector("#panel-verbs .fav-toggle").dataset.word;

    pressKey(window, "F1");
    expect(hooks.favoriteKeys.has(word.trim().toLowerCase())).toBe(true);
    pressKey(window, "F1");

    expect(hooks.favoriteKeys.has(word.trim().toLowerCase())).toBe(false);
  });

  it("operates on whichever panel is currently visible, not a hardcoded tab", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="vocab"]').click();
    const word = document.querySelector("#panel-vocab .fav-toggle").dataset.word;

    pressKey(window, "F1");

    expect(hooks.favoriteKeys.has(word.trim().toLowerCase())).toBe(true);
  });

  it("does nothing when no favorite star is visible on the current panel", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();

    // Should not throw, and should leave nothing favorited.
    const event = pressKey(window, "F1");
    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing while a modal is open", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();
    const word = document.querySelector("#panel-verbs .fav-toggle").dataset.word;

    document.getElementById("lookupModal").style.display = "flex";
    pressKey(window, "F1");

    expect(hooks.favoriteKeys.has(word.trim().toLowerCase())).toBe(false);
  });
});

describe("Escape hotkey — clears the currently focused typing box", () => {
  it("clears the global search box while it has focus", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const input = document.getElementById("globalSearch");
    input.focus();
    input.value = "abandon";
    input.dispatchEvent(new window.Event("input"));

    pressKey(window, "Escape");

    expect(input.value).toBe("");
  });

  it("clears whichever other text input currently has focus (e.g. an Add a correction box)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const input = document.getElementById("qaWrongInput");
    input.focus();
    input.value = "He go to the site";

    pressKey(window, "Escape");

    expect(input.value).toBe("");
  });

  it("clears a focused textarea the same way", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const input = document.getElementById("qaWhyInput");
    input.focus();
    input.value = "some explanation";

    pressKey(window, "Escape");

    expect(input.value).toBe("");
  });

  it("does nothing when no text field has focus, leaving Escape free for other uses (e.g. closing the lookup modal)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.body.focus();

    const event = pressKey(window, "Escape");

    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves OTHER inputs on the page untouched — only the focused one is cleared", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("globalSearch").value = "should stay";
    const input = document.getElementById("qaWrongInput");
    input.focus();
    input.value = "should clear";

    pressKey(window, "Escape");

    expect(input.value).toBe("");
    expect(document.getElementById("globalSearch").value).toBe("should stay");
  });
});

describe("Tab key — confined to the typing boxes inside the current .quick-add-box", () => {
  it("cycles Wrong → Right → Why → (wraps back to) Wrong inside 'Add a correction example', skipping buttons", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="mistakes"]').click();
    const wrong = document.getElementById("qaWrongInput");
    const right = document.getElementById("qaRightInput");
    const why = document.getElementById("qaWhyInput");

    wrong.focus();
    let event = pressKey(window, "Tab");
    expect(document.activeElement).toBe(right);
    expect(event.defaultPrevented).toBe(true);

    event = pressKey(window, "Tab");
    expect(document.activeElement).toBe(why);

    event = pressKey(window, "Tab");
    expect(document.activeElement).toBe(wrong); // wraps around, never reaching qaAddBtn
  });

  it("Shift+Tab cycles backward, wrapping from the first field to the last", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="mistakes"]').click();
    const wrong = document.getElementById("qaWrongInput");
    const why = document.getElementById("qaWhyInput");

    wrong.focus();
    pressKey(window, "Tab", { shiftKey: true });

    expect(document.activeElement).toBe(why);
  });

  it("includes a freshly added '+ Add another example' row in the cycle immediately", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="mistakes"]').click();
    document.getElementById("qaAddExampleRowBtn").click();

    const rows = Array.from(document.querySelectorAll("#qaExampleRows .correction-example-row"));
    expect(rows).toHaveLength(2);
    const secondWrong = rows[1].querySelector(".correction-wrong-input");
    const secondRight = rows[1].querySelector(".correction-right-input");

    document.getElementById("qaRightInput").focus(); // end of the first (original) row
    pressKey(window, "Tab");
    expect(document.activeElement).toBe(secondWrong);

    pressKey(window, "Tab");
    expect(document.activeElement).toBe(secondRight);

    pressKey(window, "Tab"); // continues on to Why, not straight to a button
    expect(document.activeElement).toBe(document.getElementById("qaWhyInput"));
  });

  it("does nothing when focus isn't on a typing box inside a .quick-add-box, leaving native Tab order alone", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("globalSearch").focus();

    const event = pressKey(window, "Tab");

    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing while a button inside the box has focus, since only typing boxes are cycled", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("qaAddBtn").focus();

    const event = pressKey(window, "Tab");

    expect(event.defaultPrevented).toBe(false);
  });

  it("operates on whichever .quick-add-box the user is typing in, not a hardcoded one", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    document.querySelector('#wordBankCategorySeg button[data-val="tagalogEnglish"]').click();
    const tagalog = document.getElementById("tagalogEnglishAddTagalogInput");
    const english = document.getElementById("tagalogEnglishAddEnglishInput");

    tagalog.focus();
    pressKey(window, "Tab");

    expect(document.activeElement).toBe(english);
  });
});

describe("isElementVisible() / findVisibleNavBtn() helpers", () => {
  it("isElementVisible treats an inline display:none ancestor as invisible", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="verbs"]').click();

    const visibleBtn = document.querySelector("#panel-verbs .bottom-nav .nav-btn[data-dir='next']");
    expect(hooks.isElementVisible(visibleBtn)).toBe(true);

    const hiddenBtn = document.querySelector("#panel-capital .bottom-nav .nav-btn[data-dir='next']");
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
