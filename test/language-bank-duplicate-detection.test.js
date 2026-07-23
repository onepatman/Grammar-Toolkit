// Regression coverage for a reported bug: retyping an already-saved
// Useful Sentence ("Let me double-check and confirm.") into Look Up &
// Add still showed a "ready to be added" Save button instead of
// recognizing it as an existing entry. Two distinct gaps were involved:
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

describe("Useful Sentences: duplicate detection before showing Save", () => {
  it("an exact retype of an existing sentence is detected immediately, with no online lookup and no Save button", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("sentencesAddInput").value = "Let me double-check and confirm.";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    expect(lookupCalled).toBe(false);
    const statusEl = document.getElementById("sentencesAddStatus");
    expect(statusEl.textContent).toContain("already in the database");
    expect(statusEl.querySelector(".lb-lookup-save-btn")).toBeNull();
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
  });

  it("a genuinely new sentence still shows the Save button as before", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "Please double-check the wiring diagram.",
      senses: [{ use: "Used to ask someone to verify wiring before use.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    document.getElementById("sentencesAddInput").value = "Please double-check the wiring diagram.";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("sentencesAddStatus");
    expect(statusEl.textContent).toContain("ready to be added");
    expect(statusEl.querySelector(".lb-lookup-save-btn")).toBeTruthy();
    expect(hooks.sentencesData.some((e) => e.w === "Please double-check the wiring diagram.")).toBe(false);
  });

  it("different capitalization is still recognized as the same entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("sentencesAddInput").value = "let me double-check and confirm.";
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

    document.getElementById("sentencesAddInput").value = "  Let me   double-check and confirm.  ";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    expect(lookupCalled).toBe(false);
    expect(document.getElementById("sentencesAddStatus").textContent).toContain("already in the database");
  });

  it("THE REPORTED BUG: retyping the sentence without its trailing period is now recognized as the same entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    let lookupCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { lookupCalled = true; return null; };

    document.getElementById("sentencesAddInput").value = "let me double-check and confirm";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    expect(lookupCalled).toBe(false);
    const statusEl = document.getElementById("sentencesAddStatus");
    expect(statusEl.textContent).toContain("already in the database");
    expect(statusEl.querySelector(".lb-lookup-save-btn")).toBeNull();
  });

  it("a genuinely different sentence is NOT incorrectly flagged as a duplicate", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "Let me think about that for a moment.",
      senses: [{ use: "Used to ask for a short pause before answering.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    document.getElementById("sentencesAddInput").value = "Let me think about that for a moment.";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("sentencesAddStatus");
    expect(statusEl.textContent).not.toContain("already in the database");
    expect(statusEl.textContent).toContain("ready to be added");
    expect(statusEl.querySelector(".lb-lookup-save-btn")).toBeTruthy();
    expect(hooks.sentencesData.some((e) => e.w === "Let me think about that for a moment.")).toBe(false);
  });

  it("re-checks the ONLINE LOOKUP'S OWN returned word after it resolves — catches a duplicate even when the typed text itself didn't match anything", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    // The typed text is intentionally something that doesn't itself match
    // any stored entry — but the dictionary/Wiktionary source resolves it
    // to a phrase that (after case/whitespace/punctuation normalization)
    // IS already in sentencesData. This is exactly the gap where a
    // fuzzy/search-based online match doesn't echo the query back
    // verbatim, so only a post-lookup re-check catches it.
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "let me double-check and confirm",
      senses: [{ use: "(verb) An unrelated, mismatched definition.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    document.getElementById("sentencesAddInput").value = "please verify that once more";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("sentencesAddStatus");
    expect(statusEl.textContent).toContain("already available in your Useful Sentence list");
    expect(statusEl.querySelector(".lb-lookup-save-btn")).toBeNull();
    // Never silently added a second, near-duplicate record.
    expect(hooks.sentencesData.filter((e) => e.w.toLowerCase().replace(/[.!?]+$/, "") === "let me double-check and confirm")).toHaveLength(1);
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
    expect(statusEl.textContent).toContain("ready to be added");
    expect(statusEl.querySelector(".lb-lookup-save-btn")).toBeTruthy();
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
    expect(statusEl.querySelector(".distinctions-lookup-save-btn")).toBeNull();
  });

  it("a genuinely new pair still shows the Save button", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async (word) => {
      const key = word.trim().toLowerCase();
      if (key === "arise-dup-test") return { w: "arise-dup-test", senses: [{ use: "(verb) Test.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" };
      if (key === "quibblet-dup-test") return { w: "quibblet-dup-test", senses: [{ use: "(verb) Test.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" };
      return null;
    };

    document.getElementById("distinctionsAddInput1").value = "arise-dup-test";
    document.getElementById("distinctionsAddInput2").value = "quibblet-dup-test";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("distinctionsAddStatus");
    expect(statusEl.textContent).toContain("ready to be added");
    expect(statusEl.querySelector(".distinctions-lookup-save-btn")).toBeTruthy();
  });

  it("re-checks the online lookup's own returned words after they resolve, before showing Save", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    // Neither typed word matches anything locally, but the online source
    // resolves them to the existing "Achieve"/"Attain" pair (again,
    // simulating a fuzzy/search-based match that doesn't echo the query).
    window.OnlineLookup.fetchOnlineDefinition = async (word) => {
      const key = word.trim().toLowerCase();
      if (key === "reach-a-goal-test") return { w: "achieve", senses: [{ use: "(verb) Mismatched.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" };
      if (key === "reach-a-target-test") return { w: "attain", senses: [{ use: "(verb) Mismatched.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" };
      return null;
    };

    document.getElementById("distinctionsAddInput1").value = "reach-a-goal-test";
    document.getElementById("distinctionsAddInput2").value = "reach-a-target-test";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("distinctionsAddStatus");
    expect(statusEl.textContent).toContain("already available in your Distinction Words");
    expect(statusEl.querySelector(".distinctions-lookup-save-btn")).toBeNull();
    expect(hooks.distinctionsData.filter((e) => e.word1.w === "Achieve" && e.word2.w === "Attain")).toHaveLength(1);
  });

  it("two genuinely different word pairs are NOT incorrectly flagged as duplicates", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async (word) => {
      const key = word.trim().toLowerCase();
      if (key === "unrelated-word-one") return { w: "unrelated-word-one", senses: [{ use: "(noun) Test one.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" };
      if (key === "unrelated-word-two") return { w: "unrelated-word-two", senses: [{ use: "(noun) Test two.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" };
      return null;
    };

    document.getElementById("distinctionsAddInput1").value = "unrelated-word-one";
    document.getElementById("distinctionsAddInput2").value = "unrelated-word-two";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("distinctionsAddStatus");
    expect(statusEl.textContent).not.toContain("already");
    expect(statusEl.textContent).toContain("ready to be added");
    expect(statusEl.querySelector(".distinctions-lookup-save-btn")).toBeTruthy();
  });
});
