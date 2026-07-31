// Integration tests for Favorites cross-device sync — the counterpart to
// test/language-bank-sync.test.js, which covers the same syncedLogs/{code}
// Firestore doc's other fields.
//
// Regression coverage for the reported bug: "Favorites don't sync across
// my devices — each device has a different starred list." Root cause was
// that the favorites IndexedDB store never touched Firestore at all: no
// `favorites` field existed on the shared doc, and the fav-toggle handler
// never called pushToSync(). Unlike Language Bank/Distinctions/Vocab/Verbs
// sync (which only ever pushes locally-ADDED "online" entries and leaves
// built-in data alone), every row in the favorites store is itself a user
// action, so favorites sync is a full reconciliation: whatever's favorited
// on one device becomes favorited on every device, and un-favoriting
// anywhere removes it everywhere once that snapshot lands.
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

function openVocabEntry(hooks, document, word) {
  hooks.runSearchPipeline(word);
  const match = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
    .find((el) => el.textContent.includes("Vocabulary Bank"));
  match.click();
}

describe("the owner's favorite toggle reaches the shared Firestore doc", () => {
  it("seeds an empty favorites array alongside entries/languageBank/etc. on first connect", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("fav-code-1");
    await wait();

    const doc = firebase._docs.get("syncedLogs/fav-code-1");
    expect(doc).toBeTruthy();
    expect(doc.favorites).toEqual([]);
  });

  it("favoriting an entry while connected as owner pushes it to the shared doc's favorites field", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("fav-code-2");
    await wait();

    openVocabEntry(hooks, document, "abandon");
    document.querySelector("#vocabEntry .fav-toggle").click();
    await wait();

    const doc = firebase._docs.get("syncedLogs/fav-code-2");
    expect(doc.favorites.some((f) => f.word === "abandon")).toBe(true);
  });

  it("un-favoriting an entry while connected as owner pushes the removal to the shared doc", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("fav-code-3");
    await wait();

    openVocabEntry(hooks, document, "abandon");
    const toggle = document.querySelector("#vocabEntry .fav-toggle");
    toggle.click(); // favorite it
    await wait();
    expect(firebase._docs.get("syncedLogs/fav-code-3").favorites.some((f) => f.word === "abandon")).toBe(true);

    toggle.click(); // un-favorite it
    await wait();

    const doc = firebase._docs.get("syncedLogs/fav-code-3");
    expect(doc.favorites.some((f) => f.word === "abandon")).toBe(false);
  });

  it("a favorite added locally BEFORE connecting still reaches the shared doc once connected", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    openVocabEntry(hooks, document, "abandon");
    document.querySelector("#vocabEntry .fav-toggle").click();
    await wait();

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("fav-code-4");
    await wait();

    const doc = firebase._docs.get("syncedLogs/fav-code-4");
    expect(doc.favorites.some((f) => f.word === "abandon")).toBe(true);
  });
});

describe("a non-owner's favorite toggle is not pushed to the shared log, but stays usable locally", () => {
  it("keeps the favorite in this device's own IndexedDB even though the shared write is skipped", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/fav-code-5", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [],
      favorites: []
    });
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    await hooks.connectSync("fav-code-5"); // anonymous — never signed in as owner
    await wait();

    openVocabEntry(hooks, document, "abandon");
    document.querySelector("#vocabEntry .fav-toggle").click();
    await wait();

    expect(hooks.favoriteKeys.has("abandon")).toBe(true);
    expect(firebase._docs.get("syncedLogs/fav-code-5").favorites).toEqual([]);
  });
});

describe("a device that connects to an already-seeded code reconciles favorites — one shared list, not a merge", () => {
  it("adds a remotely-favorited word locally (star becomes active, appears in the Favorites tab)", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/fav-code-6", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [],
      favorites: [{ word: "abandon", cat: "Vocabulary Bank", addedAt: Date.now() }]
    });

    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;
    await hooks.connectSync("fav-code-6");
    await wait();

    expect(hooks.favoriteKeys.has("abandon")).toBe(true);
    openVocabEntry(hooks, document, "abandon");
    expect(document.querySelector("#vocabEntry .fav-toggle").classList.contains("active")).toBe(true);
  });

  it("removes a local favorite that's no longer in the remote list — this is the core cross-device requirement", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;

    // Favorite "abandon" locally BEFORE this device has ever connected —
    // simulates a word that was favorited here but never made it into
    // what's now the shared, authoritative list from other devices.
    openVocabEntry(hooks, document, "abandon");
    document.querySelector("#vocabEntry .fav-toggle").click();
    await wait();
    expect(hooks.favoriteKeys.has("abandon")).toBe(true);

    firebase._docs.set("syncedLogs/fav-code-7", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [],
      // "abandon" is deliberately absent — the shared list says it's NOT
      // favorited anywhere anymore.
      favorites: [{ word: "above", cat: "Vocabulary Bank", addedAt: Date.now() }]
    });
    await hooks.connectSync("fav-code-7");
    await wait();

    expect(hooks.favoriteKeys.has("abandon")).toBe(false);
    expect(hooks.favoriteKeys.has("above")).toBe(true);
    // The underlying vocab entry itself is untouched — only the favorite
    // flag was removed.
    expect(hooks.vocabData.some((v) => v.w === "abandon")).toBe(true);
    openVocabEntry(hooks, document, "abandon");
    expect(document.querySelector("#vocabEntry .fav-toggle").classList.contains("active")).toBe(false);
  });

  it("pulling in a remotely-favorited word already favorited locally doesn't create a duplicate row", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;

    openVocabEntry(hooks, document, "abandon");
    document.querySelector("#vocabEntry .fav-toggle").click();
    await wait();

    firebase._docs.set("syncedLogs/fav-code-8", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [],
      favorites: [{ word: "abandon", cat: "Vocabulary Bank", addedAt: Date.now() }]
    });
    await hooks.connectSync("fav-code-8");
    await wait();

    document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await wait();
    const labels = Array.from(document.querySelectorAll("#favoritesList .label")).map((el) => el.textContent);
    expect(labels.filter((l) => l === "abandon")).toHaveLength(1);
  });
});
