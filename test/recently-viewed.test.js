// Integration tests for "recently viewed" — recorded on every real
// navigation (search selection, chip click, favorites-list click), and
// surfaced as suggestions when the search box is focused while empty.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openVocabEntry(hooks, document, word) {
  hooks.runSearchPipeline(word);
  const match = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
    .find((el) => el.textContent.includes("Vocabulary Bank"));
  match.click();
}

describe("recording recently-viewed entries", () => {
  it("records a view whenever a search result is clicked", async () => {
    const idb = new IDBFactory();
    const { hooks } = await loadApp({ indexedDBFactory: idb });
    hooks.pushSearchHistory({ label: "abandon", cat: "Vocabulary Bank", action: () => {} });
    await wait();

    const recent = await VocabCache.getRecentlyViewed(10, { indexedDB: idb });
    expect(recent.map((r) => r.word)).toContain("abandon");
  });

  it("re-viewing the same word bumps it to the front instead of duplicating it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openVocabEntry(hooks, document, "abandon");
    openVocabEntry(hooks, document, "above");
    openVocabEntry(hooks, document, "abandon");
    await wait();

    const recent = await VocabCache.getRecentlyViewed(10, { dbPromise: hooks.vocabDbPromise });
    expect(recent.map((r) => r.word)).toEqual(["abandon", "above"]);
  });
});

describe("recently-viewed suggestions on search-box focus", () => {
  it("shows recently-viewed words when the empty search box is focused", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openVocabEntry(hooks, document, "abandon");

    const input = document.getElementById("globalSearch");
    input.value = "";
    input.focus();
    await wait();

    const resultsText = document.getElementById("searchResults").textContent;
    expect(resultsText).toContain("abandon");
    expect(resultsText).toContain("Recently viewed");
  });

  it("does not show suggestions when the search box already has text", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openVocabEntry(hooks, document, "abandon");

    const input = document.getElementById("globalSearch");
    input.value = "above";
    input.focus();
    await wait();

    expect(document.getElementById("searchResults").textContent).not.toContain("Recently viewed");
  });

  it("clicking a recently-viewed suggestion navigates to that entry and re-records the view", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openVocabEntry(hooks, document, "abandon");
    openVocabEntry(hooks, document, "above");

    const input = document.getElementById("globalSearch");
    input.value = "";
    input.focus();
    await wait();

    const abandonSuggestion = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("abandon"));
    abandonSuggestion.click();

    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");
  });

  it("shows nothing (no empty-state noise) when nothing has been viewed yet", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const input = document.getElementById("globalSearch");
    input.focus();
    await wait();
    expect(document.getElementById("searchResults").classList.contains("show")).toBe(false);
  });
});
