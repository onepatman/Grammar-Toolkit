// Integration tests for the Favorites feature — the ☆/★ toggle on
// entry headwords, the Favorites tab, and persistence across sessions.
// Loads the real index.html in jsdom and dispatches real DOM clicks.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 40) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openVocabEntry(hooks, document, word) {
  hooks.runSearchPipeline(word);
  const match = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
    .find((el) => el.textContent.includes("Vocabulary Bank"));
  match.click();
}

async function openFavoritesTab(document) {
  document.querySelector('.thumb-tab[data-tab="favorites"]').click();
  await wait(); // renderFavoritesTab() reads from IndexedDB asynchronously
}

describe("favorite toggle on an entry", () => {
  it("starts as an outline star and becomes filled after clicking", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openVocabEntry(hooks, document, "abandon");

    const toggle = document.querySelector("#vocabEntry .fav-toggle");
    expect(toggle.textContent).toBe("☆");
    expect(toggle.classList.contains("active")).toBe(false);

    toggle.click();
    expect(toggle.textContent).toBe("★");
    expect(toggle.classList.contains("active")).toBe(true);
  });

  it("clicking again removes it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openVocabEntry(hooks, document, "abandon");

    const toggle = document.querySelector("#vocabEntry .fav-toggle");
    toggle.click();
    toggle.click();
    expect(toggle.textContent).toBe("☆");
    expect(toggle.classList.contains("active")).toBe(false);
  });

  it("appears on verb, preposition, and word-family entries too, not just Vocabulary Bank", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    hooks.runSearchPipeline("between");
    Array.from(document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("Preposition"))
      .click();
    expect(document.querySelector("#prepEntry .fav-toggle")).toBeTruthy();

    document.getElementById("familySelect").dispatchEvent(new window.Event("change"));
    expect(document.querySelector("#familyEntry .fav-toggle")).toBeTruthy();
  });
});

describe("Favorites tab", () => {
  it("shows an empty state with nothing favorited", async () => {
    const { window } = await loadApp();
    const document = window.document;
    await openFavoritesTab(document);
    expect(document.getElementById("favoritesList").textContent).toContain("No favorites yet");
  });

  it("lists a favorited word and lets you click through to its entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openVocabEntry(hooks, document, "abandon");
    document.querySelector("#vocabEntry .fav-toggle").click();

    await openFavoritesTab(document);
    const row = document.querySelector("#favoritesList .search-result-item");
    expect(row.textContent).toContain("abandon");

    row.click();
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");
  });

  it("removing a favorite from the list itself takes it out immediately", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openVocabEntry(hooks, document, "abandon");
    document.querySelector("#vocabEntry .fav-toggle").click();

    await openFavoritesTab(document);
    document.querySelector("#favoritesList .fav-toggle").click();
    await wait(); // the toggle handler re-renders the list, also asynchronously
    expect(document.getElementById("favoritesList").textContent).toContain("No favorites yet");
  });

  it("lists multiple favorites newest first", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    openVocabEntry(hooks, document, "abandon");
    document.querySelector("#vocabEntry .fav-toggle").click();
    await wait(5); // ensure distinct addedAt timestamps so ordering is deterministic
    openVocabEntry(hooks, document, "above");
    document.querySelector("#vocabEntry .fav-toggle").click();

    await openFavoritesTab(document);
    const labels = Array.from(document.querySelectorAll("#favoritesList .label")).map((el) => el.textContent);
    expect(labels).toEqual(["above", "abandon"]);
  });
});

describe("Favorites tab — 'All' category collapsible groups", () => {
  // The plain flat list only got hard to scan once a favorite from a
  // SECOND category existed — grouping under "All" is what an Excel-style
  // collapse toggle is actually for, so these tests favorite one
  // Vocabulary Bank word and one Word Family entry to get two groups.
  function favoriteVocabularyBankWord(hooks, document, word) {
    openVocabEntry(hooks, document, word);
    document.querySelector("#vocabEntry .fav-toggle").click();
  }

  function favoriteWordFamilyEntry(window, document) {
    document.getElementById("familySelect").dispatchEvent(new window.Event("change"));
    document.querySelector("#familyEntry .fav-toggle").click();
  }

  it("splits the 'All' list into one collapsible section per category, each with its own count", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocabularyBankWord(hooks, document, "abandon");
    favoriteWordFamilyEntry(window, document);

    await openFavoritesTab(document);
    const sections = document.querySelectorAll("#favoritesList .favorites-group-section");
    expect(sections.length).toBe(2);

    const names = Array.from(document.querySelectorAll("#favoritesList .favorites-group-name"))
      .map((el) => el.textContent)
      .sort();
    expect(names).toEqual(["Vocabulary Bank", "Word Family"]);

    document.querySelectorAll("#favoritesList .favorites-group-count").forEach((el) => {
      expect(el.textContent).toBe("1");
    });

    // Both groups start expanded — the "−" toggle, and no rows hidden.
    document.querySelectorAll("#favoritesList .favorites-group-toggle").forEach((btn) => {
      expect(btn.textContent).toBe("−");
    });
    document.querySelectorAll("#favoritesList .favorites-group-body").forEach((body) => {
      expect(body.classList.contains("collapsed")).toBe(false);
    });
  });

  it("collapsing a group's toggle hides its rows without touching the favorites underneath", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocabularyBankWord(hooks, document, "abandon");
    favoriteWordFamilyEntry(window, document);

    await openFavoritesTab(document);
    const vocabHead = Array.from(document.querySelectorAll("#favoritesList .favorites-group-head"))
      .find((el) => el.dataset.cat === "Vocabulary Bank");
    vocabHead.click();
    await wait(); // the toggle handler re-renders the list asynchronously

    const vocabSection = document.querySelector('#favoritesList .favorites-group-section[data-cat="Vocabulary Bank"]');
    expect(vocabSection.querySelector(".favorites-group-toggle").textContent).toBe("+");
    expect(vocabSection.querySelector(".favorites-group-body").classList.contains("collapsed")).toBe(true);
    // Collapsed, not deleted — the row is still in the DOM...
    expect(vocabSection.querySelector(".search-result-item")).not.toBeNull();
    // ...and the favorite itself is still active.
    expect(hooks.favoriteKeys.has("abandon")).toBe(true);

    // The other group is untouched.
    const familySection = document.querySelector('#favoritesList .favorites-group-section[data-cat="Word Family"]');
    expect(familySection.querySelector(".favorites-group-toggle").textContent).toBe("−");
    expect(familySection.querySelector(".favorites-group-body").classList.contains("collapsed")).toBe(false);
  });

  it("keeps a collapsed group collapsed across re-renders (persisted, like the reviewed-set)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocabularyBankWord(hooks, document, "abandon");
    favoriteWordFamilyEntry(window, document);

    await openFavoritesTab(document);
    document.querySelector('#favoritesList .favorites-group-head[data-cat="Vocabulary Bank"]').click();
    await wait();

    hooks.renderFavoritesTab();
    await wait();
    const vocabSection = document.querySelector('#favoritesList .favorites-group-section[data-cat="Vocabulary Bank"]');
    expect(vocabSection.querySelector(".favorites-group-body").classList.contains("collapsed")).toBe(true);
  });

  it("shows a plain flat list with no group headers once filtered to a single category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocabularyBankWord(hooks, document, "abandon");
    favoriteWordFamilyEntry(window, document);

    await openFavoritesTab(document);
    hooks.setFavoritesFilterCat("Vocabulary Bank");
    hooks.renderFavoritesTab();
    await wait();

    expect(document.querySelectorAll("#favoritesList .favorites-group-section").length).toBe(0);
    const row = document.querySelector("#favoritesList .search-result-item");
    expect(row.textContent).toContain("abandon");
  });
});

describe("favorites persist across sessions (real IndexedDB, not mocked)", () => {
  it("a word favorited in one session is still favorited when the app reloads", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    openVocabEntry(first.hooks, first.window.document, "abandon");
    first.window.document.querySelector("#vocabEntry .fav-toggle").click();
    await wait(50);

    const { window, hooks } = await loadApp({ indexedDBFactory });
    const document = window.document;
    await openFavoritesTab(document);
    expect(document.getElementById("favoritesList").textContent).toContain("abandon");

    // Re-opening the entry should also show it as already favorited.
    openVocabEntry(hooks, document, "abandon");
    expect(document.querySelector("#vocabEntry .fav-toggle").classList.contains("active")).toBe(true);
  });
});
