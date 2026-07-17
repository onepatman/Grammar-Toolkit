// Unit tests for js/vocab-cache.js against a real (fake) IndexedDB
// implementation — not just mocked promises — so the actual
// open/transaction/store lifecycle is exercised.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import VocabCache from "../js/vocab-cache.js";

// A fresh IDBFactory per test avoids any cross-test database pollution
// (fake-indexeddb persists "databases" for the lifetime of the factory
// instance, same as a real browser profile would).
function freshIndexedDB() {
  return new IDBFactory();
}

const SAMPLE_ENTRY = {
  w: "press",
  senses: [{ use: "(verb) To apply steady force against something.", examples: ["She pressed the button."] }],
  syn: ["push"],
  ant: [],
  mistake: null,
  tagalog: null,
  source: "online"
};

describe("openDb", () => {
  it("resolves to a usable database handle", async () => {
    const db = await VocabCache.openDb(freshIndexedDB());
    expect(db).not.toBeNull();
    expect(db.objectStoreNames.contains(VocabCache.STORE_NAME)).toBe(true);
  });

  it("resolves to null (not a throw) when no indexedDB implementation is available", async () => {
    const db = await VocabCache.openDb(null);
    expect(db).toBeNull();
  });
});

describe("put / get", () => {
  it("round-trips an entry by its word, case-insensitively", async () => {
    const idb = freshIndexedDB();
    const ok = await VocabCache.put(SAMPLE_ENTRY, { indexedDB: idb });
    expect(ok).toBe(true);

    const found = await VocabCache.get("Press", { indexedDB: idb });
    expect(found).toEqual(SAMPLE_ENTRY);
  });

  it("resolves to undefined for a word that was never cached", async () => {
    const idb = freshIndexedDB();
    const found = await VocabCache.get("nonexistent", { indexedDB: idb });
    expect(found).toBeUndefined();
  });

  it("put overwrites any existing entry for the same word (last write wins)", async () => {
    const idb = freshIndexedDB();
    await VocabCache.put(SAMPLE_ENTRY, { indexedDB: idb });
    const richer = { ...SAMPLE_ENTRY, syn: ["push", "squeeze", "compress"] };
    await VocabCache.put(richer, { indexedDB: idb });

    const found = await VocabCache.get("press", { indexedDB: idb });
    expect(found.syn).toEqual(["push", "squeeze", "compress"]);
  });

  it("resolves to false (not a throw) when putting an entry with no word", async () => {
    const idb = freshIndexedDB();
    const ok = await VocabCache.put({ senses: [] }, { indexedDB: idb });
    expect(ok).toBe(false);
  });

  it("reuses a shared dbPromise instead of reopening the connection each call", async () => {
    const idb = freshIndexedDB();
    const dbPromise = VocabCache.openDb(idb);
    await VocabCache.put(SAMPLE_ENTRY, { dbPromise });
    const found = await VocabCache.get("press", { dbPromise });
    expect(found.w).toBe("press");
  });
});

describe("getAll", () => {
  it("returns every cached entry", async () => {
    const idb = freshIndexedDB();
    await VocabCache.put(SAMPLE_ENTRY, { indexedDB: idb });
    await VocabCache.put({ ...SAMPLE_ENTRY, w: "compress" }, { indexedDB: idb });

    const all = await VocabCache.getAll({ indexedDB: idb });
    expect(all.map((e) => e.w).sort()).toEqual(["compress", "press"]);
  });

  it("returns an empty array when nothing is cached yet", async () => {
    const idb = freshIndexedDB();
    const all = await VocabCache.getAll({ indexedDB: idb });
    expect(all).toEqual([]);
  });
});

describe("richnessScore / isRicherEntry", () => {
  it("scores by total senses + synonyms + antonyms", () => {
    const rich = { senses: [{}, {}], syn: ["a", "b"], ant: ["c"] };
    expect(VocabCache.richnessScore(rich)).toBe(5);
  });

  it("treats missing arrays as empty (score 0), not a throw", () => {
    expect(VocabCache.richnessScore({})).toBe(0);
    expect(VocabCache.richnessScore(null)).toBe(0);
  });

  it("says a candidate is richer only when its score is strictly greater", () => {
    const thin = { senses: [{}], syn: [], ant: [] };
    const rich = { senses: [{}], syn: ["a"], ant: [] };
    expect(VocabCache.isRicherEntry(rich, thin)).toBe(true);
    expect(VocabCache.isRicherEntry(thin, rich)).toBe(false);
    expect(VocabCache.isRicherEntry(thin, thin)).toBe(false); // equal is not "richer"
  });
});

describe("validateEntry / filterValidEntries", () => {
  it("accepts a well-formed entry", () => {
    expect(VocabCache.validateEntry(SAMPLE_ENTRY)).toBe(true);
  });

  it("rejects an entry with no word, no senses, or malformed senses", () => {
    expect(VocabCache.validateEntry({ senses: [] })).toBe(false);
    expect(VocabCache.validateEntry({ w: "   ", senses: [{ use: "x", examples: [] }] })).toBe(false);
    expect(VocabCache.validateEntry({ w: "x", senses: [] })).toBe(false);
    expect(VocabCache.validateEntry({ w: "x", senses: [{ use: "", examples: [] }] })).toBe(false);
    expect(VocabCache.validateEntry({ w: "x", senses: [{ use: "ok" }] })).toBe(false); // examples not an array
    expect(VocabCache.validateEntry(null)).toBe(false);
  });

  it("filters a batch down to only the valid entries", () => {
    const batch = [
      SAMPLE_ENTRY,
      { w: "", senses: [] },
      { w: "compress", senses: [{ use: "(verb) squeeze", examples: [] }] },
      "not even an object"
    ];
    const valid = VocabCache.filterValidEntries(batch);
    expect(valid.map((e) => e.w)).toEqual(["press", "compress"]);
  });

  it("returns an empty array for non-array input", () => {
    expect(VocabCache.filterValidEntries(null)).toEqual([]);
    expect(VocabCache.filterValidEntries("nope")).toEqual([]);
  });
});

describe("favorites", () => {
  it("adds, checks, and removes a favorite", async () => {
    const idb = freshIndexedDB();
    expect(await VocabCache.isFavorite("press", { indexedDB: idb })).toBe(false);

    await VocabCache.addFavorite("press", { cat: "Vocabulary Bank" }, { indexedDB: idb });
    expect(await VocabCache.isFavorite("Press", { indexedDB: idb })).toBe(true);

    await VocabCache.removeFavorite("press", { indexedDB: idb });
    expect(await VocabCache.isFavorite("press", { indexedDB: idb })).toBe(false);
  });

  it("lists favorites newest-first", async () => {
    const idb = freshIndexedDB();
    await VocabCache.addFavorite("first", { cat: "Vocabulary Bank" }, { indexedDB: idb });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await VocabCache.addFavorite("second", { cat: "Vocabulary Bank" }, { indexedDB: idb });

    const favs = await VocabCache.getAllFavorites({ indexedDB: idb });
    expect(favs.map((f) => f.word)).toEqual(["second", "first"]);
  });

  it("adding an already-favorited word again does not duplicate it", async () => {
    const idb = freshIndexedDB();
    await VocabCache.addFavorite("press", {}, { indexedDB: idb });
    await VocabCache.addFavorite("press", {}, { indexedDB: idb });
    const favs = await VocabCache.getAllFavorites({ indexedDB: idb });
    expect(favs).toHaveLength(1);
  });
});

describe("recently viewed", () => {
  it("records and lists views, newest first", async () => {
    const idb = freshIndexedDB();
    await VocabCache.recordRecentlyViewed("abandon", "Vocabulary Bank", { indexedDB: idb });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await VocabCache.recordRecentlyViewed("above", "Vocabulary Bank", { indexedDB: idb });

    const recent = await VocabCache.getRecentlyViewed(10, { indexedDB: idb });
    expect(recent.map((r) => r.word)).toEqual(["above", "abandon"]);
  });

  it("viewing the same word again moves it to the front instead of duplicating it", async () => {
    const idb = freshIndexedDB();
    await VocabCache.recordRecentlyViewed("abandon", "Vocabulary Bank", { indexedDB: idb });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await VocabCache.recordRecentlyViewed("above", "Vocabulary Bank", { indexedDB: idb });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await VocabCache.recordRecentlyViewed("abandon", "Vocabulary Bank", { indexedDB: idb });

    const recent = await VocabCache.getRecentlyViewed(10, { indexedDB: idb });
    expect(recent.map((r) => r.word)).toEqual(["abandon", "above"]);
  });

  it("respects the limit parameter", async () => {
    const idb = freshIndexedDB();
    for (const w of ["a", "b", "c", "d"]) {
      await VocabCache.recordRecentlyViewed(w, "Vocabulary Bank", { indexedDB: idb });
    }
    const recent = await VocabCache.getRecentlyViewed(2, { indexedDB: idb });
    expect(recent).toHaveLength(2);
  });

  it("trims older entries once RECENT_LIMIT is exceeded", async () => {
    const idb = freshIndexedDB();
    const dbPromise = VocabCache.openDb(idb);
    const total = VocabCache.RECENT_LIMIT + 5;
    for (let i = 0; i < total; i++) {
      await VocabCache.recordRecentlyViewed("word" + i, "Vocabulary Bank", { dbPromise });
    }
    const all = await VocabCache.getRecentlyViewed(total, { dbPromise });
    expect(all.length).toBeLessThanOrEqual(VocabCache.RECENT_LIMIT);
    // The most recently added word must have survived the trim.
    expect(all.some((r) => r.word === "word" + (total - 1))).toBe(true);
  });
});

describe("schema migration from DB_VERSION 1 (pre-favorites/recently-viewed)", () => {
  it("upgrading an existing v1 database preserves cached vocabEntries and adds the new stores", async () => {
    const idb = new IDBFactory();

    // Simulate a database created by the earlier version of this app
    // (only the vocabEntries store, at version 1).
    await new Promise((resolve, reject) => {
      const req = idb.open(VocabCache.DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(VocabCache.STORE_NAME, { keyPath: "key" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(VocabCache.STORE_NAME, "readwrite");
        tx.objectStore(VocabCache.STORE_NAME).put({ key: "press", entry: SAMPLE_ENTRY });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = reject;
      };
      req.onerror = reject;
    });

    // Now open with the current module (DB_VERSION 3) against the same factory.
    const db = await VocabCache.openDb(idb);
    expect(db.objectStoreNames.contains(VocabCache.STORE_NAME)).toBe(true);
    expect(db.objectStoreNames.contains(VocabCache.FAVORITES_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(VocabCache.RECENT_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(VocabCache.PHRASAL_STORE)).toBe(true);

    const preserved = await VocabCache.get("press", { indexedDB: idb });
    expect(preserved).toEqual(SAMPLE_ENTRY);
  });
});

describe("schema migration from DB_VERSION 2 (pre-phrasalEntries)", () => {
  it("upgrading an existing v2 database preserves favorites/recentlyViewed and adds phrasalEntries", async () => {
    const idb = new IDBFactory();

    // Simulate a database created by the previous version of this app
    // (vocabEntries + favorites + recentlyViewed, at version 2).
    await new Promise((resolve, reject) => {
      const req = idb.open(VocabCache.DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(VocabCache.STORE_NAME, { keyPath: "key" });
        db.createObjectStore(VocabCache.FAVORITES_STORE, { keyPath: "key" });
        db.createObjectStore(VocabCache.RECENT_STORE, { keyPath: "key" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(VocabCache.FAVORITES_STORE, "readwrite");
        tx.objectStore(VocabCache.FAVORITES_STORE).put({ key: "press", word: "press", cat: "", addedAt: 1 });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = reject;
      };
      req.onerror = reject;
    });

    // Now open with the current module (DB_VERSION 3) against the same factory.
    const db = await VocabCache.openDb(idb);
    expect(db.objectStoreNames.contains(VocabCache.PHRASAL_STORE)).toBe(true);

    const favs = await VocabCache.getAllFavorites({ indexedDB: idb });
    expect(favs.map((f) => f.word)).toEqual(["press"]);

    const phrasalAll = await VocabCache.getAllPhrasal({ indexedDB: idb });
    expect(phrasalAll).toEqual([]);
  });
});

describe("phrasal entries (getPhrasal / putPhrasal / getAllPhrasal)", () => {
  const SAMPLE_PHRASAL = {
    w: "give up",
    senses: [{ use: "(phrasal verb) To stop trying.", examples: ["He gave up after the third attempt."] }],
    syn: ["quit"],
    ant: ["persist"],
    mistake: null,
    tagalog: null,
    source: "online"
  };

  it("round-trips a phrasal entry by its phrase, case-insensitively", async () => {
    const idb = freshIndexedDB();
    const ok = await VocabCache.putPhrasal(SAMPLE_PHRASAL, { indexedDB: idb });
    expect(ok).toBe(true);

    const found = await VocabCache.getPhrasal("Give Up", { indexedDB: idb });
    expect(found).toEqual(SAMPLE_PHRASAL);
  });

  it("resolves to undefined for a phrase that was never cached", async () => {
    const idb = freshIndexedDB();
    const found = await VocabCache.getPhrasal("nonexistent", { indexedDB: idb });
    expect(found).toBeUndefined();
  });

  it("resolves to false when putting a phrasal entry with no word", async () => {
    const idb = freshIndexedDB();
    const ok = await VocabCache.putPhrasal({ senses: [] }, { indexedDB: idb });
    expect(ok).toBe(false);
  });

  it("getAllPhrasal returns every cached phrasal entry, independent of vocabEntries", async () => {
    const idb = freshIndexedDB();
    await VocabCache.put(SAMPLE_ENTRY, { indexedDB: idb });
    await VocabCache.putPhrasal(SAMPLE_PHRASAL, { indexedDB: idb });

    const phrasalAll = await VocabCache.getAllPhrasal({ indexedDB: idb });
    expect(phrasalAll.map((e) => e.w)).toEqual(["give up"]);

    const vocabAll = await VocabCache.getAll({ indexedDB: idb });
    expect(vocabAll.map((e) => e.w)).toEqual(["press"]);
  });
});

describe("schema migration from DB_VERSION 3 (pre-Language-Bank-categories)", () => {
  it("upgrading an existing v3 database preserves phrasalEntries and adds the 3 new category stores", async () => {
    const idb = new IDBFactory();

    // Simulate a database created by the previous version of this app
    // (through phrasalEntries only, at version 3).
    await new Promise((resolve, reject) => {
      const req = idb.open(VocabCache.DB_NAME, 3);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(VocabCache.STORE_NAME, { keyPath: "key" });
        db.createObjectStore(VocabCache.FAVORITES_STORE, { keyPath: "key" });
        db.createObjectStore(VocabCache.RECENT_STORE, { keyPath: "key" });
        db.createObjectStore(VocabCache.PHRASAL_STORE, { keyPath: "key" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(VocabCache.PHRASAL_STORE, "readwrite");
        tx.objectStore(VocabCache.PHRASAL_STORE).put({ key: "give up", entry: { w: "give up", senses: [] } });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = reject;
      };
      req.onerror = reject;
    });

    // Now open with the current module (DB_VERSION 4) against the same factory.
    const db = await VocabCache.openDb(idb);
    expect(db.objectStoreNames.contains(VocabCache.IDIOMS_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(VocabCache.SENTENCES_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(VocabCache.PATTERNS_STORE)).toBe(true);

    const preserved = await VocabCache.getPhrasal("give up", { indexedDB: idb });
    expect(preserved).toEqual({ w: "give up", senses: [] });

    expect(await VocabCache.getAllIdioms({ indexedDB: idb })).toEqual([]);
    expect(await VocabCache.getAllSentences({ indexedDB: idb })).toEqual([]);
    expect(await VocabCache.getAllPatterns({ indexedDB: idb })).toEqual([]);
  });
});

describe.each([
  ["idioms", "getIdiom", "putIdiom", "getAllIdioms", "break the ice"],
  ["sentences", "getSentence", "putSentence", "getAllSentences", "Could you pass the salt?"],
  ["patterns", "getPattern", "putPattern", "getAllPatterns", "Would you mind + V-ing?"]
])("%s entries (get/put/getAll)", (categoryName, getFn, putFn, getAllFn, sampleWord) => {
  const sampleEntry = {
    w: sampleWord,
    senses: [{ use: "A sample entry.", examples: [] }],
    syn: [],
    ant: [],
    mistake: null,
    tagalog: null,
    source: "online"
  };

  it("round-trips an entry by its text, case-insensitively", async () => {
    const idb = freshIndexedDB();
    const ok = await VocabCache[putFn](sampleEntry, { indexedDB: idb });
    expect(ok).toBe(true);

    const found = await VocabCache[getFn](sampleWord.toUpperCase(), { indexedDB: idb });
    expect(found).toEqual(sampleEntry);
  });

  it("resolves to undefined for an entry that was never cached", async () => {
    const idb = freshIndexedDB();
    const found = await VocabCache[getFn]("nonexistent xyz", { indexedDB: idb });
    expect(found).toBeUndefined();
  });

  it("resolves to false when putting an entry with no word", async () => {
    const idb = freshIndexedDB();
    const ok = await VocabCache[putFn]({ senses: [] }, { indexedDB: idb });
    expect(ok).toBe(false);
  });

  it(`getAll for ${categoryName} is independent of the other Language Bank categories`, async () => {
    const idb = freshIndexedDB();
    await VocabCache.putPhrasal({ w: "give up", senses: [] }, { indexedDB: idb });
    await VocabCache[putFn](sampleEntry, { indexedDB: idb });

    const all = await VocabCache[getAllFn]({ indexedDB: idb });
    expect(all.map((e) => e.w)).toEqual([sampleWord]);

    const phrasalAll = await VocabCache.getAllPhrasal({ indexedDB: idb });
    expect(phrasalAll.map((e) => e.w)).toEqual(["give up"]);
  });
});
