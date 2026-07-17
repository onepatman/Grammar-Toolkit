// Integration tests for the Favorites feature — the ☆/★ toggle on
// entry headwords, the Favorites tab, and persistence across sessions.
// Loads the real index.html in jsdom and dispatches real DOM clicks.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 20) {
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

    hooks.runSearchPipeline("under");
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
    openVocabEntry(hooks, document, "above");
    document.querySelector("#vocabEntry .fav-toggle").click();

    await openFavoritesTab(document);
    const labels = Array.from(document.querySelectorAll("#favoritesList .label")).map((el) => el.textContent);
    expect(labels).toEqual(["above", "abandon"]);
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
