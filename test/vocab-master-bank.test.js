// Tests for the "Master Vocabulary Bank" consolidation: a single
// deduplicated, priority-ranked view over every category's words
// (wordIndexMap), used by global search, and a new manual "Check /
// Save a word to the Vocabulary Bank" widget on the Language Bank and
// Distinctions Words tabs. See index.html's normalizeWordKey(),
// vocabCategoryPriority(), rankSearchMatches(), and the wordIndexGroups
// canonical-selection block for the implementation this exercises.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("normalizeWordKey()", () => {
  it("trims, lowercases, and collapses internal whitespace", async () => {
    const { hooks } = await loadApp();
    expect(hooks.normalizeWordKey("  Give   Up  ")).toBe("give up");
    expect(hooks.normalizeWordKey("Apprehension")).toBe("apprehension");
    expect(hooks.normalizeWordKey("APPREHENSION")).toBe("apprehension");
    expect(hooks.normalizeWordKey("apprehension")).toBe("apprehension");
  });
});

describe("Master Vocabulary Bank (wordIndexMap): one canonical record per word", () => {
  it("a word appearing in more than one category still resolves to exactly one wordIndexMap entry", async () => {
    const { hooks } = await loadApp();
    // "under" is both a built-in Vocabulary Bank word and a built-in Preposition.
    const item = hooks.wordIndexMap.get("under");
    expect(item).toBeTruthy();
    expect(hooks.wordIndexMap.size).toBeGreaterThan(0);
  });

  it("prefers Vocabulary Bank as the canonical category when a word also exists elsewhere", async () => {
    const { hooks } = await loadApp();
    const item = hooks.wordIndexMap.get("under");
    expect(item.cat).toBe("Vocabulary Bank");
  });

  it("records every category a word was seen in, not just the canonical one", async () => {
    const { hooks } = await loadApp();
    const item = hooks.wordIndexMap.get("under");
    expect(item.categories).toEqual(expect.arrayContaining(["Vocabulary Bank", "Preposition"]));
  });

  it("adding a new word to a category it doesn't already belong to annotates the existing canonical record instead of creating a second one", async () => {
    const { hooks } = await loadApp();
    const before = hooks.wordIndexMap.size;
    // "abandon" is a built-in Vocabulary Bank word; adding it as a phrasal
    // verb too should not create a second wordIndexMap entry for it.
    hooks.addPhrasalEntry(
      { w: "abandon", senses: [{ use: "(phrasal) test", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    expect(hooks.wordIndexMap.size).toBe(before);
    const item = hooks.wordIndexMap.get("abandon");
    expect(item.categories).toEqual(expect.arrayContaining(["Vocabulary Bank", "Phrasal Verb"]));
  });
});

describe("global search: deduplication and relevance ranking", () => {
  it("a word indexed under more than one category appears exactly once in search results", async () => {
    const { window, hooks } = await loadApp();
    hooks.runSearchPipeline("under");
    const labels = Array.from(window.document.querySelectorAll("#searchResults .search-result-item .label")).map((el) => el.textContent);
    expect(labels.filter((l) => l.toLowerCase() === "under")).toHaveLength(1);
  });

  it("ranks an exact match first, then startsWith matches, then contains matches", async () => {
    const { window, hooks } = await loadApp();
    hooks.runSearchPipeline("give");
    const labels = Array.from(window.document.querySelectorAll("#searchResults .search-result-item .label")).map((el) => el.textContent.toLowerCase());
    expect(labels[0]).toBe("give");
    const exactIdx = labels.indexOf("give");
    const containsOnly = labels.filter((l) => l.includes("give") && !l.startsWith("give"));
    if (containsOnly.length > 0) {
      const firstContainsIdx = labels.indexOf(containsOnly[0]);
      expect(firstContainsIdx).toBeGreaterThan(exactIdx);
    }
  });

  it("rankSearchMatches() tiers exact / startsWith / contains correctly", async () => {
    const { hooks } = await loadApp();
    const items = [
      { label: "expression" },
      { label: "press" },
      { label: "pressure" },
    ];
    const ranked = hooks.rankSearchMatches(items, "press").map((i) => i.label);
    expect(ranked).toEqual(["press", "pressure", "expression"]);
  });
});

describe("offline-aware 'no results' messaging", () => {
  it("shows a generic message when nothing matches locally and the app is online", async () => {
    const { window, hooks } = await loadApp();
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    hooks.runSearchPipeline("zzzznomatchatall");
    await wait(600);
    expect(window.document.getElementById("searchResults").textContent).toContain("No matches — try a different word.");
  });

  it("shows an offline-specific message when navigator.onLine is false", async () => {
    const { window, hooks } = await loadApp();
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    hooks.runSearchPipeline("zzzznomatchatall");
    await wait(50);
    expect(window.document.getElementById("searchResults").textContent).toContain(
      "No matches in your offline Vocabulary Bank. Connect to the internet to search online."
    );
  });
});

describe("Language Bank duplicate-add navigates to its OWN entry, not a same-spelled word from another category", () => {
  it("re-adding a phrasal verb that also happens to be a Vocabulary Bank word opens the phrasal verb entry", async () => {
    const { window, hooks } = await loadApp();
    // "move on" is a built-in word in BOTH vocabData and phrasalData —
    // re-adding it via the Phrasal Verb quick-add box must navigate to
    // its own phrasal-verb entry, not the coincidentally same-spelled
    // Vocabulary Bank word (which is what the Master Vocabulary Bank's
    // cross-category canonical pointer would otherwise resolve to).
    expect(hooks.vocabData.some((v) => v.w === "move on")).toBe(true);
    expect(hooks.phrasalData.some((p) => p.w === "move on")).toBe(true);

    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    window.document.getElementById("phrasalAddInput").value = "move on";
    window.document.getElementById("phrasalAddBtn").click();
    await wait(30);

    expect(fetchCalled).toBe(false);
    expect(window.document.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(window.document.getElementById("phrasalEntry").querySelector(".headword").textContent).toBe("move on");
  });
});

describe("'Check / Save a word to the Vocabulary Bank' widget (Language Bank + Distinctions tabs)", () => {
  it("shows an 'already available' message with a working View entry link for a known word", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();

    const input = document.getElementById("langbankVocabCheckInput");
    input.value = "abandon";
    input.dispatchEvent(new window.Event("input"));
    await wait(400);

    const resultEl = document.getElementById("langbankVocabCheckResult");
    expect(resultEl.textContent).toContain("already available in the Vocabulary Bank");
    const viewBtn = resultEl.querySelector(".vocab-check-view-btn");
    expect(viewBtn).toBeTruthy();

    viewBtn.click();
    await wait(30);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");
  });

  it("offers to save a not-yet-known word using the exact typed text, and saving preserves that exact text", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();

    // Online source returns a DIFFERENT casing/spelling than typed — the
    // saved entry must still use the exact word the Owner typed.
    window.OnlineLookup.fetchOnlineDefinition = async (word) => {
      if (word.trim().toLowerCase() !== "extraordinary") return null;
      return { w: "Extraordinary (from API)", senses: [{ use: "(adjective) Very unusual.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" };
    };

    const input = document.getElementById("langbankVocabCheckInput");
    input.value = "extraordinary";
    input.dispatchEvent(new window.Event("input"));
    await wait(400);

    const resultEl = document.getElementById("langbankVocabCheckResult");
    const saveBtn = resultEl.querySelector(".vocab-check-save-btn");
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.textContent).toContain("extraordinary");

    saveBtn.click();
    await wait(50);

    expect(resultEl.textContent).toContain("has been added to your Vocabulary Bank");
    const saved = hooks.vocabData.find((v) => v.w.toLowerCase() === "extraordinary");
    expect(saved).toBeTruthy();
    expect(saved.w).toBe("extraordinary");
    expect(document.getElementById("vocabSelect").querySelector('option[value="extraordinary"]')).toBeTruthy();
  });

  it("falls back to a manual meaning/example box when no online source has the word, and saves with the typed text", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    window.OnlineLookup.fetchOnlineDefinition = async () => null;

    const input = document.getElementById("langbankVocabCheckInput");
    input.value = "zibbleflorp";
    input.dispatchEvent(new window.Event("input"));
    await wait(400);

    const resultEl = document.getElementById("langbankVocabCheckResult");
    resultEl.querySelector(".vocab-check-save-btn").click();
    await wait(50);

    expect(resultEl.textContent).toContain("No online definition was found");
    resultEl.querySelector(".vocab-check-manual-use").value = "(noun) A made-up test word.";
    resultEl.querySelector(".vocab-check-manual-save-btn").click();
    await wait(50);

    expect(resultEl.textContent).toContain("has been added to your Vocabulary Bank");
    const saved = hooks.vocabData.find((v) => v.w.toLowerCase() === "zibbleflorp");
    expect(saved).toBeTruthy();
    expect(saved.senses[0].use).toBe("(noun) A made-up test word.");
  });

  it("does not offer a save button while the device is locked", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();

    const input = document.getElementById("langbankVocabCheckInput");
    input.value = "extraordinary";
    input.dispatchEvent(new window.Event("input"));
    await wait(400);

    const resultEl = document.getElementById("langbankVocabCheckResult");
    expect(resultEl.querySelector(".vocab-check-save-btn")).toBeNull();
  });

  it("also works on the Distinctions Words tab", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="distinctions"]').click();

    const input = document.getElementById("distinctionsVocabCheckInput");
    input.value = "abandon";
    input.dispatchEvent(new window.Event("input"));
    await wait(400);

    expect(document.getElementById("distinctionsVocabCheckResult").textContent).toContain("already available in the Vocabulary Bank");
  });
});
