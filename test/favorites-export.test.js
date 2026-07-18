// Integration tests for exporting/sharing the Favorites tab as a
// personal "study sheet" — this feature used to live on the Language
// Bank tab and export the ENTIRE database; it now lives on the
// Favorites tab and exports only whatever is currently favorited and
// matching the active category filter there.
//
// The button's actual behavior is PDF-first (buildFavoritesPdfData +
// renderFavoritesPdf, via jsPDF lazy-loaded on first use from
// js/jspdf.umd.min.js — see exportFavoritesPdf()), falling back to the
// plain-text share/download (buildFavoritesStudySheet +
// shareOrExportFavorites) whenever that library can't be loaded. jsPDF
// is vendored locally rather than pulled from a CDN, so it's a
// same-origin file — load-app.js's resource loader serves the REAL
// library here too, not a stub — so most of this file exercises
// genuine PDF generation.
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openFavoritesTab(document) {
  document.querySelector('.thumb-tab[data-tab="favorites"]').click();
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

function favoritePreposition(hooks, document, word) {
  hooks.runSearchPipeline(word);
  Array.from(document.querySelectorAll("#searchResults .search-result-item"))
    .find((el) => el.textContent.includes("Preposition"))
    .click();
  document.querySelector("#prepEntry .fav-toggle").click();
}

function favoriteVerb(document) {
  document.querySelector('.thumb-tab[data-tab="verbs"]').click();
  document.querySelector("#verbEntry .fav-toggle").click();
}

function favoriteWordFamily(document) {
  document.querySelector('.thumb-tab[data-tab="family"]').click();
  document.querySelector("#familyEntry .fav-toggle").click();
}

describe("the Export/Share PDF button no longer lives on the Language Bank tab", () => {
  it("has no exportLanguageBankBtn/exportLanguageBankStatus elements anywhere in the page", async () => {
    const { window } = await loadApp();
    expect(window.document.getElementById("exportLanguageBankBtn")).toBeNull();
    expect(window.document.getElementById("exportLanguageBankStatus")).toBeNull();
  });

  it("the Favorites tab has the export button and category filter instead", async () => {
    const { window } = await loadApp();
    await openFavoritesTab(window.document);
    expect(window.document.getElementById("exportFavoritesBtn")).toBeTruthy();
    expect(window.document.getElementById("exportFavoritesStatus")).toBeTruthy();
    expect(window.document.getElementById("favoritesCategorySeg")).toBeTruthy();
  });
});

describe("Favorites category filter", () => {
  it("stays hidden with no chips when there are no favorites", async () => {
    const { window } = await loadApp();
    await openFavoritesTab(window.document);
    const seg = window.document.getElementById("favoritesCategorySeg");
    expect(seg.style.display).toBe("none");
    expect(seg.children.length).toBe(0);
  });

  it("offers 'All' plus each distinct category actually present, with counts", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);

    await openFavoritesTab(document);
    const chips = Array.from(document.querySelectorAll("#favoritesCategorySeg button")).map((b) => b.textContent);
    expect(chips).toEqual(["All (2)", "Phrasal Verb (1)", "Vocabulary Bank (1)"]);
  });

  it("clicking a category chip narrows the visible list to just that category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);

    await openFavoritesTab(document);
    Array.from(document.querySelectorAll("#favoritesCategorySeg button"))
      .find((b) => b.textContent.startsWith("Phrasal Verb"))
      .click();
    await wait(); // the chip's click handler re-renders the list asynchronously, same as fav-toggle

    const labels = Array.from(document.querySelectorAll("#favoritesList .label")).map((el) => el.textContent);
    expect(labels).toEqual(["move on"]);
    const phrasalChipAfter = Array.from(document.querySelectorAll("#favoritesCategorySeg button"))
      .find((b) => b.textContent.startsWith("Phrasal Verb"));
    expect(phrasalChipAfter.classList.contains("active")).toBe(true);
  });

  it("clicking back to 'All' restores the full list", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    await openFavoritesTab(document);

    Array.from(document.querySelectorAll("#favoritesCategorySeg button"))
      .find((b) => b.textContent.startsWith("Phrasal Verb"))
      .click();
    await wait();
    Array.from(document.querySelectorAll("#favoritesCategorySeg button"))
      .find((b) => b.textContent.startsWith("All"))
      .click();
    await wait();

    const labels = Array.from(document.querySelectorAll("#favoritesList .label")).map((el) => el.textContent);
    expect(labels.sort()).toEqual(["abandon", "move on"]);
  });

  it("falls back to 'All' automatically once the selected category's only favorite is removed", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    await openFavoritesTab(document);

    Array.from(document.querySelectorAll("#favoritesCategorySeg button"))
      .find((b) => b.textContent.startsWith("Phrasal Verb"))
      .click();
    expect(hooks.getFavoritesFilterCat()).toBe("Phrasal Verb");

    // Un-favorite the only Phrasal Verb from within the filtered list itself.
    document.querySelector("#favoritesList .fav-toggle").click();
    await wait();

    expect(hooks.getFavoritesFilterCat()).toBe("All");
    const labels = Array.from(document.querySelectorAll("#favoritesList .label")).map((el) => el.textContent);
    expect(labels).toEqual(["abandon"]);
  });
});

describe("resolveFavoriteEntryData() — cross-referencing a bare {word, cat} back to full content", () => {
  it("resolves a Vocabulary Bank favorite with meanings, synonyms, and antonyms", async () => {
    const { hooks } = await loadApp();
    const data = hooks.resolveFavoriteEntryData({ word: "abandon", cat: "Vocabulary Bank" });
    expect(data.word).toBe("abandon");
    expect(data.meanings.length).toBeGreaterThan(0);
    expect(data.meanings[0].use).toBeTruthy();
  });

  it("resolves a Phrasal Verb (Language Bank) favorite", async () => {
    const { hooks } = await loadApp();
    const data = hooks.resolveFavoriteEntryData({ word: "move on", cat: "Phrasal Verb" });
    expect(data.word).toBe("move on");
    expect(data.meanings.length).toBeGreaterThan(0);
  });

  it("resolves a Preposition favorite", async () => {
    const { hooks } = await loadApp();
    const data = hooks.resolveFavoriteEntryData({ word: "under", cat: "Preposition" });
    expect(data.word).toBe("under");
    expect(data.meanings.length).toBeGreaterThan(0);
  });

  it("resolves a regular verb favorite into its five forms", async () => {
    const { hooks } = await loadApp();
    const data = hooks.resolveFavoriteEntryData({ word: "work", cat: "regular verb" });
    expect(data.word).toBe("work");
    expect(data.meanings[0].examples[0]).toContain("work");
    expect(data.meanings[0].examples[0]).toContain("worked");
  });

  it("resolves a Word Family favorite into its noun/person/adjective forms", async () => {
    const { hooks } = await loadApp();
    const data = hooks.resolveFavoriteEntryData({ word: "install", cat: "Word Family" });
    expect(data.word).toBe("install");
    expect(data.meanings[0].use).toContain("installation");
  });

  it("still returns a usable (empty-content) row for a favorite whose source entry can't be found", async () => {
    const { hooks } = await loadApp();
    const data = hooks.resolveFavoriteEntryData({ word: "no-such-word-xyz", cat: "Vocabulary Bank" });
    expect(data.word).toBe("no-such-word-xyz");
    expect(data.meanings).toEqual([]);
  });
});

describe("buildFavoritesPdfData() / buildFavoritesStudySheet() respect the given favorites list only", () => {
  it("only includes the favorites passed in, grouped by category and sorted alphabetically", async () => {
    const { hooks } = await loadApp();
    const favs = [
      { word: "move on", cat: "Phrasal Verb" },
      { word: "abandon", cat: "Vocabulary Bank" }
    ];
    const data = hooks.buildFavoritesPdfData(favs);
    expect(data.sections.map((s) => s.title)).toEqual(["Phrasal Verb", "Vocabulary Bank"]);
    expect(data.sections[0].entries.map((e) => e.word)).toEqual(["move on"]);
    expect(data.sections[1].entries.map((e) => e.word)).toEqual(["abandon"]);
  });

  it("the text study sheet contains only the given favorites, not the whole database", async () => {
    const { hooks } = await loadApp();
    const text = hooks.buildFavoritesStudySheet([{ word: "abandon", cat: "Vocabulary Bank" }]);
    expect(text).toContain("FAVORITES STUDY SHEET");
    expect(text).toContain("abandon");
    expect(text).not.toContain("tolerance"); // a Technical Term, not in this favorites list
    expect(text).not.toContain("move on");
  });
});

describe("exportFavoritesPdf() — the button's actual handler, filter-aware", () => {
  it("shows a friendly status instead of exporting when there are no favorites at all", async () => {
    const { window, hooks } = await loadApp();
    await hooks.exportFavoritesPdf();
    expect(window.document.getElementById("exportFavoritesStatus").textContent).toContain("No favorites");
  });

  it("generates and downloads a real PDF containing only the favorited items", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    delete window.navigator.share;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);

    await hooks.exportFavoritesPdf();

    const text = document.getElementById("exportFavoritesStatus").textContent;
    expect(text).toBe("Downloaded favorites-study-sheet.pdf.");
  });

  it("exports only the currently-filtered category, not every favorite", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    await openFavoritesTab(document);
    Array.from(document.querySelectorAll("#favoritesCategorySeg button"))
      .find((b) => b.textContent.startsWith("Phrasal Verb"))
      .click();

    await hooks.loadJsPdf();
    const allFavs = await window.VocabCache.getAllFavorites({ dbPromise: hooks.vocabDbPromise });
    const filtered = allFavs.filter((f) => f.cat === hooks.getFavoritesFilterCat());
    const doc = hooks.renderFavoritesPdf(hooks.buildFavoritesPdfData(filtered));
    const asText = doc.output("datauristring");

    expect(filtered.map((f) => f.word)).toEqual(["move on"]);
    expect(asText.startsWith("data:application/pdf")).toBe(true);
  });

  it("clicking the actual button in the Favorites tab triggers the same (real PDF, filter-aware) flow", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    delete window.navigator.share;
    favoriteVocab(hooks, document, "abandon");

    await openFavoritesTab(document);
    document.getElementById("exportFavoritesBtn").click();
    await wait(100);

    expect(document.getElementById("exportFavoritesStatus").textContent).toBe("Downloaded favorites-study-sheet.pdf.");
  });

  it("shares the PDF as a file when the device supports sharing files", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    window.navigator.share = shareSpy;
    window.navigator.canShare = vi.fn().mockReturnValue(true);

    await hooks.exportFavoritesPdf();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0];
    expect(arg.title).toBe("Favorites Study Sheet");
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].name).toBe("favorites-study-sheet.pdf");
    expect(arg.files[0].type).toBe("application/pdf");
    expect(document.getElementById("exportFavoritesStatus").textContent).toContain("Shared");
  });

  it("falls back to the text export when the PDF library fails to load, and explains why", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    delete window.navigator.share;
    favoriteVocab(hooks, document, "abandon");

    const originalAppendChild = window.document.head.appendChild.bind(window.document.head);
    window.document.head.appendChild = (el) => {
      if (el.tagName === "SCRIPT" && String(el.src).includes("jspdf")) {
        Promise.resolve().then(() => el.onerror && el.onerror(new window.Event("error")));
        return el;
      }
      return originalAppendChild(el);
    };

    await hooks.exportFavoritesPdf();

    const text = document.getElementById("exportFavoritesStatus").textContent;
    expect(text).toContain("PDF export isn't available");
    expect(text).toContain("Downloaded");
    expect(text).toContain("favorites-study-sheet.txt");
  });
});

describe("PDF rendering covers every favoritable entry shape without crashing", () => {
  it("renders a real, multi-category PDF across Vocabulary, Language Bank, Preposition, Verb, and Word Family favorites", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    favoriteVocab(hooks, document, "abandon");
    favoritePhrasal(document);
    favoritePreposition(hooks, document, "under");
    favoriteVerb(document);
    favoriteWordFamily(document);

    await hooks.loadJsPdf();
    const allFavs = await window.VocabCache.getAllFavorites({ dbPromise: hooks.vocabDbPromise });
    expect(allFavs.length).toBe(5);

    const doc = hooks.renderFavoritesPdf(hooks.buildFavoritesPdfData(allFavs));
    expect(doc.output("blob").type).toBe("application/pdf");
    expect(doc.output("blob").size).toBeGreaterThan(500);
  });
});
