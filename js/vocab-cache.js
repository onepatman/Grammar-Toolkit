/* =========================================================
   Local-first data layer for the Grammar Toolkit — one IndexedDB
   database with a store per feature:
     - vocabEntries:   words retrieved online, persisted so they become
                        a permanent, offline-available extension of the
                        local Vocabulary Bank instead of a one-off
                        session lookup.
     - favorites:      bookmarked words (any category, not just Vocab).
     - recentlyViewed: the last N entries the user actually opened.
     - phrasalEntries, idiomEntries, sentenceEntries, patternEntries,
       technicalEntries:
                        the five Language Bank categories (Phrasal
                        Verbs, Idioms & Expressions, Useful Sentences,
                        Sentence Patterns, Technical/Engineering Terms),
                        each added via that category's own quick-add and
                        persisted the same way vocabEntries are.

   Loaded as a plain browser <script> (attaches window.VocabCache) and
   as a CommonJS module for tests (module.exports). No build step, no
   bundler — this file must stay valid as both.

   Design notes:
   - Every operation resolves to a safe fallback (undefined/false/[])
     instead of throwing or rejecting — same "never breaks the caller"
     contract as js/online-lookup.js. A browser with IndexedDB disabled
     (private-mode Safari, some embedded webviews) just gets no cache,
     not a crash.
   - `openDb()` and every store function accept an injectable
     `indexedDB` implementation (and a shared `dbPromise` to avoid
     reopening the connection per call) purely for testability — the
     production path always uses the real global `indexedDB`.
   - Adding another store later (e.g. a bundled/downloadable offline
     pack's own manifest) is the same pattern: bump DB_VERSION, add one
     more `if (!db.objectStoreNames.contains(...))` branch in
     onupgradeneeded. Nothing else here needs to change.
   - importPack()/validateEntry() are the shared entry point for BOTH a
     downloaded pack file and a single online lookup result — anything
     shaped like a vocabData entry goes through the same validated path
     into the same store.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.VocabCache = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  var DB_NAME = "mepf-grammar-toolkit-vocab-cache";
  var DB_VERSION = 5;
  var STORE_NAME = "vocabEntries";
  var FAVORITES_STORE = "favorites";
  var RECENT_STORE = "recentlyViewed";
  var PHRASAL_STORE = "phrasalEntries";
  var IDIOMS_STORE = "idiomEntries";
  var SENTENCES_STORE = "sentenceEntries";
  var PATTERNS_STORE = "patternEntries";
  var TECHNICAL_STORE = "technicalEntries";
  var RECENT_LIMIT = 200;

  function openDb(indexedDBImpl) {
    var idb = indexedDBImpl || (typeof indexedDB !== "undefined" ? indexedDB : null);
    if (!idb) return Promise.resolve(null);

    return new Promise(function (resolve) {
      var request;
      try {
        request = idb.open(DB_NAME, DB_VERSION);
      } catch (e) {
        resolve(null);
        return;
      }
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(FAVORITES_STORE)) {
          db.createObjectStore(FAVORITES_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(RECENT_STORE)) {
          db.createObjectStore(RECENT_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(PHRASAL_STORE)) {
          db.createObjectStore(PHRASAL_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(IDIOMS_STORE)) {
          db.createObjectStore(IDIOMS_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(SENTENCES_STORE)) {
          db.createObjectStore(SENTENCES_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(PATTERNS_STORE)) {
          db.createObjectStore(PATTERNS_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(TECHNICAL_STORE)) {
          db.createObjectStore(TECHNICAL_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { resolve(null); };
      request.onblocked = function () { resolve(null); };
    });
  }

  function normalizeKey(word) {
    return String(word || "").trim().toLowerCase();
  }

  function resolveDb(options) {
    var opts = options || {};
    return opts.dbPromise || openDb(opts.indexedDB);
  }

  // Generic single-store helpers, shared by vocabEntries/favorites/recentlyViewed.
  function storeGet(storeName, key, options) {
    return resolveDb(options).then(function (db) {
      if (!db) return undefined;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(storeName, "readonly");
          var req = tx.objectStore(storeName).get(key);
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { resolve(undefined); };
        } catch (e) {
          resolve(undefined);
        }
      });
    });
  }

  function storePut(storeName, record, options) {
    return resolveDb(options).then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(storeName, "readwrite");
          tx.objectStore(storeName).put(record);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
          tx.onabort = function () { resolve(false); };
        } catch (e) {
          resolve(false);
        }
      });
    });
  }

  function storeDelete(storeName, key, options) {
    return resolveDb(options).then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(storeName, "readwrite");
          tx.objectStore(storeName).delete(key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
          tx.onabort = function () { resolve(false); };
        } catch (e) {
          resolve(false);
        }
      });
    });
  }

  function storeGetAll(storeName, options) {
    return resolveDb(options).then(function (db) {
      if (!db) return [];
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(storeName, "readonly");
          var req = tx.objectStore(storeName).getAll();
          req.onsuccess = function () { resolve(req.result || []); };
          req.onerror = function () { resolve([]); };
        } catch (e) {
          resolve([]);
        }
      });
    });
  }

  /* ---------- generic word-entry store (vocabEntries, phrasalEntries,
     idiomEntries, sentenceEntries, patternEntries all share this exact
     shape: { key: normalized word, entry: the full entry object } —
     only the store NAME differs per category). ---------- */

  function getEntry(storeName, word, options) {
    return storeGet(storeName, normalizeKey(word), options).then(function (row) {
      return row ? row.entry : undefined;
    });
  }

  function putEntry(storeName, entry, options) {
    if (!entry || !entry.w) return Promise.resolve(false);
    return storePut(storeName, { key: normalizeKey(entry.w), entry: entry }, options);
  }

  function getAllEntries(storeName, options) {
    return storeGetAll(storeName, options).then(function (rows) {
      return rows.map(function (row) { return row.entry; });
    });
  }

  function deleteEntry(storeName, word, options) {
    return storeDelete(storeName, normalizeKey(word), options);
  }

  /* ---------- vocabEntries (the offline Vocabulary Bank extension) ---------- */

  function get(word, options) {
    return getEntry(STORE_NAME, word, options);
  }

  function put(entry, options) {
    return putEntry(STORE_NAME, entry, options);
  }

  function getAll(options) {
    return getAllEntries(STORE_NAME, options);
  }

  // How "complete" an entry is, for deciding whether a fresh online
  // lookup should replace what's already cached for the same word.
  function richnessScore(entry) {
    if (!entry) return 0;
    return (entry.senses || []).length + (entry.syn || []).length + (entry.ant || []).length;
  }

  function isRicherEntry(candidate, existing) {
    return richnessScore(candidate) > richnessScore(existing);
  }

  // The shape every entry — online-looked-up or imported from a pack —
  // must satisfy before it's allowed into vocabEntries. Deliberately
  // permissive on optional fields (syn/ant/mistake/tagalog), strict on
  // the two things renderRuleEntry() actually requires to draw a page.
  function validateEntry(entry) {
    if (!entry || typeof entry.w !== "string" || !entry.w.trim()) return false;
    if (!Array.isArray(entry.senses) || entry.senses.length === 0) return false;
    return entry.senses.every(function (s) {
      return s && typeof s.use === "string" && s.use.trim() && Array.isArray(s.examples);
    });
  }

  /* ---------- Language Bank categories (phrasal/idioms/sentences/patterns) ---------- */

  function getPhrasal(word, options) { return getEntry(PHRASAL_STORE, word, options); }
  function putPhrasal(entry, options) { return putEntry(PHRASAL_STORE, entry, options); }
  function getAllPhrasal(options) { return getAllEntries(PHRASAL_STORE, options); }
  function deletePhrasal(word, options) { return deleteEntry(PHRASAL_STORE, word, options); }

  function getIdiom(word, options) { return getEntry(IDIOMS_STORE, word, options); }
  function putIdiom(entry, options) { return putEntry(IDIOMS_STORE, entry, options); }
  function getAllIdioms(options) { return getAllEntries(IDIOMS_STORE, options); }
  function deleteIdiom(word, options) { return deleteEntry(IDIOMS_STORE, word, options); }

  function getSentence(word, options) { return getEntry(SENTENCES_STORE, word, options); }
  function putSentence(entry, options) { return putEntry(SENTENCES_STORE, entry, options); }
  function getAllSentences(options) { return getAllEntries(SENTENCES_STORE, options); }
  function deleteSentence(word, options) { return deleteEntry(SENTENCES_STORE, word, options); }

  function getPattern(word, options) { return getEntry(PATTERNS_STORE, word, options); }
  function putPattern(entry, options) { return putEntry(PATTERNS_STORE, entry, options); }
  function getAllPatterns(options) { return getAllEntries(PATTERNS_STORE, options); }
  function deletePattern(word, options) { return deleteEntry(PATTERNS_STORE, word, options); }

  function getTechnical(word, options) { return getEntry(TECHNICAL_STORE, word, options); }
  function putTechnical(entry, options) { return putEntry(TECHNICAL_STORE, entry, options); }
  function getAllTechnical(options) { return getAllEntries(TECHNICAL_STORE, options); }
  function deleteTechnical(word, options) { return deleteEntry(TECHNICAL_STORE, word, options); }

  /* ---------- favorites ---------- */

  function addFavorite(word, meta, options) {
    var key = normalizeKey(word);
    if (!key) return Promise.resolve(false);
    var m = meta || {};
    return storePut(FAVORITES_STORE, {
      key: key,
      word: m.word || word,
      cat: m.cat || "",
      addedAt: Date.now()
    }, options);
  }

  function removeFavorite(word, options) {
    return storeDelete(FAVORITES_STORE, normalizeKey(word), options);
  }

  function isFavorite(word, options) {
    return storeGet(FAVORITES_STORE, normalizeKey(word), options).then(function (row) {
      return !!row;
    });
  }

  function getAllFavorites(options) {
    return storeGetAll(FAVORITES_STORE, options).then(function (rows) {
      return rows.sort(function (a, b) { return b.addedAt - a.addedAt; });
    });
  }

  /* ---------- recently viewed ---------- */

  function recordRecentlyViewed(word, cat, options) {
    var key = normalizeKey(word);
    if (!key) return Promise.resolve(false);
    return storePut(RECENT_STORE, {
      key: key,
      word: word,
      cat: cat || "",
      viewedAt: Date.now()
    }, options).then(function (ok) {
      if (!ok) return false;
      return trimRecentlyViewed(options).then(function () { return true; });
    });
  }

  // Keeps recentlyViewed from growing forever across months/years of
  // use — cheap at this scale (capped list, O(n) scan on write).
  function trimRecentlyViewed(options) {
    return storeGetAll(RECENT_STORE, options).then(function (rows) {
      if (rows.length <= RECENT_LIMIT) return;
      var toRemove = rows
        .sort(function (a, b) { return b.viewedAt - a.viewedAt; })
        .slice(RECENT_LIMIT);
      return Promise.all(toRemove.map(function (row) {
        return storeDelete(RECENT_STORE, row.key, options);
      }));
    });
  }

  function getRecentlyViewed(limit, options) {
    return storeGetAll(RECENT_STORE, options).then(function (rows) {
      return rows
        .sort(function (a, b) { return b.viewedAt - a.viewedAt; })
        .slice(0, typeof limit === "number" ? limit : RECENT_LIMIT);
    });
  }

  /* ---------- offline pack import ---------- */

  // Validates and returns only the well-formed entries from a batch
  // (e.g. parsed from an uploaded JSON file, or a future downloaded
  // pack). Does not write anything itself — merging into the live app
  // (dedup, richer-entry upgrades, DOM/search-index updates) needs
  // addVocabEntry() in index.html, which has access to that app state;
  // this module only owns validation and IndexedDB storage.
  function filterValidEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.filter(validateEntry);
  }

  return {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORE_NAME: STORE_NAME,
    FAVORITES_STORE: FAVORITES_STORE,
    RECENT_STORE: RECENT_STORE,
    PHRASAL_STORE: PHRASAL_STORE,
    IDIOMS_STORE: IDIOMS_STORE,
    SENTENCES_STORE: SENTENCES_STORE,
    PATTERNS_STORE: PATTERNS_STORE,
    TECHNICAL_STORE: TECHNICAL_STORE,
    RECENT_LIMIT: RECENT_LIMIT,
    openDb: openDb,
    get: get,
    put: put,
    getAll: getAll,
    getEntry: getEntry,
    putEntry: putEntry,
    getAllEntries: getAllEntries,
    deleteEntry: deleteEntry,
    getPhrasal: getPhrasal,
    putPhrasal: putPhrasal,
    getAllPhrasal: getAllPhrasal,
    deletePhrasal: deletePhrasal,
    getIdiom: getIdiom,
    putIdiom: putIdiom,
    getAllIdioms: getAllIdioms,
    deleteIdiom: deleteIdiom,
    getSentence: getSentence,
    putSentence: putSentence,
    getAllSentences: getAllSentences,
    deleteSentence: deleteSentence,
    getPattern: getPattern,
    putPattern: putPattern,
    getAllPatterns: getAllPatterns,
    deletePattern: deletePattern,
    getTechnical: getTechnical,
    putTechnical: putTechnical,
    getAllTechnical: getAllTechnical,
    deleteTechnical: deleteTechnical,
    richnessScore: richnessScore,
    isRicherEntry: isRicherEntry,
    validateEntry: validateEntry,
    filterValidEntries: filterValidEntries,
    addFavorite: addFavorite,
    removeFavorite: removeFavorite,
    isFavorite: isFavorite,
    getAllFavorites: getAllFavorites,
    recordRecentlyViewed: recordRecentlyViewed,
    getRecentlyViewed: getRecentlyViewed
  };
});
