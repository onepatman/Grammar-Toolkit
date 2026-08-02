// Integration tests for the Favorites tab's "Summary" view — a
// continuously-numbered, checkable list of every favorited entry
// grouped by category, for reviewing/monitoring progress (as opposed
// to the "Cards" view, which browses favorites one row at a time and
// navigates to the full entry on click). See test/favorites-export.test.js
// for the underlying favorites/category-filter/resolveFavoriteEntryData()
// machinery this view reuses rather than duplicates.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openFavoritesTab(document) {
  document.querySelector('.thumb-tab[data-tab="favorites"]').click();
  await wait();
}

async function openSummaryView(document) {
  document.querySelector('#favoritesViewSeg button[data-val="summary"]').click();
  await wait();
}

function favoriteVocab(hooks, document, word) {
  hooks.runSearchPipeline(word);
  Array.from(document.querySelectorAll("#searchResults .search-result-item"))
    .find((el) => el.textContent.includes("Vocabulary Bank"))
    .click();
  document.querySelector("#vocabEntry .fav-toggle").click();
}

function favoritePhrasal(document) {
  document.querySelector('.thumb-tab[data-tab="langbank"]').click();
  document.querySelector("#phrasalEntry .fav-toggle").click();
}

describe("Favorites tab — Cards/Summary view toggle", () => {
  it("stays hidden with no favorites, same as the category filter", async () => {
    const { window } = await loadApp();
    await openFavoritesTab(window.document);
    expect(window.document.getElementById("favoritesViewSeg").style.display).toBe("none");
  });

  it("appears once there's at least one favorite, defaulting to the Cards tab active", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    await openFavoritesTab(document);

    const viewSeg = document.getElementById("favoritesViewSeg");
    expect(viewSeg.style.display).not.toBe("none");
    expect(viewSeg.querySelector('button[data-val="cards"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("favoritesList").style.display).not.toBe("none");
    expect(document.getElementById("favoritesSummary").style.display).toBe("none");
  });

  it("clicking Summary switches the visible panel and marks the Summary button active", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    await openFavoritesTab(document);

    await openSummaryView(document);

    expect(document.querySelector('#favoritesViewSeg button[data-val="summary"]').classList.contains("active")).toBe(true);
    expect(document.querySelector('#favoritesViewSeg button[data-val="cards"]').classList.contains("active")).toBe(false);
    expect(document.getElementById("favoritesList").style.display).toBe("none");
    expect(document.getElementById("favoritesSummary").style.display).not.toBe("none");
  });
});

describe("Favorites Summary view — content", () => {
  it("groups entries by category with a pill header and count", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    await openFavoritesTab(document);
    await openSummaryView(document);

    const heads = Array.from(document.querySelectorAll(".summary-cat-head")).map((el) => el.textContent);
    expect(heads.some((h) => h.includes("Vocabulary Bank") && h.includes("1"))).toBe(true);
    expect(heads.some((h) => h.includes("Phrasal Verb") && h.includes("1"))).toBe(true);
  });

  it("shows the word, definition, and example per row, reusing resolveFavoriteEntryData()", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    await openFavoritesTab(document);
    await openSummaryView(document);

    const row = document.querySelector(".summary-row");
    const data = hooks.resolveFavoriteEntryData({ word: "abandon", cat: "Vocabulary Bank" });
    expect(row.querySelector(".row-word").textContent).toBe("abandon");
    expect(row.querySelector(".row-def").textContent).toBe(data.meanings[0].use);
  });

  it("numbers every row continuously across the whole list, not restarting per category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    await openFavoritesTab(document);
    await openSummaryView(document);

    const nums = Array.from(document.querySelectorAll(".row-num")).map((el) => el.textContent);
    expect(nums).toEqual(["1", "2"]);
  });

  it("respects the same category filter as the Cards view", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    await openFavoritesTab(document);

    Array.from(document.querySelectorAll("#favoritesCategorySeg button"))
      .find((b) => b.textContent.startsWith("Phrasal Verb"))
      .click();
    await wait();
    await openSummaryView(document);

    const words = Array.from(document.querySelectorAll(".row-word")).map((el) => el.textContent);
    expect(words).toEqual(["back up"]);
  });

  it("shows an empty message when there are no favorites in the current filter", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    await openFavoritesTab(document);
    await openSummaryView(document);
    hooks.setFavoritesFilterCat("Phrasal Verb");
    hooks.renderFavoritesSummary(await window.VocabCache.getAllFavorites({ dbPromise: hooks.vocabDbPromise }));

    expect(document.getElementById("favoritesSummaryList").textContent).toContain("No favorites in this category");
  });
});

describe("Favorites Summary view — review checkboxes", () => {
  it("shows a progress counter of reviewed vs. total", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    await openFavoritesTab(document);
    await openSummaryView(document);

    expect(document.getElementById("favoritesReviewedCount").textContent).toBe("0");
    expect(document.getElementById("favoritesTotalCount").textContent).toBe("2");
  });

  it("clicking a row's checkbox marks it reviewed: strikethrough + gray, and bumps the counter", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    await openFavoritesTab(document);
    await openSummaryView(document);

    const row = document.querySelector(".summary-row");
    row.querySelector(".row-check").click();

    expect(row.classList.contains("reviewed")).toBe(true);
    expect(row.querySelector(".row-check").checked).toBe(true);
    expect(document.getElementById("favoritesReviewedCount").textContent).toBe("1");
  });

  it("clicking anywhere else on the row (not just the checkbox) also toggles reviewed", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    await openFavoritesTab(document);
    await openSummaryView(document);

    const row = document.querySelector(".summary-row");
    row.querySelector(".row-word").click();

    expect(row.classList.contains("reviewed")).toBe(true);
    expect(row.querySelector(".row-check").checked).toBe(true);
  });

  it("clicking a reviewed row again un-reviews it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    await openFavoritesTab(document);
    await openSummaryView(document);

    const row = document.querySelector(".summary-row");
    row.querySelector(".row-check").click();
    row.querySelector(".row-check").click();

    expect(row.classList.contains("reviewed")).toBe(false);
    expect(row.querySelector(".row-check").checked).toBe(false);
    expect(document.getElementById("favoritesReviewedCount").textContent).toBe("0");
  });

  it("persists reviewed state locally so it survives closing and reopening the app", async () => {
    const { window: firstWindow, hooks: firstHooks } = await loadApp();
    const firstDocument = firstWindow.document;
    favoriteVocab(firstHooks, firstDocument, "abandon");
    await openFavoritesTab(firstDocument);
    await openSummaryView(firstDocument);
    firstDocument.querySelector(".summary-row .row-check").click();

    const stored = firstWindow.localStorage.getItem("mepf_toolkit_favorites_reviewed_words");
    expect(JSON.parse(stored)).toContain(firstHooks.favoriteReviewKey({ word: "abandon", cat: "Vocabulary Bank" }));

    const { window: secondWindow, hooks: secondHooks } = await loadApp({
      localStorage: { mepf_toolkit_favorites_reviewed_words: stored }
    });
    const secondDocument = secondWindow.document;
    favoriteVocab(secondHooks, secondDocument, "abandon");
    await openFavoritesTab(secondDocument);
    await openSummaryView(secondDocument);

    const row = secondDocument.querySelector(".summary-row");
    expect(row.classList.contains("reviewed")).toBe(true);
    expect(row.querySelector(".row-check").checked).toBe(true);
  });

  it("the Reset button clears every checked row for a fresh re-review pass", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    await openFavoritesTab(document);
    await openSummaryView(document);

    document.querySelectorAll(".row-check").forEach((cb) => cb.click());
    expect(document.getElementById("favoritesReviewedCount").textContent).toBe("2");

    document.getElementById("favoritesResetReviewedBtn").click();
    await wait();

    expect(document.getElementById("favoritesReviewedCount").textContent).toBe("0");
    document.querySelectorAll(".summary-row").forEach((row) => {
      expect(row.classList.contains("reviewed")).toBe(false);
      expect(row.querySelector(".row-check").checked).toBe(false);
    });
    expect(JSON.parse(window.localStorage.getItem("mepf_toolkit_favorites_reviewed_words"))).toEqual([]);
  });
});

describe("Favorites Summary view — coexists with unrelated features", () => {
  it("Sort By / PDF export still work unaffected while Summary view is active", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    delete window.navigator.share;
    favoriteVocab(hooks, document, "abandon");
    await openFavoritesTab(document);
    await openSummaryView(document);

    await hooks.exportFavoritesPdf();
    expect(document.getElementById("exportFavoritesStatus").textContent).toBe("Downloaded favorites-study-sheet.pdf.");
  });

  it("un-favoriting from the Cards view also removes the row from Summary view on next render", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    await openFavoritesTab(document);

    document.querySelector("#favoritesList .fav-toggle").click();
    await wait();
    await openSummaryView(document);

    const words = Array.from(document.querySelectorAll(".row-word")).map((el) => el.textContent);
    expect(words).toEqual(["abandon"]);
  });
});
