// Integration tests for the Language Bank tab — the renamed Phrasal
// tab, now holding 5 categories (Phrasal Verbs, Idioms & Expressions,
// Useful Sentences, Sentence Patterns, Technical/Engineering Terms)
// behind a segmented category switcher. See test/phrasal-add.test.js
// for Phrasal-Verbs-specific coverage (unchanged behavior/IDs); this
// file covers the category switcher itself and the other categories,
// using describe.each to exercise the shared
// addLanguageBankEntry/addLanguageBankEntryFromInput logic once per
// category instead of copy-pasting the same test repeatedly.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Language Bank category switcher", () => {
  it("shows Phrasal Verbs by default, with the other 3 sub-panels hidden", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();

    expect(document.getElementById("langbank-phrasal").style.display).not.toBe("none");
    ["idioms", "sentences", "patterns", "technical"].forEach((key) => {
      expect(document.getElementById(`langbank-${key}`).style.display).toBe("none");
    });
    expect(document.querySelector('#langBankCategorySeg button[data-val="phrasal"]').classList.contains("active")).toBe(true);
  });

  it("switching categories shows only the selected sub-panel and marks its button active", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="langbank"]').click();

    document.querySelector('#langBankCategorySeg button[data-val="idioms"]').click();

    expect(document.getElementById("langbank-idioms").style.display).not.toBe("none");
    ["phrasal", "sentences", "patterns", "technical"].forEach((key) => {
      expect(document.getElementById(`langbank-${key}`).style.display).toBe("none");
    });
    expect(document.querySelector('#langBankCategorySeg button[data-val="idioms"]').classList.contains("active")).toBe(true);
    expect(document.querySelector('#langBankCategorySeg button[data-val="phrasal"]').classList.contains("active")).toBe(false);
  });

  it("each category's dropdown is pre-populated with its built-in seed entries", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const idiomOptions = Array.from(document.getElementById("idiomsSelect").options).map((o) => o.value);
    const sentenceOptions = Array.from(document.getElementById("sentencesSelect").options).map((o) => o.value);
    const patternOptions = Array.from(document.getElementById("patternsSelect").options).map((o) => o.value);
    const technicalOptions = Array.from(document.getElementById("technicalSelect").options).map((o) => o.value);

    expect(idiomOptions).toContain("break the ice");
    expect(sentenceOptions.length).toBeGreaterThan(0);
    expect(patternOptions.length).toBeGreaterThan(0);
    expect(technicalOptions.length).toBeGreaterThan(0);
  });

  it("searching for a built-in idiom navigates to the Language Bank tab, Idioms category, and the right entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    hooks.runSearchPipeline("break the ice");
    const match = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("break the ice"));
    expect(match).toBeTruthy();
    match.click();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(document.querySelector('#langBankCategorySeg button[data-val="idioms"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("idiomsEntry").querySelector(".headword").textContent).toBe("break the ice");
  });
});

describe.each([
  {
    key: "idioms", label: "Idioms & Expressions", inputId: "idiomsAddInput", btnId: "idiomsAddBtn",
    statusId: "idiomsAddStatus", dataKey: "idiomsData", entryId: "idiomsEntry", tagLabel: "Idiom / Expression",
    builtIn: "break the ice", requireExplanation: true, hasManualExample: true, hasSkip: false,
    manualBoxId: "idiomsManualBox", manualWordId: "idiomsManualWord", manualUseId: "idiomsManualUse",
    manualExampleId: "idiomsManualExample", manualSaveBtnId: "idiomsManualSaveBtn",
    manualCancelBtnId: "idiomsManualCancelBtn", manualSkipBtnId: null,
    sample: { w: "test the waters", senses: [{ use: "(idiom) Try something cautiously before fully committing.", examples: ["We tested the waters with a small pilot first."] }], syn: ["try it out"], ant: [], mistake: null, tagalog: null, source: "online" }
  },
  {
    key: "sentences", label: "Useful Sentences", inputId: "sentencesAddInput", btnId: "sentencesAddBtn",
    statusId: "sentencesAddStatus", dataKey: "sentencesData", entryId: "sentencesEntry", tagLabel: "Useful Sentence",
    builtIn: "I'll get back to you on that.", requireExplanation: false, hasManualExample: false, hasSkip: true,
    manualBoxId: "sentencesManualBox", manualWordId: "sentencesManualWord", manualUseId: "sentencesManualUse",
    manualExampleId: null, manualSaveBtnId: "sentencesManualSaveBtn",
    manualCancelBtnId: "sentencesManualCancelBtn", manualSkipBtnId: "sentencesManualSkipBtn",
    sample: { w: "Let me know if that works for you.", senses: [{ use: "Checks that a proposed plan or time is acceptable.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }
  },
  {
    key: "patterns", label: "Sentence Patterns", inputId: "patternsAddInput", btnId: "patternsAddBtn",
    statusId: "patternsAddStatus", dataKey: "patternsData", entryId: "patternsEntry", tagLabel: "Sentence Pattern",
    builtIn: "Would you mind + V-ing?", requireExplanation: false, hasManualExample: false, hasSkip: true,
    manualBoxId: "patternsManualBox", manualWordId: "patternsManualWord", manualUseId: "patternsManualUse",
    manualExampleId: null, manualSaveBtnId: "patternsManualSaveBtn",
    manualCancelBtnId: "patternsManualCancelBtn", manualSkipBtnId: "patternsManualSkipBtn",
    sample: { w: "Not only + inverted clause, but also...", senses: [{ use: "Emphasizes two facts with subject-verb inversion.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }
  },
  {
    key: "technical", label: "Technical/Engineering Terms", inputId: "technicalAddInput", btnId: "technicalAddBtn",
    statusId: "technicalAddStatus", dataKey: "technicalData", entryId: "technicalEntry", tagLabel: "Technical Term",
    builtIn: "tolerance", requireExplanation: true, hasManualExample: true, hasSkip: false,
    manualBoxId: "technicalManualBox", manualWordId: "technicalManualWord", manualUseId: "technicalManualUse",
    manualExampleId: "technicalManualExample", manualSaveBtnId: "technicalManualSaveBtn",
    manualCancelBtnId: "technicalManualCancelBtn", manualSkipBtnId: null,
    sample: { w: "load balancer", senses: [{ use: "(noun) A device or software that distributes network traffic across multiple servers.", examples: ["The load balancer routed requests to the healthiest servers."] }], syn: ["traffic distributor"], ant: [], mistake: null, tagalog: null, source: "online" }
  }
])("$label quick-add", ({
  key, inputId, btnId, statusId, dataKey, entryId, tagLabel, builtIn, requireExplanation, hasManualExample, hasSkip,
  manualBoxId, manualWordId, manualUseId, manualExampleId, manualSaveBtnId, manualCancelBtnId, manualSkipBtnId, sample
}) => {
  function stubFetch(window, result) {
    window.OnlineLookup.fetchOnlineDefinition = async () => result;
  }

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById(btnId).click();
    await wait(10);
    expect(document.getElementById(statusId).textContent).toContain("Please enter");
  });

  it("looks up online, previews the result, and only adds it once Save is clicked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, sample);

    document.getElementById(inputId).value = sample.w;
    document.getElementById(btnId).click();
    await wait(30);

    // Not saved yet — a preview with Save/Decline is shown first.
    const statusEl = document.getElementById(statusId);
    expect(statusEl.textContent).toContain("ready to be added");
    expect(hooks[dataKey].some((p) => p.w === sample.w)).toBe(false);
    const saveBtn = statusEl.querySelector(".lb-lookup-save-btn");
    expect(saveBtn).toBeTruthy();
    expect(statusEl.querySelector(".lb-lookup-decline-btn")).toBeTruthy();

    saveBtn.click();
    await wait(30);

    expect(document.getElementById(statusId).textContent).toContain("Added");
    expect(hooks[dataKey].some((p) => p.w === sample.w)).toBe(true);
    expect(hooks.wordIndexMap.get(sample.w.toLowerCase()).cat).toBe(tagLabel);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(document.querySelector(`#langBankCategorySeg button[data-val="${key}"]`).classList.contains("active")).toBe(true);
    expect(document.getElementById(entryId).querySelector(".headword").textContent).toBe(sample.w);
  });

  it("Decline discards the previewed entry — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, sample);

    document.getElementById(inputId).value = sample.w;
    document.getElementById(btnId).click();
    await wait(30);

    const statusEl = document.getElementById(statusId);
    statusEl.querySelector(".lb-lookup-decline-btn").click();
    await wait(10);

    expect(document.getElementById(statusId).textContent).toContain("Not saved");
    expect(hooks[dataKey].some((p) => p.w === sample.w)).toBe(false);
    expect(hooks.wordIndexMap.has(sample.w.toLowerCase())).toBe(false);
  });

  it("does not create a duplicate and instead navigates to the existing built-in entry when it's already known", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    document.getElementById(inputId).value = builtIn;
    document.getElementById(btnId).click();
    await wait(30);

    expect(fetchCalled).toBe(false);
    expect(document.getElementById(statusId).textContent).toContain("already in the database");
    expect(document.getElementById(entryId).querySelector(".headword").textContent).toBe(builtIn);
    expect(hooks[dataKey].filter((p) => p.w === builtIn)).toHaveLength(1);
  });

  it("requests the lookup with generateFallbackExamples disabled", async () => {
    const { window } = await loadApp();
    const document = window.document;
    let capturedOptions = null;
    window.OnlineLookup.fetchOnlineDefinition = async (word, options) => {
      capturedOptions = options;
      return sample;
    };

    document.getElementById(inputId).value = sample.w;
    document.getElementById(btnId).click();
    await wait(30);

    expect(capturedOptions.generateFallbackExamples).toBe(false);
  });

  it("is gated behind isDeviceUnlocked() — a locked device gets a clear error, not silence", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;

    document.getElementById(inputId).value = sample.w;
    document.getElementById(btnId).click();
    await wait(30);

    expect(document.getElementById(statusId).textContent).toContain("isn't unlocked");
    expect(hooks[dataKey].some((p) => p.w === sample.w)).toBe(false);
  });

  describe("when nothing is found online", () => {
    it("shows the manual-completion box instead of refusing outright or silently adding a blank entry", async () => {
      const { window, hooks } = await loadApp();
      const document = window.document;
      stubFetch(window, null);

      document.getElementById(inputId).value = "zzznotfound zzz";
      document.getElementById(btnId).click();
      await wait(30);

      expect(document.getElementById(statusId).textContent).toContain("Couldn't find");
      expect(document.getElementById(manualBoxId).style.display).not.toBe("none");
      expect(document.getElementById(manualWordId).textContent).toBe("zzznotfound zzz");
      expect(hooks.languageBankPendingManual[key]).toBe("zzznotfound zzz");
      // Not added yet — only after Save/Skip.
      expect(hooks[dataKey].some((p) => p.w === "zzznotfound zzz")).toBe(false);
    });

    it("saves with a manually-typed explanation when Save is clicked", async () => {
      const { window, hooks } = await loadApp();
      const document = window.document;
      stubFetch(window, null);
      const text = "a brand new entry with no dictionary match";

      document.getElementById(inputId).value = text;
      document.getElementById(btnId).click();
      await wait(30);

      document.getElementById(manualUseId).value = "My own explanation of what this means.";
      if (hasManualExample) document.getElementById(manualExampleId).value = "An example I wrote myself.";
      document.getElementById(manualSaveBtnId).click();
      await wait(30);

      expect(document.getElementById(statusId).className).toContain("success");
      expect(document.getElementById(statusId).textContent).toContain("your own notes");
      const added = hooks[dataKey].find((p) => p.w === text);
      expect(added).toBeTruthy();
      expect(added.senses[0].use).toBe("My own explanation of what this means.");
      if (hasManualExample) expect(added.senses[0].examples).toEqual(["An example I wrote myself."]);
      expect(document.getElementById(manualBoxId).style.display).toBe("none");
      expect(document.getElementById(entryId).querySelector(".headword").textContent).toBe(text);
    });

    it("Cancel hides the manual box and adds nothing", async () => {
      const { window, hooks } = await loadApp();
      const document = window.document;
      stubFetch(window, null);
      const text = "something to cancel";

      document.getElementById(inputId).value = text;
      document.getElementById(btnId).click();
      await wait(30);
      document.getElementById(manualCancelBtnId).click();
      await wait(10);

      expect(document.getElementById(manualBoxId).style.display).toBe("none");
      expect(document.getElementById(statusId).textContent).toContain("Cancelled");
      expect(hooks[dataKey].some((p) => p.w === text)).toBe(false);
      expect(hooks.languageBankPendingManual[key]).toBeUndefined();
    });

    if (requireExplanation) {
      it("refuses to save with a blank explanation — a dictionary-style entry needs a meaning", async () => {
        const { window, hooks } = await loadApp();
        const document = window.document;
        stubFetch(window, null);
        const text = "needs an explanation";

        document.getElementById(inputId).value = text;
        document.getElementById(btnId).click();
        await wait(30);
        document.getElementById(manualSaveBtnId).click();
        await wait(20);

        expect(document.getElementById(statusId).className).toContain("error");
        expect(hooks[dataKey].some((p) => p.w === text)).toBe(false);
        // Box stays open so the user can still fill it in.
        expect(document.getElementById(manualBoxId).style.display).not.toBe("none");
      });
    }

    if (hasSkip) {
      it("adds the entry with just the typed text when Skip/Add-without-notes is clicked", async () => {
        const { window, hooks } = await loadApp();
        const document = window.document;
        stubFetch(window, null);
        const text = "a brand new entry with no dictionary match";

        document.getElementById(inputId).value = text;
        document.getElementById(btnId).click();
        await wait(30);
        document.getElementById(manualSkipBtnId).click();
        await wait(30);

        expect(document.getElementById(statusId).className).toContain("success");
        expect(document.getElementById(statusId).textContent).toContain("no online definition was found");
        const added = hooks[dataKey].find((p) => p.w === text);
        expect(added).toBeTruthy();
        expect(added.senses).toEqual([]);
        // Rendered with no crash and no fabricated content under Rule & usage.
        expect(document.getElementById(entryId).querySelectorAll(".sense")).toHaveLength(0);
      });
    }

    it("is gated behind isDeviceUnlocked() even though the manual box would normally be hidden while locked", async () => {
      const { window, hooks } = await loadApp();
      const document = window.document;
      stubFetch(window, null);
      const text = "gate check";

      document.getElementById(inputId).value = text;
      document.getElementById(btnId).click();
      await wait(30);

      // Lock the device out from under the already-open manual box.
      window.OwnerMode.lockOwnerMode();
      hooks.updateOwnerModeUI();

      document.getElementById(manualUseId).value = "trying anyway";
      document.getElementById(manualSaveBtnId).click();
      await wait(20);

      expect(document.getElementById(statusId).textContent).toContain("isn't unlocked");
      expect(hooks[dataKey].some((p) => p.w === text)).toBe(false);
    });
  });

  it("persists across sessions via its own IndexedDB store, independent of the other categories", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    first.hooks.addLanguageBankEntry(key, sample, { persist: true });
    await wait(50);

    const { window, hooks } = await loadApp({ indexedDBFactory });
    expect(hooks[dataKey].some((p) => p.w === sample.w)).toBe(true);
    expect(Array.from(window.document.getElementById(`${key}Select`).options).some((o) => o.value === sample.w)).toBe(true);
  });
});

describe("Language Bank owner-mode gating", () => {
  it("hides all 5 category quick-add boxes when the device is locked", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    ["phrasalAddBox", "idiomsAddBox", "sentencesAddBox", "patternsAddBox", "technicalAddBox"].forEach((id) => {
      expect(document.getElementById(id).style.display).toBe("none");
    });
  });

  it("reveals all 5 category quick-add boxes once unlocked", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="mistakes"]').click();
    document.getElementById("ownerNewPinInput").value = "1234";
    document.getElementById("ownerSetPinBtn").click();
    await wait(30);

    ["phrasalAddBox", "idiomsAddBox", "sentencesAddBox", "patternsAddBox", "technicalAddBox"].forEach((id) => {
      expect(document.getElementById(id).style.display).not.toBe("none");
    });
  });
});

describe("Language Bank IndexedDB stores are independent per category", () => {
  it("getAllIdioms/getAllSentences/getAllPatterns/getAllTechnical never see each other's entries", async () => {
    const idb = new IDBFactory();
    const { hooks } = await loadApp({ indexedDBFactory: idb });

    hooks.addIdiomEntry({ w: "an idiom", senses: [], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }, { persist: true });
    hooks.addSentenceEntry({ w: "a sentence", senses: [], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }, { persist: true });
    hooks.addPatternEntry({ w: "a pattern", senses: [], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }, { persist: true });
    hooks.addTechnicalEntry({ w: "a technical term", senses: [], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }, { persist: true });
    await wait(50);

    const idioms = await VocabCache.getAllIdioms({ indexedDB: idb });
    const sentences = await VocabCache.getAllSentences({ indexedDB: idb });
    const patterns = await VocabCache.getAllPatterns({ indexedDB: idb });
    const technical = await VocabCache.getAllTechnical({ indexedDB: idb });

    expect(idioms.map((e) => e.w)).toEqual(["an idiom"]);
    expect(sentences.map((e) => e.w)).toEqual(["a sentence"]);
    expect(patterns.map((e) => e.w)).toEqual(["a pattern"]);
    expect(technical.map((e) => e.w)).toEqual(["a technical term"]);
  });
});
