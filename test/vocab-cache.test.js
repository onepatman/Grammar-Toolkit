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
