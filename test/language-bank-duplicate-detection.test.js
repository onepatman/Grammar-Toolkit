// Regression coverage for a reported bug: retyping an already-saved
// Word Chunk ("touch base") into Look Up & Add still showed a "ready to
// be added" Save button instead of recognizing it as an existing entry.
// Two distinct gaps were involved:
//   1. findLanguageBankDuplicate()/findExistingDistinctionPair() only
//      normalized case/whitespace, not a trailing sentence-ending mark
//      (., !, ?) — so a retype missing the stored entry's closing
//      period slipped past the very first (pre-lookup) check.
//   2. The online lookup's own returned word/phrase (result.w) was
//      never re-checked against existing data before showing the Save
//      preview, even though it can differ from what was actually typed
//      (a dictionary/Wiktionary match doesn't always echo the query
//      back verbatim).
// This file proves both are fixed, across every Language Bank category
// (via the shared addLanguageBankEntryFromInput/findLanguageBankDuplicate
// path) and for Distinction Words, without breaking new-entry adds or
// incorrectly flagging genuinely different entries as duplicates.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Word Chunks: duplicate detection before showing Save", () => {
  it("an exact retype of an existing chunk is detected immediately, with no online lookup and no Save button", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("sentencesAddInput").value = "touch base";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    expect(lookupCalled).toBe(false);
    const statusEl = document.getElementById("sentencesAddStatus");
    expect(statusEl.textContent).toContain("already in the database");
    expect(document.getElementById("lookupModalSaveBtn")).toBeNull();
    // The duplicate-conflict popup replaces the old auto-navigate — the
    // Owner has to explicitly click View Existing.
    statusEl.querySelector("#dupConflictViewBtn").click();
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
  });

  it("a genuinely new chunk goes straight to the manual box, not yet saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("sentencesAddInput").value = "double-check the wiring diagram";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("sentencesAddStatus");
    expect(document.getElementById("sentencesManualBox").style.display).not.toBe("none");
    expect(hooks.sentencesData.some((e) => e.w === "double-check the wiring diagram")).toBe(false);
  });

  it("different capitalization is still recognized as the same entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("sentencesAddInput").value = "Touch Base";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    expect(lookupCalled).toBe(false);
    expect(document.getElementById("sentencesAddStatus").textContent).toContain("already in the database");
  });

  it("extra/collapsed whitespace is still recognized as the same entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("sentencesAddInput").value = "  touch   base  ";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    expect(lookupCalled).toBe(false);
    expect(document.getElementById("sentencesAddStatus").textContent).toContain("already in the database");
  });

  it("THE REPORTED BUG: retyping with a trailing period the stored entry doesn't have is still recognized as the same entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("sentencesAddInput").value = "touch base.";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    expect(lookupCalled).toBe(false);
    const statusEl = document.getElementById("sentencesAddStatus");
    expect(statusEl.textContent).toContain("already in the database");
    expect(document.getElementById("lookupModalSaveBtn")).toBeNull();
  });

  it("a genuinely different chunk is NOT incorrectly flagged as a duplicate", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("sentencesAddInput").value = "think about that for a moment";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("sentencesAddStatus");
    expect(statusEl.textContent).not.toContain("already in the database");
    expect(document.getElementById("sentencesManualBox").style.display).not.toBe("none");
    expect(hooks.sentencesData.some((e) => e.w === "think about that for a moment")).toBe(false);
  });
});

describe("Duplicate detection is shared across every Language Bank category", () => {
  it("Phrasal Verbs: an existing entry retyped with different case/whitespace is detected, no Save button", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    expect(hooks.phrasalData.some((e) => e.w === "move on")).toBe(true);
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("phrasalAddInput").value = "  Move On  ";
    document.getElementById("phrasalAddBtn").click();
    await wait(50);

    expect(lookupCalled).toBe(false);
    expect(document.getElementById("phrasalAddStatus").textContent).toContain("already in the database");
  });

  it("Idioms & Expressions: a new idiom still shows the Save button", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "a brand new test idiom",
      senses: [{ use: "(idiom) A made-up test phrase.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    document.getElementById("idiomsAddInput").value = "a brand new test idiom";
    document.getElementById("idiomsAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("idiomsAddStatus");
    expect(document.getElementById("lookupModalSubtitle").textContent).toContain("Ready to add");
    expect(document.getElementById("lookupModalSaveBtn")).toBeTruthy();
    expect(hooks.idiomsData.some((e) => e.w === "a brand new test idiom")).toBe(false);
  });

  it("Sentence Patterns and Technical Terms also route through the same shared duplicate check", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const existingPattern = hooks.patternsData[0];
    const existingTechnical = hooks.technicalData[0];
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("patternsAddInput").value = `  ${existingPattern.w.toUpperCase()}  `;
    document.getElementById("patternsAddBtn").click();
    await wait(50);
    expect(document.getElementById("patternsAddStatus").textContent).toContain("already in the database");

    document.getElementById("technicalAddInput").value = `  ${existingTechnical.w.toUpperCase()}  `;
    document.getElementById("technicalAddBtn").click();
    await wait(50);
    expect(document.getElementById("technicalAddStatus").textContent).toContain("already in the database");

    expect(lookupCalled).toBe(false);
  });
});

describe("Distinction Words: duplicate detection before showing Save", () => {
  it("an existing pair retyped in either order/case is detected, with no online lookup and no Save button", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const existingPair = hooks.distinctionsData.find((e) => e.word1.w === "Achieve" && e.word2.w === "Attain");
    expect(existingPair).toBeTruthy();
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("distinctionsAddInput1").value = "  achieve  ";
    document.getElementById("distinctionsAddInput2").value = "ATTAIN";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    expect(lookupCalled).toBe(false);
    const statusEl = document.getElementById("distinctionsAddStatus");
    expect(statusEl.textContent).toContain("already in the database");
    expect(document.getElementById("lookupModalSaveBtn")).toBeNull();
  });

  it("a genuinely new pair goes straight to the manual boxes, not yet saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("distinctionsAddInput1").value = "arise-dup-test";
    document.getElementById("distinctionsAddInput2").value = "quibblet-dup-test";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    expect(document.getElementById("distinctionsManualBox").style.display).not.toBe("none");
    expect(document.getElementById("distinctionsManualWord1Box").style.display).not.toBe("none");
    expect(document.getElementById("distinctionsManualWord2Box").style.display).not.toBe("none");
    expect(hooks.distinctionsData.some((e) => e.word1.w === "arise-dup-test")).toBe(false);
  });

  it("two genuinely different word pairs are NOT incorrectly flagged as duplicates", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("distinctionsAddInput1").value = "unrelated-word-one";
    document.getElementById("distinctionsAddInput2").value = "unrelated-word-two";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("distinctionsAddStatus");
    expect(statusEl.textContent).not.toContain("already");
    expect(document.getElementById("distinctionsManualBox").style.display).not.toBe("none");
  });
});
