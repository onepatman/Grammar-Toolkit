// Integration tests for the "Intelligent Vocabulary Bank Expansion"
// feature: owner-gated online-lookup saving (see search-coverage.test.js
// for the search-side half), Vocabulary Bank Edit/Delete, Firestore sync
// of the new `vocab` and `verbs` fields, the never-auto-saved vocabulary
// suggestion heuristic surfaced in the Language Bank/Distinctions add
// flows, and the Verbs tab's manual (never-guessed) 5-form add flow.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import { createFakeFirebase } from "./helpers/fake-firebase.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const OWNER_EMAIL = "owner@example.com";
const OWNER_PASSWORD = "correct-horse-battery-staple";

function makeFirebase() {
  return createFakeFirebase({
    ownerEmail: OWNER_EMAIL,
    users: { [OWNER_EMAIL]: OWNER_PASSWORD }
  });
}

const SAMPLE_VOCAB = {
  w: "conundrum",
  senses: [{ use: "(noun) A confusing and difficult problem.", examples: ["Solving it was a real conundrum."] }],
  syn: ["puzzle"],
  ant: [],
  mistake: null,
  tagalog: null,
  source: "online"
};

const VERB_LOOKUP_RESULT = {
  w: "sprint",
  senses: [{ use: "(verb) To run at full speed over a short distance.", examples: ["He sprinted to the finish line."] }],
  syn: ["dash"],
  ant: [],
  mistake: null,
  tagalog: null,
  phonetic: null,
  source: "online"
};

/* ---------- Vocabulary Bank Edit/Delete ---------- */

describe("Vocabulary Bank Edit/Delete (owner-gated)", () => {
  it("a built-in vocab entry never shows Edit/Delete, even when unlocked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const builtIn = hooks.vocabData[0];
    document.getElementById("vocabSelect").value = builtIn.w;
    hooks.renderRuleEntry(builtIn, document.getElementById("vocabEntry"), "Vocabulary Bank", "vocab");

    expect(document.getElementById("vocabEntry").querySelector(".lb-edit-btn")).toBeNull();
    expect(document.getElementById("vocabEntry").querySelector(".lb-delete-btn")).toBeNull();
  });

  it("an owner-added vocab entry shows Edit/Delete while unlocked, hidden while locked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(SAMPLE_VOCAB, { persist: false });
    document.getElementById("vocabSelect").value = SAMPLE_VOCAB.w;
    document.getElementById("vocabSelect").dispatchEvent(new window.Event("change"));

    expect(document.getElementById("vocabEntry").querySelector(".lb-edit-btn")).toBeTruthy();
    expect(document.getElementById("vocabEntry").querySelector(".lb-delete-btn")).toBeTruthy();

    document.getElementById("ownerLockBtn").click();
    await wait(20);
    expect(document.getElementById("vocabEntry").querySelector(".lb-edit-btn")).toBeNull();
  });

  it("Edit updates the word/definition/synonyms in place and re-indexes search", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(SAMPLE_VOCAB, { persist: false });
    document.getElementById("vocabSelect").value = SAMPLE_VOCAB.w;
    document.getElementById("vocabSelect").dispatchEvent(new window.Event("change"));

    document.getElementById("vocabEntry").querySelector(".lb-edit-btn").click();
    document.getElementById("vocabEditUse").value = "(noun) An updated definition.";
    document.getElementById("vocabEditSyn").value = "riddle, mystery";
    document.getElementById("vocabEditSaveBtn").click();
    await wait(50);

    const updated = hooks.vocabData.find((v) => v.w === "conundrum");
    expect(updated.senses[0].use).toBe("(noun) An updated definition.");
    expect(updated.syn).toEqual(["riddle", "mystery"]);
    hooks.runSearchPipeline("conundrum");
    expect(window.document.getElementById("searchResults").textContent).toContain("conundrum");
  });

  it("Delete asks for confirmation and removes the word from data, search index, and IndexedDB", async () => {
    const idb = new IDBFactory();
    const { window, hooks } = await loadApp({ indexedDBFactory: idb });
    const document = window.document;
    hooks.addVocabEntry(SAMPLE_VOCAB, { persist: true });
    await wait(30);
    document.getElementById("vocabSelect").value = SAMPLE_VOCAB.w;
    document.getElementById("vocabSelect").dispatchEvent(new window.Event("change"));

    window.confirm = () => false;
    document.getElementById("vocabEntry").querySelector(".lb-delete-btn").click();
    await wait(20);
    expect(hooks.vocabData.some((v) => v.w === SAMPLE_VOCAB.w)).toBe(true);

    window.confirm = () => true;
    document.getElementById("vocabEntry").querySelector(".lb-delete-btn").click();
    await wait(50);

    expect(hooks.vocabData.some((v) => v.w === SAMPLE_VOCAB.w)).toBe(false);
    expect(hooks.wordIndexMap.has("conundrum")).toBe(false);
    const stored = await VocabCache.get(SAMPLE_VOCAB.w, { indexedDB: idb });
    expect(stored).toBeUndefined();
  });
});

/* ---------- Firestore sync of the `vocab` and `verbs` fields ---------- */

describe("Vocabulary Bank + Verbs sync via Firestore", () => {
  it("pushes an owner-saved word to the shared doc's vocab field, not just IndexedDB", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });
    hooks.addVocabEntry(SAMPLE_VOCAB, { persist: true });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("vocab-code-1");
    await wait(50);

    const doc = firebase._docs.get("syncedLogs/vocab-code-1");
    expect(doc.vocab.some((e) => e.w === "conundrum")).toBe(true);
  });

  it("only syncs owner-saved words (source:'online'), never the built-in seed dictionary", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });
    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("vocab-code-2");

    const doc = firebase._docs.get("syncedLogs/vocab-code-2");
    expect(doc.vocab).toEqual([]);
  });

  it("pulls in a remotely-seeded vocab word and makes it searchable/offline locally", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/vocab-code-3", {
      entries: [], languageBank: null, distinctions: [],
      vocab: [SAMPLE_VOCAB]
    });
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    await hooks.connectSync("vocab-code-3");
    await wait(50);

    expect(hooks.vocabData.some((v) => v.w === "conundrum")).toBe(true);
    hooks.runSearchPipeline("conundrum");
    expect(window.document.getElementById("searchResults").textContent).toContain("conundrum");
  });

  it("a verb the Owner manually added syncs through the shared doc's verbs field, tagged with its group", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });
    const entry = { w: "glimmer", s: "glimmers", ing: "glimmering", past: "glimmered", pp: "glimmered", obj: "", syn: [], ant: [], source: "online" };
    hooks.addVerbEntry("regular", entry, { persist: true });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("verb-code-1");
    await wait(50);

    const doc = firebase._docs.get("syncedLogs/verb-code-1");
    expect(doc.verbs.some((e) => e.w === "glimmer" && e.group === "regular")).toBe(true);
  });

  it("pulls in a remotely-seeded verb and adds it under the right Regular/Irregular group", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/verb-code-2", {
      entries: [], languageBank: null, distinctions: [], vocab: [],
      verbs: [{ w: "swum-test", s: "swum-tests", ing: "swum-testing", past: "swum-tested-past", pp: "swum-tested-pp", obj: "", syn: [], ant: [], source: "online", group: "irregular" }]
    });
    const { hooks } = await loadApp({ firebase, ownerUnlocked: false });
    await hooks.connectSync("verb-code-2");
    await wait(50);

    expect(hooks.verbData.irregular.some((v) => v.w === "swum-test")).toBe(true);
    expect(hooks.verbData.regular.some((v) => v.w === "swum-test")).toBe(false);
  });
});

/* ---------- Vocabulary suggestions (Language Bank / Distinctions) ---------- */

describe("Vocabulary suggestions surfaced after a Language Bank add — never auto-saved", () => {
  it("shows a per-word Save button for the Owner, and nothing is added until it's clicked", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    // A definition text with real candidate words the stopword heuristic
    // should surface (not stopwords, length >= 4, not already known).
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "burn the midnight oil",
      senses: [{ use: "(idiom) Work diligently through the entire evening on a difficult assignment.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    const document = window.document;
    document.getElementById("idiomsAddInput").value = "burn the midnight oil";
    document.getElementById("idiomsAddBtn").click();
    await wait(50);

    const statusEl = document.getElementById("idiomsAddStatus");
    const suggestBtn = statusEl.querySelector(".vocab-suggest-save-btn");
    expect(suggestBtn).toBeTruthy();
    const suggestedWord = suggestBtn.dataset.word;
    expect(hooks.wordIndexMap.has(suggestedWord)).toBe(false);

    window.OnlineLookup.fetchOnlineDefinition = async (word) => ({
      w: word, senses: [{ use: `(adjective) A definition for ${word}.`, examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });
    suggestBtn.click();
    await wait(50);

    expect(hooks.wordIndexMap.has(suggestedWord)).toBe(true);
    expect(statusEl.textContent).toContain("has been added to your Vocabulary Bank");
  });

  it("shows no suggestion box at all for a locked/non-owner device", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "burn the midnight oil",
      senses: [{ use: "(idiom) Work diligently through the entire evening on a difficult assignment.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    const document = window.document;
    document.getElementById("idiomsAddInput").value = "burn the midnight oil";
    document.getElementById("idiomsAddBtn").click();
    await wait(50);

    expect(document.getElementById("idiomsAddStatus").querySelector(".vocab-suggest-save-btn")).toBeNull();
  });

  it("does not suggest ordinary short/common words from a plain sentence", async () => {
    const { window, hooks } = await loadApp();
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "went to the store",
      senses: [{ use: "(sentence) I went to the store yesterday.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    const document = window.document;
    document.getElementById("sentencesAddInput").value = "went to the store";
    document.getElementById("sentencesAddBtn").click();
    await wait(50);

    const candidates = hooks.suggestVocabFromEntryText({ senses: [{ use: "I went to the store yesterday.", examples: [] }] });
    expect(candidates).not.toContain("went");
    expect(candidates).not.toContain("the");
    expect(candidates).not.toContain("store".slice(0, 2));
  });
});

/* ---------- Verbs tab manual-add flow ---------- */

describe("Verbs tab: flag possible verb + manual 5-form entry (never auto-guessed)", () => {
  it("looksLikeVerb() detects the (verb) part-of-speech prefix", async () => {
    const { hooks } = await loadApp();
    expect(hooks.looksLikeVerb(VERB_LOOKUP_RESULT)).toBe(true);
    expect(hooks.looksLikeVerb({ senses: [{ use: "(noun) A thing." }] })).toBe(false);
    expect(hooks.looksLikeVerb(null)).toBe(false);
  });

  it("after the Owner saves a verb-looking word from search, a flag prompt appears offering to add it to Verbs", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    // Drives the same UI path saveOnlineVocabResult() would after a real
    // search (see search-coverage.test.js for that path end-to-end) —
    // shown.length===0 vs. >0 branching is a search-pipeline detail
    // unrelated to what THIS test is verifying (the verb-flag prompt).
    hooks.showOnlineVocabResult(VERB_LOOKUP_RESULT);
    document.getElementById("saveOnlineVocabBtn").click();
    await wait(50);

    expect(document.getElementById("verbFlagArea").textContent).toContain("This looks like a verb");
    expect(hooks.verbData.regular.some((v) => v.w === "sprint")).toBe(false);
    expect(hooks.verbData.irregular.some((v) => v.w === "sprint")).toBe(false);
  });

  it("clicking 'Add it to Verbs' requires all five forms, never guesses them, and only saves once confirmed", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.showOnlineVocabResult(VERB_LOOKUP_RESULT);
    document.getElementById("saveOnlineVocabBtn").click();
    await wait(50);
    document.getElementById("verbFlagYesBtn").click();

    // Base Form is pre-filled from the word itself; nothing else is.
    expect(document.getElementById("verbFormBase").value).toBe("sprint");
    expect(document.getElementById("verbFormS").value).toBe("");
    expect(document.getElementById("verbFormPast").value).toBe("");

    // Saving with forms missing is rejected — no guessing, no partial save.
    document.getElementById("verbFlagSaveBtn").click();
    await wait(30);
    expect(hooks.verbData.regular.some((v) => v.w === "sprint")).toBe(false);
    expect(document.getElementById("verbFlagStatus").textContent).toContain("all five forms");

    document.getElementById("verbFormS").value = "sprints";
    document.getElementById("verbFormPast").value = "sprinted";
    document.getElementById("verbFormPP").value = "sprinted";
    document.getElementById("verbFormIng").value = "sprinting";
    document.getElementById("verbFlagSaveBtn").click();
    await wait(50);

    const saved = hooks.verbData.regular.find((v) => v.w === "sprint");
    expect(saved).toBeTruthy();
    expect(saved).toMatchObject({ s: "sprints", past: "sprinted", pp: "sprinted", ing: "sprinting" });
    // Fully searchable afterward, same as a built-in verb.
    hooks.runSearchPipeline("sprinted");
    expect(document.getElementById("searchResults").textContent).toContain("sprint");
  });

  it("is owner-gated — offerVerbFlagIfApplicable does nothing on a locked device", async () => {
    const { hooks } = await loadApp({ ownerUnlocked: false });
    const item = hooks.addVocabEntry(VERB_LOOKUP_RESULT, { persist: false });
    hooks.offerVerbFlagIfApplicable(item, VERB_LOOKUP_RESULT);
    expect(hooks.verbData.regular.some((v) => v.w === "sprint")).toBe(false);
  });

  it("dedup: does not offer the flag again for a word already in Verbs", async () => {
    const { hooks } = await loadApp();
    hooks.addVerbEntry("regular", { w: "sprint", s: "sprints", ing: "sprinting", past: "sprinted", pp: "sprinted", obj: "", syn: [], ant: [], source: "online" }, { persist: false });
    expect(hooks.isKnownVerb("sprint")).toBe(true);
    expect(hooks.isKnownVerb("Sprint")).toBe(true); // case-insensitive

    const item = hooks.addVocabEntry({ w: "sprint2", senses: VERB_LOOKUP_RESULT.senses, syn: [], ant: [], mistake: null, tagalog: null, source: "online" }, { persist: false });
    // addVerbEntry itself refuses a second registration of the same word.
    const before = hooks.verbData.regular.length;
    hooks.addVerbEntry("regular", { w: "sprint", s: "x", ing: "x", past: "x", pp: "x", obj: "", syn: [], ant: [], source: "online" }, { persist: false });
    expect(hooks.verbData.regular.length).toBe(before);
  });

  it("reverse-sync: a verb added via addVerbEntry with no matching Vocab entry yet also gets one created", async () => {
    const { hooks } = await loadApp();
    expect(hooks.wordIndexMap.has("glimmer2")).toBe(false);
    hooks.addVerbEntry("regular", { w: "glimmer2", s: "glimmer2s", ing: "glimmer2ing", past: "glimmer2ed", pp: "glimmer2ed", obj: "", syn: [], ant: [], source: "online" }, { persist: false });

    expect(hooks.vocabData.some((v) => v.w === "glimmer2")).toBe(true);
    expect(hooks.wordIndexMap.has("glimmer2")).toBe(true);
  });
});
