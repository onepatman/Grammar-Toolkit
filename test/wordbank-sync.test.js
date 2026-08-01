// Integration tests for Word Bank cross-device sync — regression coverage
// for the reported bug: "Word Bank entries don't sync across my devices —
// one device has many Basic↔Advanced/Tagalog↔English pairs, the other has
// none, even though Favorites sync fine." Root cause was that Word Bank
// (added after Distinctions/Vocab/Verbs/Favorites sync already existed)
// was never wired into pushToSync/listenToSync at all: no `basicAdvanced`/
// `tagalogEnglish` field on the shared doc, and none of the add/edit/delete
// handlers ever called pushToSync(). Entries persisted fine locally
// (IndexedDB), which is why they never appeared to be "lost" on the device
// that added them — they just never left that device.
//
// Every Word Bank entry is Owner-typed (no built-in seed content at all),
// so — unlike Vocab/Verbs, which only sync source:"online" additions
// against a shared built-in dictionary — Word Bank sync is a full
// reconciliation, the same shape as Favorites sync.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";
import { createFakeFirebase } from "./helpers/fake-firebase.js";

function wait(ms = 50) {
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

function addBasicAdvancedPair(document, basic, advanced) {
  document.getElementById("basicAdvancedAddBasicInput").value = basic;
  document.getElementById("basicAdvancedAddAdvancedInput").value = advanced;
  document.getElementById("basicAdvancedAddBtn").click();
}

function addTagalogEnglishPair(document, tagalog, english) {
  document.getElementById("tagalogEnglishAddTagalogInput").value = tagalog;
  document.getElementById("tagalogEnglishAddEnglishInput").value = english;
  document.getElementById("tagalogEnglishAddBtn").click();
}

describe("Basic → Advanced pairs reach the shared Firestore doc", () => {
  it("seeds empty basicAdvanced/tagalogEnglish arrays alongside everything else on first connect", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("wb-code-1");
    await wait();

    const doc = firebase._docs.get("syncedLogs/wb-code-1");
    expect(doc).toBeTruthy();
    expect(doc.basicAdvanced).toEqual([]);
    expect(doc.tagalogEnglish).toEqual([]);
  });

  it("adding a pair while connected as owner pushes it to the shared doc's basicAdvanced field", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("wb-code-2");
    await wait();

    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    addBasicAdvancedPair(document, "happy", "elated");
    await wait();

    const doc = firebase._docs.get("syncedLogs/wb-code-2");
    expect(doc.basicAdvanced.some((e) => e.basic === "happy" && e.advanced === "elated")).toBe(true);
  });

  it("a pair added locally BEFORE connecting still reaches the shared doc once connected", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    addBasicAdvancedPair(document, "happy", "elated");
    await wait();

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("wb-code-3");
    await wait();

    const doc = firebase._docs.get("syncedLogs/wb-code-3");
    expect(doc.basicAdvanced.some((e) => e.basic === "happy")).toBe(true);
  });

  it("deleting a pair while connected as owner pushes the removal to the shared doc", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("wb-code-4");
    await wait();

    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    addBasicAdvancedPair(document, "happy", "elated");
    await wait();
    expect(firebase._docs.get("syncedLogs/wb-code-4").basicAdvanced.some((e) => e.basic === "happy")).toBe(true);

    window.confirm = () => true;
    document.querySelector("#basicAdvancedEntry .lb-delete-btn").click();
    await wait();

    const doc = firebase._docs.get("syncedLogs/wb-code-4");
    expect(doc.basicAdvanced.some((e) => e.basic === "happy")).toBe(false);
  });
});

describe("Tagalog → English pairs reach the shared Firestore doc", () => {
  it("adding a pair while connected as owner pushes it to the shared doc's tagalogEnglish field", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("wb-code-5");
    await wait();

    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    document.querySelector('#wordBankCategorySeg button[data-val="tagalogEnglish"]').click();
    addTagalogEnglishPair(document, "tiyaga", "perseverance");
    await wait();

    const doc = firebase._docs.get("syncedLogs/wb-code-5");
    expect(doc.tagalogEnglish.some((e) => e.tagalog === "tiyaga" && e.english === "perseverance")).toBe(true);
  });
});

describe("a device that connects to an already-seeded code pulls in the shared Word Bank content", () => {
  it("adds a remotely-added Basic → Advanced pair locally, searchable and browsable, even on a locked device", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/wb-code-6", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [],
      basicAdvanced: [{ basic: "happy", basicDef: null, basicExamples: [], advanced: "elated", advancedDef: null, advancedExamples: [] }],
      tagalogEnglish: [],
      favorites: []
    });

    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;
    await hooks.connectSync("wb-code-6");
    await wait();

    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy" && e.advanced === "elated")).toBe(true);
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    const options = Array.from(document.getElementById("basicAdvancedSelect").options).map((o) => o.value);
    expect(options).toContain("happy");
  });

  it("removes a local pair that's no longer in the remote list — the core cross-device requirement", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: true });
    const document = window.document;

    // Added locally BEFORE this device has ever connected — simulates a
    // pair that was added here but never made it into what's now the
    // shared, authoritative list from other devices.
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    addBasicAdvancedPair(document, "happy", "elated");
    await wait();
    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(true);

    firebase._docs.set("syncedLogs/wb-code-7", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [],
      // "happy" is deliberately absent — the shared list says this pair
      // doesn't exist anywhere anymore.
      basicAdvanced: [{ basic: "brave", basicDef: null, basicExamples: [], advanced: "courageous", advancedDef: null, advancedExamples: [] }],
      tagalogEnglish: [],
      favorites: []
    });
    await hooks.connectSync("wb-code-7");
    await wait();

    expect(hooks.basicAdvancedData.some((e) => e.basic === "happy")).toBe(false);
    expect(hooks.basicAdvancedData.some((e) => e.basic === "brave")).toBe(true);
  });

  it("pulling in a remotely-added pair already known locally doesn't create a duplicate", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: true });
    const document = window.document;

    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    addBasicAdvancedPair(document, "happy", "elated");
    await wait();

    firebase._docs.set("syncedLogs/wb-code-8", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [],
      basicAdvanced: [{ basic: "happy", basicDef: null, basicExamples: [], advanced: "elated", advancedDef: null, advancedExamples: [] }],
      tagalogEnglish: [],
      favorites: []
    });
    await hooks.connectSync("wb-code-8");
    await wait();

    expect(hooks.basicAdvancedData.filter((e) => e.basic === "happy")).toHaveLength(1);
    const options = Array.from(document.getElementById("basicAdvancedSelect").options).filter((o) => o.value === "happy");
    expect(options).toHaveLength(1);
  });
});
