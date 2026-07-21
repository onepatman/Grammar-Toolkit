// Integration tests for Vocabulary Management: the Vocabulary tab's own
// "+ Add Vocabulary Word" flow, its Search/Sort By controls, and the
// delete-safety fix ensuring a Vocabulary Bank record shared with
// another category (Distinctions, Language Bank, etc.) doesn't vanish
// from global search when only its Vocabulary Bank record is deleted.
// Loads the real index.html in jsdom and dispatches real DOM
// interactions, same as every other integration test in this repo.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ONLINE_APPREHENSION_RESULT = {
  w: "apprehension",
  senses: [{ use: "(noun) Anxiety or fear that something bad will happen.", examples: ["She felt a sense of apprehension before the exam."] }],
  syn: ["anxiety", "dread"],
  ant: ["confidence"],
  mistake: null,
  tagalog: null,
  source: "online"
};

function stubFetch(window, result) {
  window.OnlineLookup.fetchOnlineDefinition = async () => result;
}

describe("Vocabulary tab — '+ Add Vocabulary Word'", () => {
  it("the toggle button opens the input box and Cancel closes it again", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("vocabAddBox").style.display).toBe("none");

    document.getElementById("vocabAddToggleBtn").click();
    expect(document.getElementById("vocabAddBox").style.display).not.toBe("none");

    document.getElementById("vocabAddCancelBtn").click();
    expect(document.getElementById("vocabAddBox").style.display).toBe("none");
    expect(document.getElementById("vocabAddInput").value).toBe("");
  });

  it("the toggle button is hidden on a locked device", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    expect(document.getElementById("vocabAddToggleRow").style.display).toBe("none");
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const before = hooks.vocabData.length;
    document.getElementById("vocabAddBtn").click();
    await wait();
    expect(document.getElementById("vocabAddStatus").textContent).toContain("enter a vocabulary word");
    expect(hooks.vocabData.length).toBe(before);
  });

  it("a locked device cannot add a word even by calling the input flow directly", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("vocabAddInput").value = "apprehension";
    await hooks.addVocabWordFromInput();
    expect(document.getElementById("vocabAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.vocabData.some((v) => v.w === "apprehension")).toBe(false);
  });

  it("looks up online, previews the result with Save/Decline, and only persists once Save is clicked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, ONLINE_APPREHENSION_RESULT);

    document.getElementById("vocabAddInput").value = "apprehension";
    document.getElementById("vocabAddBtn").click();
    await wait();

    const statusEl = document.getElementById("vocabAddStatus");
    expect(statusEl.textContent).toContain("ready to be added");
    expect(hooks.vocabData.some((v) => v.w === "apprehension")).toBe(false);

    statusEl.querySelector(".vocab-add-save-btn").click();
    await wait();

    expect(document.getElementById("vocabAddStatus").textContent).toContain("has been added");
    const saved = hooks.vocabData.find((v) => v.w === "apprehension");
    expect(saved).toBeTruthy();
    expect(saved.addedAt).toBeGreaterThan(0);
    expect(saved.modifiedAt).toBe(saved.addedAt);
    expect(hooks.wordIndexMap.get("apprehension").cat).toBe("Vocabulary Bank");
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("apprehension");
  });

  it("Decline discards the preview — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, ONLINE_APPREHENSION_RESULT);

    document.getElementById("vocabAddInput").value = "apprehension";
    document.getElementById("vocabAddBtn").click();
    await wait();

    document.getElementById("vocabAddStatus").querySelector(".vocab-add-decline-btn").click();
    await wait();

    expect(document.getElementById("vocabAddStatus").textContent).toBe("Not saved.");
    expect(hooks.vocabData.some((v) => v.w === "apprehension")).toBe(false);
  });

  it("shows nothing found and adds nothing when the online lookup comes up empty", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubFetch(window, null);

    document.getElementById("vocabAddInput").value = "zzznotarealword";
    document.getElementById("vocabAddBtn").click();
    await wait();

    expect(document.getElementById("vocabAddStatus").textContent).toContain("Couldn't find");
    expect(hooks.vocabData.some((v) => v.w === "zzznotarealword")).toBe(false);
  });

  describe("duplicate prevention (case-insensitive, whitespace-normalized)", () => {
    it("a word already in the Vocabulary Bank shows 'already available' and navigates to it instead of looking it up online", async () => {
      const { window, hooks } = await loadApp();
      const document = window.document;
      let fetchCalled = false;
      window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

      // "abandon" is a built-in Vocabulary Bank word.
      document.getElementById("vocabAddInput").value = "  Abandon  ";
      document.getElementById("vocabAddBtn").click();
      await wait();

      expect(fetchCalled).toBe(false);
      expect(document.getElementById("vocabAddStatus").textContent).toContain("already available in the Vocabulary Bank");
      expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
      expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");
      // Still exactly one record for it.
      expect(hooks.vocabData.filter((v) => v.w.toLowerCase() === "abandon")).toHaveLength(1);
    });

    it("APPREHENSION / apprehension / Apprehension are all treated as the same word", async () => {
      const { window, hooks } = await loadApp();
      const document = window.document;
      stubFetch(window, ONLINE_APPREHENSION_RESULT);

      document.getElementById("vocabAddInput").value = "apprehension";
      document.getElementById("vocabAddBtn").click();
      await wait();
      document.getElementById("vocabAddStatus").querySelector(".vocab-add-save-btn").click();
      await wait();
      expect(hooks.vocabData.filter((v) => v.w.toLowerCase() === "apprehension")).toHaveLength(1);

      let fetchCalledAgain = false;
      window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalledAgain = true; return null; };
      document.getElementById("vocabAddInput").value = "APPREHENSION";
      document.getElementById("vocabAddBtn").click();
      await wait();

      expect(fetchCalledAgain).toBe(false);
      expect(document.getElementById("vocabAddStatus").textContent).toContain("already available in the Vocabulary Bank");
      expect(hooks.vocabData.filter((v) => v.w.toLowerCase() === "apprehension")).toHaveLength(1);
    });

    it("a collision that appears while the Save/Decline preview is waiting is caught at Save time too, without creating a duplicate", async () => {
      const { window, hooks } = await loadApp();
      const document = window.document;
      stubFetch(window, ONLINE_APPREHENSION_RESULT);

      document.getElementById("vocabAddInput").value = "apprehension";
      document.getElementById("vocabAddBtn").click();
      await wait();

      // Simulate another device syncing the same word in while this
      // preview sits on screen.
      hooks.addVocabEntry({ ...ONLINE_APPREHENSION_RESULT, addedAt: 1, modifiedAt: 1 }, { persist: false });

      document.getElementById("vocabAddStatus").querySelector(".vocab-add-save-btn").click();
      await wait();

      expect(document.getElementById("vocabAddStatus").textContent).toContain("already available in the Vocabulary Bank");
      expect(hooks.vocabData.filter((v) => v.w.toLowerCase() === "apprehension")).toHaveLength(1);
    });
  });
});

describe("Vocabulary tab — Search Vocabulary filter", () => {
  it("narrows the dropdown to matching words only, without touching vocabData's order or content", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const dataOrderBefore = hooks.vocabData.map((v) => v.w);
    const dataLengthBefore = hooks.vocabData.length;

    const filterEl = document.getElementById("vocabFilterInput");
    filterEl.value = "abandon";
    filterEl.dispatchEvent(new window.Event("input"));

    const options = Array.from(document.getElementById("vocabSelect").options).map((o) => o.value);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((w) => w.toLowerCase().includes("abandon"))).toBe(true);

    // The underlying Master Vocabulary Bank is completely untouched.
    expect(hooks.vocabData.map((v) => v.w)).toEqual(dataOrderBefore);
    expect(hooks.vocabData.length).toBe(dataLengthBefore);
  });

  it("clearing the filter restores the full list", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const fullCount = hooks.vocabData.length;

    const filterEl = document.getElementById("vocabFilterInput");
    filterEl.value = "abandon";
    filterEl.dispatchEvent(new window.Event("input"));
    expect(document.getElementById("vocabSelect").options.length).toBeLessThan(fullCount);

    filterEl.value = "";
    filterEl.dispatchEvent(new window.Event("input"));
    expect(document.getElementById("vocabSelect").options.length).toBe(fullCount);
  });

  it("Previous/Next only cycles through the filtered results, never breaking dropdown or navigation functionality", async () => {
    const { window } = await loadApp();
    const document = window.document;

    const filterEl = document.getElementById("vocabFilterInput");
    filterEl.value = "abandon";
    filterEl.dispatchEvent(new window.Event("input"));

    const options = Array.from(document.getElementById("vocabSelect").options).map((o) => o.value);
    expect(options.length).toBeGreaterThan(0);

    document.getElementById("vocabSelect").value = options[0];
    document.querySelector('.bottom-nav .nav-btn[data-target="vocabSelect"][data-dir="next"]').click();
    expect(options).toContain(document.getElementById("vocabSelect").value);
  });

  it("never breaks global search — the filter is local to the Vocabulary tab only", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    const filterEl = document.getElementById("vocabFilterInput");
    filterEl.value = "abandon";
    filterEl.dispatchEvent(new window.Event("input"));

    hooks.runSearchPipeline("abandon");
    const labels = Array.from(document.querySelectorAll("#searchResults .search-result-item .label")).map((el) => el.textContent.toLowerCase());
    expect(labels).toContain("abandon");
  });
});

describe("Vocabulary tab — Sort By", () => {
  function setSort(document, value) {
    const el = document.getElementById("vocabSortSelect");
    el.value = value;
    el.dispatchEvent(new (el.ownerDocument.defaultView.Event)("change"));
  }

  it("defaults to A–Z and the built-in list starts alphabetically sorted", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("vocabSortSelect").value).toBe("az");
    const labels = Array.from(document.getElementById("vocabSelect").options).map((o) => o.textContent);
    const sorted = labels.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    expect(labels).toEqual(sorted);
  });

  it("Recently Added shows the newest entry first, without mutating vocabData's order or content", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "aaa-older-word", senses: [{ use: "(noun) Older.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addVocabEntry(
      { w: "zzz-newer-word", senses: [{ use: "(noun) Newer.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );
    hooks.applyVocabListView();
    const dataOrderBefore = hooks.vocabData.map((v) => v.w);

    setSort(document, "added-desc");

    const options = Array.from(document.getElementById("vocabSelect").options).map((o) => o.value);
    expect(options[0]).toBe("zzz-newer-word");
    expect(options[1]).toBe("aaa-older-word");
    expect(hooks.vocabData.map((v) => v.w)).toEqual(dataOrderBefore);
  });

  it("Recently Modified shows the most recently edited word first, even though it was added first", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "edited-first-word", senses: [{ use: "(noun) One.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addVocabEntry(
      { w: "untouched-second-word", senses: [{ use: "(noun) Two.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );

    document.getElementById("vocabSelect").value = "edited-first-word";
    hooks.openVocabEditForm(hooks.vocabData.find((v) => v.w === "edited-first-word"), document.getElementById("vocabEntry"));
    document.getElementById("vocabEditUse").value = "(noun) One, edited.";
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    setSort(document, "modified-desc");
    const options = Array.from(document.getElementById("vocabSelect").options).map((o) => o.value);
    expect(options[0]).toBe("edited-first-word");
  });

  it("persists the chosen preference across a reload", async () => {
    const { window } = await loadApp({ localStorage: { mepf_toolkit_vocab_sort: "added-desc" } });
    expect(window.document.getElementById("vocabSortSelect").value).toBe("added-desc");
  });

  it("never breaks Previous/Next navigation", async () => {
    const { window } = await loadApp();
    const document = window.document;
    setSort(document, "added-desc");
    const before = document.getElementById("vocabSelect").value;
    document.querySelector('.bottom-nav .nav-btn[data-target="vocabSelect"][data-dir="next"]').click();
    expect(document.getElementById("vocabSelect").value).not.toBe(before);
  });

  it("never breaks global search", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    setSort(document, "added-desc");
    hooks.runSearchPipeline("abandon");
    const labels = Array.from(document.querySelectorAll("#searchResults .search-result-item .label")).map((el) => el.textContent.toLowerCase());
    expect(labels).toContain("abandon");
  });
});

describe("Vocabulary tab — Edit maintains timestamps", () => {
  it("editing an entry stamps a new modifiedAt while preserving the original addedAt", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "timestamped-word", senses: [{ use: "(noun) One.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "timestamped-word");

    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));
    document.getElementById("vocabEditUse").value = "(noun) One, edited.";
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "timestamped-word");
    expect(updated.addedAt).toBe(1000);
    expect(updated.modifiedAt).toBeGreaterThan(1000);
  });
});

describe("Delete-safety: deleting a Vocabulary Bank record must not remove a word from global search when it still exists in another category", () => {
  it("'under' (a built-in Vocabulary Bank word AND a built-in Preposition) stays searchable and findable as a Preposition after its Vocabulary Bank record is deleted", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    expect(hooks.vocabData.some((v) => v.w === "under")).toBe(true);
    expect(hooks.prepData.some((p) => p.w === "under")).toBe(true);
    expect(hooks.wordIndexMap.get("under").cat).toBe("Vocabulary Bank");

    await hooks.deleteVocabEntry("under", { skipSync: true });

    // The Vocabulary Bank record itself is gone...
    expect(hooks.vocabData.some((v) => v.w === "under")).toBe(false);

    // ...but the underlying Preposition content is completely untouched.
    expect(hooks.prepData.some((p) => p.w === "under")).toBe(true);

    // The word must still resolve to SOMETHING in the Master Vocabulary
    // Bank — not vanish just because Vocabulary Bank briefly outranked
    // the Preposition entry — and that something must now be the
    // Preposition record, since Vocabulary Bank no longer exists.
    const reindexed = hooks.wordIndexMap.get("under");
    expect(reindexed).toBeTruthy();
    expect(reindexed.cat).toBe("Preposition");

    // And it must still turn up in global search.
    hooks.runSearchPipeline("under");
    const labels = Array.from(document.querySelectorAll("#searchResults .search-result-item .label")).map((el) => el.textContent.toLowerCase());
    expect(labels).toContain("under");
  });

  it("a word that only ever existed as a Vocabulary Bank record is fully removed from search after delete (no orphaned wordIndexMap entry)", async () => {
    const { hooks } = await loadApp();
    hooks.addVocabEntry(
      { w: "onlyinvocab", senses: [{ use: "(noun) Test.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    expect(hooks.wordIndexMap.get("onlyinvocab")).toBeTruthy();

    await hooks.deleteVocabEntry("onlyinvocab", { skipSync: true });

    expect(hooks.wordIndexMap.get("onlyinvocab")).toBeUndefined();
    expect(hooks.vocabData.some((v) => v.w === "onlyinvocab")).toBe(false);
  });

  it("deleting a word promoted to Vocabulary Bank via Save to Vocabulary Bank (from Language Bank) falls back to the Language Bank entry, not a dangling reference", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const PHRASAL_RESULT = {
      w: "shared-phrasal-word",
      senses: [{ use: "(verb) A shared test entry.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    };
    window.OnlineLookup.fetchOnlineDefinition = async () => PHRASAL_RESULT;

    // Add it as a Phrasal Verb first.
    document.getElementById("phrasalAddInput").value = "shared-phrasal-word";
    document.getElementById("phrasalAddBtn").click();
    await wait();
    document.getElementById("phrasalAddStatus").querySelector(".lb-lookup-save-btn").click();
    await wait();
    expect(hooks.phrasalData.some((p) => p.w === "shared-phrasal-word")).toBe(true);
    expect(hooks.wordIndexMap.get("shared-phrasal-word").cat).toBe("Phrasal Verb");

    // Now "Save to Vocabulary Bank" for the same word — Vocabulary Bank
    // becomes canonical, but the Phrasal Verb entry must stay intact.
    const saveBtn = document.getElementById("phrasalAddStatus").querySelector(".vocab-bank-check-save-btn");
    expect(saveBtn).toBeTruthy();
    saveBtn.click();
    await wait();
    expect(hooks.vocabData.some((v) => v.w === "shared-phrasal-word")).toBe(true);
    expect(hooks.wordIndexMap.get("shared-phrasal-word").cat).toBe("Vocabulary Bank");

    // Delete the Vocabulary Bank record — the Phrasal Verb entry must
    // remain, and search must fall back to it.
    await hooks.deleteVocabEntry("shared-phrasal-word", { skipSync: true });
    expect(hooks.phrasalData.some((p) => p.w === "shared-phrasal-word")).toBe(true);
    const reindexed = hooks.wordIndexMap.get("shared-phrasal-word");
    expect(reindexed).toBeTruthy();
    expect(reindexed.cat).toBe("Phrasal Verb");

    hooks.runSearchPipeline("shared-phrasal-word");
    const labels = Array.from(document.querySelectorAll("#searchResults .search-result-item .label")).map((el) => el.textContent.toLowerCase());
    expect(labels).toContain("shared-phrasal-word");
  });
});

describe("Save to Vocabulary Bank (Language Bank / Distinctions) uses the same canonical addVocabEntry() — no duplicates", () => {
  it("Save to Vocabulary Bank from a Language Bank entry stamps timestamps and creates exactly one Vocabulary Bank record", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const IDIOM_RESULT = {
      w: "zzz-unique-test-idiom",
      senses: [{ use: "(idiom) A made-up test idiom.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    };
    window.OnlineLookup.fetchOnlineDefinition = async () => IDIOM_RESULT;

    document.getElementById("idiomsAddInput").value = "zzz-unique-test-idiom";
    document.getElementById("idiomsAddBtn").click();
    await wait();
    document.getElementById("idiomsAddStatus").querySelector(".lb-lookup-save-btn").click();
    await wait();

    const saveBtn = document.getElementById("idiomsAddStatus").querySelector(".vocab-bank-check-save-btn");
    expect(saveBtn).toBeTruthy();
    saveBtn.click();
    await wait();

    expect(hooks.vocabData.filter((v) => v.w === "zzz-unique-test-idiom")).toHaveLength(1);
    const saved = hooks.vocabData.find((v) => v.w === "zzz-unique-test-idiom");
    expect(saved.addedAt).toBeGreaterThan(0);
    expect(saved.modifiedAt).toBe(saved.addedAt);
  });

  it("a word already known to the Master Vocabulary Bank is never re-looked-up or duplicated when typed into a Language Bank add box", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    // "abandon" is already a built-in Vocabulary Bank word — typing it
    // into the Phrasal Verb quick-add box must navigate straight to the
    // existing Master Vocabulary Bank record instead of looking it up
    // online or creating a second (phrasal) record for the same word.
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    document.getElementById("phrasalAddInput").value = "abandon";
    document.getElementById("phrasalAddBtn").click();
    await wait();

    expect(fetchCalled).toBe(false);
    expect(document.getElementById("phrasalAddStatus").textContent).toContain("already in the database");
    expect(hooks.phrasalData.some((p) => p.w.toLowerCase() === "abandon")).toBe(false);
    expect(hooks.vocabData.filter((v) => v.w.toLowerCase() === "abandon")).toHaveLength(1);
  });
});
