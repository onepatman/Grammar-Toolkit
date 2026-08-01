// Integration tests for Vocabulary Management: the Vocabulary tab's Sort
// By control, Edit/Delete (including the delete-safety fix ensuring a
// Vocabulary Bank record shared with another category — Distinctions,
// Language Bank, etc. — doesn't vanish from global search when only its
// Vocabulary Bank record is deleted), the unified Save to Vocabulary
// Bank path from Language Bank/Distinctions, and the tab's own direct
// "Look Up & Add" box (#vocabAddBox — see addVocabEntryFromInput in
// index.html), added so every tab that stores dictionary content has a
// consistent, discoverable way to add an entry instead of relying on
// users knowing the global search bar doubles as an add flow. The old
// Vocab-tab-local *filter* input (vocabFilterInput/vocabAddToggleBtn)
// stays removed as redundant — see git history — only the add box is
// back, in a different, non-redundant shape. Loads the real index.html
// in jsdom and dispatches real DOM interactions, same as every other
// integration test in this repo.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Vocabulary tab — no redundant filter UI, but a direct Look Up & Add box", () => {
  it("does not render the old Vocab-tab-local search filter/toggle", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("vocabFilterInput")).toBeNull();
    expect(document.getElementById("vocabAddToggleBtn")).toBeNull();
  });

  it("renders a direct Look Up & Add box with an input, button, and status area", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("vocabAddBox")).not.toBeNull();
    expect(document.getElementById("vocabAddInput")).not.toBeNull();
    expect(document.getElementById("vocabAddBtn")).not.toBeNull();
    expect(document.getElementById("vocabAddStatus")).not.toBeNull();
  });

  it("the Vocabulary tab still exposes Sort By and the select/entry/Prev-Next controls", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="vocab"]').click();
    expect(document.getElementById("vocabSortSelect")).not.toBeNull();
    expect(document.getElementById("vocabSelect")).not.toBeNull();
    expect(document.querySelector('.bottom-nav .nav-btn[data-target="vocabSelect"][data-dir="next"]')).not.toBeNull();
  });

  it("the shared global search bar (the single Look Up & Add interface) stays visible and usable for everyone, owner or not", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="vocab"]').click();
    expect(document.getElementById("globalSearch")).not.toBeNull();
    expect(document.getElementById("globalSearch").offsetParent !== null || document.getElementById("globalSearch").style.display !== "none").toBe(true);

    hooks.runSearchPipeline("abandon");
    const labels = Array.from(document.querySelectorAll("#searchResults .search-result-item .label")).map((el) => el.textContent.toLowerCase());
    expect(labels).toContain("abandon");
  });
});

const SAMPLE_VOCAB_RESULT = {
  w: "reinforcement",
  senses: [{ use: "(noun) Material or structure that strengthens something.", examples: ["Steel bars provide reinforcement for the concrete slab."] }],
  syn: ["support"],
  ant: [],
  mistake: null,
  tagalog: null,
  source: "online"
};

describe("Vocabulary tab's direct Look Up & Add box (addVocabEntryFromInput)", () => {
  it("shows an error and looks nothing up when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("vocabAddBtn").click();
    await wait(10);
    expect(document.getElementById("vocabAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked() — a locked device gets a clear error, not silence", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("vocabAddInput").value = "reinforcement";
    document.getElementById("vocabAddBtn").click();
    await wait(30);
    expect(document.getElementById("vocabAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.vocabData.some((v) => v.w === "reinforcement")).toBe(false);
  });

  it("does not create a duplicate and instead navigates to an already-known built-in word, without ever calling the online lookup", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    document.getElementById("vocabAddInput").value = "abandon";
    document.getElementById("vocabAddBtn").click();
    await wait(30);

    expect(fetchCalled).toBe(false);
    expect(document.getElementById("vocabAddStatus").textContent).toContain("already in the database");
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("abandon");
  });

  it("looks up a genuinely new word online and shows it as an unsaved preview with a Save button — not auto-saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => SAMPLE_VOCAB_RESULT;

    document.getElementById("vocabAddInput").value = "reinforcement";
    document.getElementById("vocabAddBtn").click();
    await wait(30);

    expect(hooks.vocabData.some((v) => v.w === "reinforcement")).toBe(false);
    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("lookupModalTitle").textContent).toBe("reinforcement");
    expect(document.getElementById("lookupModalSubtitle").textContent).toContain("Ready to add");
    const saveBtn = document.getElementById("lookupModalSaveBtn");
    expect(saveBtn).not.toBeNull();
    expect(document.getElementById("lookupModalDeclineBtn")).not.toBeNull();

    saveBtn.click();
    await wait(30);

    expect(document.getElementById("lookupModal").style.display).toBe("none");
    expect(hooks.vocabData.some((v) => v.w === "reinforcement")).toBe(true);
    expect(hooks.wordIndexMap.get("reinforcement")).toBeTruthy();
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("reinforcement");
    expect(document.getElementById("vocabAddStatus").textContent).toContain("has been added to your Vocabulary Bank");
  });

  it("shows the preview's definition without the leading '(part of speech)' marker cluttering the text", async () => {
    // Regression: the preview card used to render a sense's raw `use`
    // text verbatim, so an online-lookup sense like SAMPLE_VOCAB_RESULT's
    // "(noun) Material or structure..." showed the "(noun) " prefix
    // baked right into the numbered definition — confusing, and
    // inconsistent with the saved Vocabulary Bank view, which already
    // strips this same prefix out via parseSensePos().
    const { window } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => SAMPLE_VOCAB_RESULT;

    document.getElementById("vocabAddInput").value = "reinforcement";
    document.getElementById("vocabAddBtn").click();
    await wait(30);

    const useEl = document.getElementById("lookupModalBody").querySelector(".use");
    expect(useEl.textContent).toBe("Material or structure that strengthens something.");
    expect(useEl.textContent).not.toContain("(noun)");
  });

  it("Decline discards the previewed word — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => SAMPLE_VOCAB_RESULT;

    document.getElementById("vocabAddInput").value = "reinforcement";
    document.getElementById("vocabAddBtn").click();
    await wait(30);

    document.getElementById("lookupModalDeclineBtn").click();
    await wait(10);

    expect(document.getElementById("lookupModal").style.display).toBe("none");
    expect(hooks.vocabData.some((v) => v.w === "reinforcement")).toBe(false);
    expect(hooks.wordIndexMap.has("reinforcement")).toBe(false);
    expect(document.getElementById("vocabAddStatus").textContent).toContain("Not saved");
  });

  it("shows a clear error, and adds nothing, when nothing is found online", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;

    document.getElementById("vocabAddInput").value = "zzznotarealword zzz";
    document.getElementById("vocabAddBtn").click();
    await wait(30);

    expect(document.getElementById("vocabAddStatus").textContent).toContain("Couldn't find");
    expect(hooks.vocabData.some((v) => v.w === "zzznotarealword zzz")).toBe(false);
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
    document.querySelector("#vocabEntry .vocab-edit-meaning-use").value = "One, edited.";
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
    document.querySelector("#vocabEntry .vocab-edit-meaning-use").value = "One, edited.";
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "timestamped-word");
    expect(updated.addedAt).toBe(1000);
    expect(updated.modifiedAt).toBeGreaterThan(1000);
  });
});

// A multi-part-of-speech, multi-meaning online lookup result (e.g.
// "most": noun x2, adverb x2, pronoun x1) — the exact shape of entry
// whose edit used to collapse down to a single definition, discarding
// everything else the moment the Owner opened Edit and clicked Save.
const MULTI_POS_ENTRY = {
  w: "most-test",
  senses: [
    { use: "(noun) The greatest quantity or amount.", examples: ["Most of the work is done."] },
    { use: "(noun) The majority of people.", examples: ["Most agree with the plan."] },
    { use: "(adverb) To the greatest extent.", examples: ["This is the most efficient method."] },
    { use: "(adverb) Very.", examples: ["That's a most unusual result."] },
    { use: "(pronoun) The greatest number or part.", examples: ["Most of them left early."] }
  ],
  syn: [], ant: [], mistake: null, tagalog: null, source: "online"
};

describe("Vocabulary editor — preserves every part of speech and every meaning (not just the first)", () => {
  it("opening and saving a multi-POS entry unchanged keeps every part of speech and every meaning intact", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry({ ...MULTI_POS_ENTRY }, { persist: false });
    const original = hooks.vocabData.find((v) => v.w === "most-test");

    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));
    // Sanity check the editor actually rendered one box per part of
    // speech and one row per meaning, matching the read-only display.
    expect(document.querySelectorAll("#vocabEntry .vocab-edit-pos-group").length).toBe(3); // noun, adverb, pronoun
    expect(document.querySelectorAll("#vocabEntry .vocab-edit-meaning").length).toBe(5);

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "most-test");
    expect(updated.senses).toHaveLength(5);
    expect(updated.senses.map((s) => s.use)).toEqual(MULTI_POS_ENTRY.senses.map((s) => s.use));
    expect(updated.senses.map((s) => s.examples)).toEqual(MULTI_POS_ENTRY.senses.map((s) => s.examples));
  });

  it("'+ Add another meaning to this part of speech' adds a new meaning under the SAME part of speech on save", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "addmeaning-test", senses: [{ use: "(noun) The first sense.", examples: ["Example one."] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "addmeaning-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    document.querySelector("#vocabEntry .vocab-edit-add-meaning-btn").click();
    const meaningRows = document.querySelectorAll("#vocabEntry .vocab-edit-meaning");
    expect(meaningRows).toHaveLength(2);
    meaningRows[1].querySelector(".vocab-edit-meaning-use").value = "A second sense.";
    meaningRows[1].querySelector(".lb-edit-example-input").value = "Example two.";

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "addmeaning-test");
    expect(updated.senses).toHaveLength(2);
    expect(updated.senses[0].use).toBe("(noun) The first sense.");
    expect(updated.senses[1].use).toBe("(noun) A second sense.");
    expect(updated.senses[1].examples).toEqual(["Example two."]);
  });

  it("'+ Add another part of speech' adds a brand-new POS group that's saved alongside the existing ones", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry({ ...MULTI_POS_ENTRY, w: "addpos-test" }, { persist: false });
    const original = hooks.vocabData.find((v) => v.w === "addpos-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    document.getElementById("vocabEditAddPosBtn").click();
    const groups = document.querySelectorAll("#vocabEntry .vocab-edit-pos-group");
    expect(groups).toHaveLength(4);
    const newGroup = groups[groups.length - 1];
    newGroup.querySelector(".vocab-edit-pos-input").value = "interjection";
    newGroup.querySelector(".vocab-edit-meaning-use").value = "Used to express surprise.";

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "addpos-test");
    expect(updated.senses).toHaveLength(6);
    expect(updated.senses[5].use).toBe("(interjection) Used to express surprise.");
  });

  it("removing one meaning removes only that meaning, leaving its part of speech's other meanings intact", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry({ ...MULTI_POS_ENTRY, w: "removemeaning-test" }, { persist: false });
    const original = hooks.vocabData.find((v) => v.w === "removemeaning-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    // Remove the SECOND noun meaning ("The majority of people.") — the
    // first noun group's second meaning row.
    const nounGroup = document.querySelectorAll("#vocabEntry .vocab-edit-pos-group")[0];
    const nounMeanings = nounGroup.querySelectorAll(".vocab-edit-meaning");
    expect(nounMeanings).toHaveLength(2);
    nounMeanings[1].querySelector(".vocab-edit-remove-meaning-btn").click();
    expect(nounGroup.querySelectorAll(".vocab-edit-meaning")).toHaveLength(1);

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "removemeaning-test");
    expect(updated.senses).toHaveLength(4);
    expect(updated.senses.map((s) => s.use)).not.toContain("(noun) The majority of people.");
    expect(updated.senses.map((s) => s.use)).toContain("(noun) The greatest quantity or amount.");
    expect(updated.senses.map((s) => s.use)).toContain("(adverb) To the greatest extent.");
  });

  it("removing a part of speech's only meaning removes the whole part-of-speech group", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry({ ...MULTI_POS_ENTRY, w: "removepos-test" }, { persist: false });
    const original = hooks.vocabData.find((v) => v.w === "removepos-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    // The pronoun group has exactly one meaning — removing it should
    // drop the whole group, not leave an empty part-of-speech box.
    const groups = document.querySelectorAll("#vocabEntry .vocab-edit-pos-group");
    const pronounGroup = groups[groups.length - 1];
    expect(pronounGroup.querySelector(".vocab-edit-pos-input").value).toBe("pronoun");
    pronounGroup.querySelector(".vocab-edit-remove-meaning-btn").click();
    expect(document.querySelectorAll("#vocabEntry .vocab-edit-pos-group")).toHaveLength(2);

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "removepos-test");
    expect(updated.senses).toHaveLength(4);
    expect(updated.senses.some((s) => s.use.startsWith("(pronoun)"))).toBe(false);
  });

  it("'🗑 Remove this part of speech' removes every meaning under it at once", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry({ ...MULTI_POS_ENTRY, w: "removewholepos-test" }, { persist: false });
    const original = hooks.vocabData.find((v) => v.w === "removewholepos-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    const nounGroup = document.querySelectorAll("#vocabEntry .vocab-edit-pos-group")[0];
    nounGroup.querySelector(".vocab-edit-remove-group-btn").click();
    expect(document.querySelectorAll("#vocabEntry .vocab-edit-pos-group")).toHaveLength(2);

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "removewholepos-test");
    expect(updated.senses).toHaveLength(3);
    expect(updated.senses.some((s) => s.use.startsWith("(noun)"))).toBe(false);
  });

  it("an owner-entered usage note is saved and shown under its meaning", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "usagenote-test", senses: [{ use: "(adjective) Formal in register.", examples: ["A stately, formal tone."] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "usagenote-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));
    document.querySelector("#vocabEntry .vocab-edit-meaning-notes").value = "Chiefly used in formal writing.";
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "usagenote-test");
    expect(updated.senses[0].notes).toBe("Chiefly used in formal writing.");

    hooks.renderRuleEntry(updated, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");
    expect(document.getElementById("vocabEntry").querySelector(".sense-notes").textContent).toContain("Chiefly used in formal writing.");
  });

  it("a word origin entered in the editor is saved and shown in its own section", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "origin-test", senses: [{ use: "(noun) A test word.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "origin-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));
    document.getElementById("vocabEditOrigin").value = "From Middle English, testen.";
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "origin-test");
    expect(updated.origin).toBe("From Middle English, testen.");

    hooks.renderRuleEntry(updated, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");
    const entryText = document.getElementById("vocabEntry").textContent;
    expect(entryText).toContain("Word origin");
    expect(entryText).toContain("From Middle English, testen.");
  });

  it("a blank meaning row (added but never filled in) is silently skipped, not saved as an empty definition", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "blankrow-test", senses: [{ use: "(noun) One real sense.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "blankrow-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));
    document.querySelector("#vocabEntry .vocab-edit-add-meaning-btn").click(); // left blank on purpose

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "blankrow-test");
    expect(updated.senses).toHaveLength(1);
  });

  it("a meaning row pre-fills one example-row per existing example, matching the entry's own count", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "multiexample-test", senses: [{ use: "(verb) To join together.", examples: ["First example.", "Second example.", "Third example."] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "multiexample-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    const meaningRow = document.querySelector("#vocabEntry .vocab-edit-meaning");
    const exampleInputs = meaningRow.querySelectorAll(".lb-edit-example-input");
    expect(Array.from(exampleInputs).map((inp) => inp.value)).toEqual(["First example.", "Second example.", "Third example."]);
  });

  it("'+ Add Example' adds another example input to that meaning, and both are saved on save", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "addexample-test", senses: [{ use: "(verb) To join together.", examples: ["First example."] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "addexample-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    document.querySelector("#vocabEntry .lb-edit-add-example-btn").click();
    const exampleInputs = document.querySelectorAll("#vocabEntry .vocab-edit-meaning .lb-edit-example-input");
    expect(exampleInputs).toHaveLength(2);
    exampleInputs[1].value = "Second example.";

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "addexample-test");
    expect(updated.senses[0].examples).toEqual(["First example.", "Second example."]);
  });

  it("Remove on an example row deletes just that example, keeping the rest and the meaning itself", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "removeexample-test", senses: [{ use: "(verb) To join together.", examples: ["Keep this one.", "Remove this one."] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "removeexample-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    const exampleRows = document.querySelectorAll("#vocabEntry .lb-edit-example-row");
    expect(exampleRows).toHaveLength(2);
    exampleRows[1].querySelector(".lb-edit-remove-example-btn").click();

    expect(document.querySelectorAll("#vocabEntry .lb-edit-example-row")).toHaveLength(1);

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "removeexample-test");
    expect(updated.senses[0].examples).toEqual(["Keep this one."]);
  });

  it("a blank example row (left empty) is silently dropped, not saved as an empty string", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "blankexample-test", senses: [{ use: "(verb) To join together.", examples: ["Real example."] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "blankexample-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    document.querySelector("#vocabEntry .lb-edit-add-example-btn").click(); // left blank on purpose

    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "blankexample-test");
    expect(updated.senses[0].examples).toEqual(["Real example."]);
  });
});

describe("Vocabulary editor — unlimited Tagalog/Filipino meanings (chip-based)", () => {
  it("a legacy '/'-joined tagalog string pre-fills as separate chips, one per term", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "tagalog-legacy-test", senses: [{ use: "(verb) To leave behind.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: "iwan / talikuran", source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "tagalog-legacy-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    const chips = document.querySelectorAll("#vocabEditTagalogChips .chip-editor-chip-text");
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(["iwan", "talikuran"]);
  });

  it("prefers tagalogCandidates over the flat tagalog string when both are present", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      {
        w: "tagalog-candidates-test",
        senses: [{ use: "(verb) To leave behind.", examples: [] }],
        syn: [], ant: [], mistake: null,
        tagalog: "iwan",
        tagalogCandidates: ["iwan", "talikuran", "hayaan"],
        source: "online"
      },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "tagalog-candidates-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    const chips = document.querySelectorAll("#vocabEditTagalogChips .chip-editor-chip-text");
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(["iwan", "talikuran", "hayaan"]);
  });

  it("adding multiple Tagalog chips and saving joins them with ' / ' into tagalog, and clears tagalogCandidates", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "tagalog-add-test", senses: [{ use: "(verb) To leave behind.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "tagalog-add-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    const tagalogChips = document.getElementById("vocabEditTagalogChips");
    tagalogChips.querySelector(".chip-editor-input").value = "iwan";
    hooks.commitChipEditorInput(tagalogChips);
    tagalogChips.querySelector(".chip-editor-input").value = "talikuran";
    hooks.commitChipEditorInput(tagalogChips);
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "tagalog-add-test");
    expect(updated.tagalog).toBe("iwan / talikuran");
    expect(updated.tagalogCandidates).toBeNull();
  });

  it("removing a Tagalog chip and saving drops just that term", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "tagalog-remove-test", senses: [{ use: "(verb) To leave behind.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: "iwan / talikuran / hayaan", source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "tagalog-remove-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    const tagalogChips = document.getElementById("vocabEditTagalogChips");
    tagalogChips.querySelectorAll(".chip-editor-chip")[1].querySelector(".chip-editor-remove").click(); // remove "talikuran"
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "tagalog-remove-test");
    expect(updated.tagalog).toBe("iwan / hayaan");
  });

  it("clearing every Tagalog chip and saving results in tagalog: null, not an empty string", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "tagalog-clear-test", senses: [{ use: "(verb) To leave behind.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: "iwan", source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "tagalog-clear-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    const tagalogChips = document.getElementById("vocabEditTagalogChips");
    tagalogChips.querySelector(".chip-editor-chip").querySelector(".chip-editor-remove").click();
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "tagalog-clear-test");
    expect(updated.tagalog).toBeNull();
  });

  it("every saved Tagalog term is independently searchable, not just the first one", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "tagalog-search-test", senses: [{ use: "(verb) To leave behind.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "tagalog-search-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    const tagalogChips = document.getElementById("vocabEditTagalogChips");
    tagalogChips.querySelector(".chip-editor-input").value = "sadyain";
    hooks.commitChipEditorInput(tagalogChips);
    tagalogChips.querySelector(".chip-editor-input").value = "tanuran";
    hooks.commitChipEditorInput(tagalogChips);
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    expect(hooks.searchIndex.some((i) => i.label === "sadyain" && i.cat === "Tagalog → tagalog-search-test")).toBe(true);
    expect(hooks.searchIndex.some((i) => i.label === "tanuran" && i.cat === "Tagalog → tagalog-search-test")).toBe(true);
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
    document.getElementById("lookupModalSaveBtn").click();
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
    document.getElementById("lookupModalSaveBtn").click();
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

describe("Vocabulary Bank — built-in seed words are also editable/deletable", () => {
  it("shows Edit/Delete for a built-in seed word (no .source) when unlocked, unlike a built-in word in another rule module", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const seedWord = hooks.vocabData.find((v) => v.w === "abandon");
    expect(seedWord.source).toBeUndefined();

    hooks.renderRuleEntry(seedWord, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");
    expect(document.getElementById("vocabEntry").querySelector(".lb-edit-btn")).toBeTruthy();
    expect(document.getElementById("vocabEntry").querySelector(".lb-delete-btn")).toBeTruthy();

    // A built-in Preposition is a different rule module entirely — this
    // relaxation is scoped to categoryKey "vocab" only, so it must stay
    // exactly as read-only as before.
    const prepWord = hooks.prepData.find((p) => p.w === "under");
    const prepEntryEl = document.getElementById("prepEntry");
    hooks.renderRuleEntry(prepWord, prepEntryEl, "Preposition", "preps");
    expect(prepEntryEl.querySelector(".lb-edit-btn")).toBeNull();
    expect(prepEntryEl.querySelector(".lb-delete-btn")).toBeNull();
  });

  it("shows Edit/Delete for a seed word opened via a global search result too, not just via the tab's own dropdown (regression: indexRuleModule was dropping categoryKey)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.runSearchPipeline("abandon");
    const match = document.querySelector("#searchResults .search-result-item");
    expect(match).toBeTruthy();
    match.click();
    await wait();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".lb-edit-btn")).toBeTruthy();
    expect(document.getElementById("vocabEntry").querySelector(".lb-delete-btn")).toBeTruthy();
  });

  it("editing a built-in seed word promotes it to an owner-saved (source:'online') IndexedDB record that survives a reload", async () => {
    const idb = new IDBFactory();
    const first = await loadApp({ indexedDBFactory: idb });
    const seedWord = first.hooks.vocabData.find((v) => v.w === "abandon");

    first.hooks.openVocabEditForm(seedWord, first.window.document.getElementById("vocabEntry"));
    first.window.document.querySelector("#vocabEntry .vocab-edit-meaning-use").value = "To give up completely, edited.";
    first.window.document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const edited = first.hooks.vocabData.find((v) => v.w === "abandon");
    expect(edited.source).toBe("online");
    expect(edited.senses[0].use).toBe("To give up completely, edited.");

    const second = await loadApp({ indexedDBFactory: idb });
    const reloaded = second.hooks.vocabData.find((v) => v.w === "abandon");
    expect(reloaded.senses[0].use).toBe("To give up completely, edited.");
  });

  it("deleting a built-in seed word removes it and — via the deletedSeedWords tombstone — it does not reappear after a reload", async () => {
    const idb = new IDBFactory();
    const first = await loadApp({ indexedDBFactory: idb });
    expect(first.hooks.vocabData.some((v) => v.w === "abandon")).toBe(true);

    await first.hooks.deleteVocabEntry("abandon");
    expect(first.hooks.vocabData.some((v) => v.w === "abandon")).toBe(false);

    const tombstoned = await VocabCache.getAllDeletedSeedWords({ indexedDB: idb });
    expect(tombstoned).toContain("abandon");

    const second = await loadApp({ indexedDBFactory: idb });
    expect(second.hooks.vocabData.some((v) => v.w === "abandon")).toBe(false);
    // Never actually leaked into the hardcoded array itself — only
    // filtered back out at restore time.
    expect(second.hooks.wordIndexMap.has("abandon")).toBe(false);
  });

  it("editing (not deleting) a seed word never writes a tombstone — the delete-then-add inside saveVocabEdit uses skipSync", async () => {
    const idb = new IDBFactory();
    const { window, hooks } = await loadApp({ indexedDBFactory: idb });
    const seedWord = hooks.vocabData.find((v) => v.w === "abandon");

    hooks.openVocabEditForm(seedWord, window.document.getElementById("vocabEntry"));
    window.document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const tombstoned = await VocabCache.getAllDeletedSeedWords({ indexedDB: idb });
    expect(tombstoned).not.toContain("abandon");
    expect(hooks.vocabData.some((v) => v.w === "abandon")).toBe(true);
  });

  it("collectDeletedSeedWordsForSync()/applyRemoteDeletedSeedWords() round-trip a seed-word deletion to another device", async () => {
    const deviceA = await loadApp();
    await deviceA.hooks.deleteVocabEntry("abandon");
    const payload = deviceA.hooks.collectDeletedSeedWordsForSync();
    expect(payload).toContain("abandon");

    const deviceB = await loadApp();
    expect(deviceB.hooks.vocabData.some((v) => v.w === "abandon")).toBe(true);
    deviceB.hooks.applyRemoteDeletedSeedWords(payload);
    expect(deviceB.hooks.vocabData.some((v) => v.w === "abandon")).toBe(false);
    expect(deviceB.hooks.deletedSeedWordsSet.has("abandon")).toBe(true);
  });

  it("addVocabEntry() with allowOverrideBuiltin:true adopts a synced edit (source:'online') of a seed word, exactly as applyRemoteVocab() calls it", async () => {
    const { hooks } = await loadApp();
    const seedWord = hooks.vocabData.find((v) => v.w === "abandon");
    expect(seedWord.source).toBeUndefined();

    // Simulates applyRemoteVocab replaying an edit made on another device
    // — the exact {persist, allowOverrideBuiltin} shape applyRemoteVocab uses.
    hooks.addVocabEntry(
      { w: "abandon", senses: [{ use: "Edited from another device.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false, allowOverrideBuiltin: true }
    );

    const updated = hooks.vocabData.find((v) => v.w === "abandon");
    expect(updated.source).toBe("online");
    expect(updated.senses[0].use).toBe("Edited from another device.");
    // Still exactly one record for the word, never a duplicate.
    expect(hooks.vocabData.filter((v) => v.w === "abandon")).toHaveLength(1);
  });

  it("addVocabEntry() WITHOUT allowOverrideBuiltin never overwrites a built-in seed word, even with an online-sourced entry sharing its spelling — an ordinary lookup must never silently clobber curated content", async () => {
    const { hooks } = await loadApp();
    const seedWord = hooks.vocabData.find((v) => v.w === "abandon");
    const originalUse = seedWord.senses[0].use;

    hooks.addVocabEntry(
      { w: "abandon", senses: [{ use: "Some other online result.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );

    const stillOriginal = hooks.vocabData.find((v) => v.w === "abandon");
    expect(stillOriginal.source).toBeUndefined();
    expect(stillOriginal.senses[0].use).toBe(originalUse);
    expect(hooks.vocabData.filter((v) => v.w === "abandon")).toHaveLength(1);
  });
});
