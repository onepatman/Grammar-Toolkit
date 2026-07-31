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
     - reviewSchedule: per-favorited-word spaced-repetition state (level
                        + next-due timestamp) driving the Favorites tab's
                        "Study mode" — see js/spaced-repetition.js for the
                        scheduling math itself, kept out of this file.
     - distinctionsEntries: Distinctions Words — commonly confused/misused
                        word PAIRS (e.g. Affect vs Effect), each entry
                        holding two independent word1/word2 sub-entries.
                        Added via its own two-word quick-add, persisted
                        the same way the Language Bank categories are.
     - prepEntries, articleEntries, modalEntries, capitalEntries,
       orderEntries, qaEntries:
                        the six standalone grammar-rule tabs (Prepositions,
                        Articles, Modals, Capitalization, Word Order,
                        Question Starters) — same generic { key, entry }
                        shape as the Language Bank stores, added via each
                        tab's own quick-add box. Local-only: unlike
                        vocabEntries/phrasalEntries/etc. these don't
                        currently participate in Firestore cross-device
                        sync (see LANGUAGE_BANK_CATEGORIES in index.html).
     - familyEntries:   Owner-added Word Family entries (verb -> noun/
                        person/adjective forms + example sentences),
                        added via the Family tab's own quick-add box.
                        Same generic { key, entry } shape and same
                        local-only scope as the six grammar-rule stores
                        above.
     - tenseEntries:    Owner-added tense-related constructions (e.g.
                        "Going to" Future, "Used to" habitual past) that
                        aren't one of the 12 core English tenses already
                        built in — added via the Tenses tab's own
                        manual-only quick-add box (no online lookup: these
                        are grammar constructions, not dictionary words).
                        Same generic { key, entry } shape and same
                        local-only scope as familyEntries above.

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
  var DB_VERSION = 12;
  var STORE_NAME = "vocabEntries";
  var FAVORITES_STORE = "favorites";
  var RECENT_STORE = "recentlyViewed";
  var PHRASAL_STORE = "phrasalEntries";
  var IDIOMS_STORE = "idiomEntries";
  var SENTENCES_STORE = "sentenceEntries";
  var PATTERNS_STORE = "patternEntries";
  var TECHNICAL_STORE = "technicalEntries";
  var REVIEW_STORE = "reviewSchedule";
  var DISTINCTIONS_STORE = "distinctionsEntries";
  var CUSTOM_VERBS_STORE = "customVerbs";
  var PRACTICE_USAGE_STORE = "practiceUsage";
  var PRACTICE_HISTORY_STORE = "practiceHistory";
  var PREP_STORE = "prepEntries";
  var ARTICLE_STORE = "articleEntries";
  var MODAL_STORE = "modalEntries";
  var CAPITAL_STORE = "capitalEntries";
  var ORDER_STORE = "orderEntries";
  var QA_STORE = "qaEntries";
  var FAMILY_STORE = "familyEntries";
  var TENSE_STORE = "tenseEntries";
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
        if (!db.objectStoreNames.contains(REVIEW_STORE)) {
          db.createObjectStore(REVIEW_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(DISTINCTIONS_STORE)) {
          db.createObjectStore(DISTINCTIONS_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(CUSTOM_VERBS_STORE)) {
          db.createObjectStore(CUSTOM_VERBS_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(PRACTICE_USAGE_STORE)) {
          db.createObjectStore(PRACTICE_USAGE_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(PRACTICE_HISTORY_STORE)) {
          db.createObjectStore(PRACTICE_HISTORY_STORE, { keyPath: "key" });
        }
        [PREP_STORE, ARTICLE_STORE, MODAL_STORE, CAPITAL_STORE, ORDER_STORE, QA_STORE].forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "key" });
          }
        });
        if (!db.objectStoreNames.contains(FAMILY_STORE)) {
          db.createObjectStore(FAMILY_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(TENSE_STORE)) {
          db.createObjectStore(TENSE_STORE, { keyPath: "key" });
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

  function deleteVocab(word, options) {
    return deleteEntry(STORE_NAME, word, options);
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

  /* ---------- Distinctions Words (commonly confused word pairs) ----------
     Same generic { key, entry } shape as every other category — `entry.w`
     is a synthetic combined label ("affect vs effect") used only as the
     store key, while the real per-word content lives in entry.word1/word2. */

  function getDistinction(word, options) { return getEntry(DISTINCTIONS_STORE, word, options); }
  function putDistinction(entry, options) { return putEntry(DISTINCTIONS_STORE, entry, options); }
  function getAllDistinctions(options) { return getAllEntries(DISTINCTIONS_STORE, options); }
  function deleteDistinction(word, options) { return deleteEntry(DISTINCTIONS_STORE, word, options); }

  /* ---------- customVerbs (Owner-added verbs, manual 5-form entry) ----------
     Same generic { key, entry } shape; entry.group is "regular" or
     "irregular" so the store round-trips which Verbs sub-tab the entry
     belongs to. */

  function getCustomVerb(word, options) { return getEntry(CUSTOM_VERBS_STORE, word, options); }
  function putCustomVerb(entry, options) { return putEntry(CUSTOM_VERBS_STORE, entry, options); }
  function getAllCustomVerbs(options) { return getAllEntries(CUSTOM_VERBS_STORE, options); }
  function deleteCustomVerb(word, options) { return deleteEntry(CUSTOM_VERBS_STORE, word, options); }

  /* ---------- standalone grammar-rule tabs (Prepositions, Articles,
     Modals, Capitalization, Word Order, Question Starters) ----------
     Same generic { key, entry } shape as the Language Bank categories. */

  function getPrep(word, options) { return getEntry(PREP_STORE, word, options); }
  function putPrep(entry, options) { return putEntry(PREP_STORE, entry, options); }
  function getAllPreps(options) { return getAllEntries(PREP_STORE, options); }
  function deletePrep(word, options) { return deleteEntry(PREP_STORE, word, options); }

  function getArticle(word, options) { return getEntry(ARTICLE_STORE, word, options); }
  function putArticle(entry, options) { return putEntry(ARTICLE_STORE, entry, options); }
  function getAllArticles(options) { return getAllEntries(ARTICLE_STORE, options); }
  function deleteArticle(word, options) { return deleteEntry(ARTICLE_STORE, word, options); }

  function getModal(word, options) { return getEntry(MODAL_STORE, word, options); }
  function putModal(entry, options) { return putEntry(MODAL_STORE, entry, options); }
  function getAllModals(options) { return getAllEntries(MODAL_STORE, options); }
  function deleteModal(word, options) { return deleteEntry(MODAL_STORE, word, options); }

  function getCapital(word, options) { return getEntry(CAPITAL_STORE, word, options); }
  function putCapital(entry, options) { return putEntry(CAPITAL_STORE, entry, options); }
  function getAllCapital(options) { return getAllEntries(CAPITAL_STORE, options); }
  function deleteCapital(word, options) { return deleteEntry(CAPITAL_STORE, word, options); }

  function getOrder(word, options) { return getEntry(ORDER_STORE, word, options); }
  function putOrder(entry, options) { return putEntry(ORDER_STORE, entry, options); }
  function getAllOrder(options) { return getAllEntries(ORDER_STORE, options); }
  function deleteOrder(word, options) { return deleteEntry(ORDER_STORE, word, options); }

  function getQa(word, options) { return getEntry(QA_STORE, word, options); }
  function putQa(entry, options) { return putEntry(QA_STORE, entry, options); }
  function getAllQa(options) { return getAllEntries(QA_STORE, options); }
  function deleteQa(word, options) { return deleteEntry(QA_STORE, word, options); }

  /* ---------- familyEntries (Owner-added Word Family entries) ----------
     Same generic { key, entry } shape as customVerbs/the six grammar-rule
     stores, but keyed on entry.verb (wordFamilyData's own headword field)
     rather than entry.w, since Word Family entries never had a `.w`. */

  function getFamily(word, options) { return storeGet(FAMILY_STORE, normalizeKey(word), options).then(function (row) { return row ? row.entry : undefined; }); }
  function putFamily(entry, options) {
    if (!entry || !entry.verb) return Promise.resolve(false);
    return storePut(FAMILY_STORE, { key: normalizeKey(entry.verb), entry: entry }, options);
  }
  function getAllFamily(options) { return getAllEntries(FAMILY_STORE, options); }
  function deleteFamily(word, options) { return deleteEntry(FAMILY_STORE, word, options); }

  /* ---------- tenseEntries (Owner-added tense-related constructions) ----------
     Same generic { key, entry } shape, keyed on entry.name (tenseData's
     own headword field) rather than entry.w, since tense entries never
     had a `.w`. */

  function getTense(name, options) { return storeGet(TENSE_STORE, normalizeKey(name), options).then(function (row) { return row ? row.entry : undefined; }); }
  function putTense(entry, options) {
    if (!entry || !entry.name) return Promise.resolve(false);
    return storePut(TENSE_STORE, { key: normalizeKey(entry.name), entry: entry }, options);
  }
  function getAllTense(options) { return getAllEntries(TENSE_STORE, options); }
  function deleteTense(name, options) { return deleteEntry(TENSE_STORE, name, options); }

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

  /* ---------- review schedule (Favorites "Study mode") ---------- */

  function getReviewSchedule(word, options) {
    return storeGet(REVIEW_STORE, normalizeKey(word), options);
  }

  function putReviewSchedule(record, options) {
    if (!record || !record.word) return Promise.resolve(false);
    return storePut(REVIEW_STORE, {
      key: normalizeKey(record.word),
      word: record.word,
      cat: record.cat || "",
      level: record.level,
      dueAt: record.dueAt,
      lastReviewedAt: record.lastReviewedAt
    }, options);
  }

  function getAllReviewSchedule(options) {
    return storeGetAll(REVIEW_STORE, options);
  }

  function deleteReviewSchedule(word, options) {
    return storeDelete(REVIEW_STORE, normalizeKey(word), options);
  }

  /* ---------- practice usage (Practice tab non-repetition) ----------
     One record per word ever asked in a Practice session, across every
     mode (Flashcards/MCQ/Spelling/True-False/Matching all share this —
     the point is "don't ask about the same word again right away", not
     "don't repeat this exact MCQ phrasing"). Session-building sorts
     candidates by lastUsedAt ascending (never-asked words, which have
     no record at all, sort first), so each new session favors whatever
     hasn't been seen recently instead of the same handful every time. */

  function recordPracticeUsage(word, options) {
    var key = normalizeKey(word);
    if (!key) return Promise.resolve(false);
    return storePut(PRACTICE_USAGE_STORE, { key: key, word: word, lastUsedAt: Date.now() }, options);
  }

  function getAllPracticeUsage(options) {
    return storeGetAll(PRACTICE_USAGE_STORE, options);
  }

  /* ---------- practice history (session results) ----------
     One record per completed Practice session — local-only, same as
     reviewSchedule/spaced-repetition above, since this is per-device
     personal learning progress rather than shared Owner-curated
     content, so it doesn't participate in the Firestore sync that
     covers vocab/languageBank/distinctions/verbs/entries. */

  function addPracticeHistory(record, options) {
    if (!record) return Promise.resolve(false);
    var key = String(record.completedAt || Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
    return storePut(PRACTICE_HISTORY_STORE, {
      key: key,
      mode: record.mode,
      source: record.source,
      completedAt: record.completedAt || Date.now(),
      correct: record.correct,
      total: record.total,
      percentage: record.percentage,
      rating: record.rating
    }, options);
  }

  function getAllPracticeHistory(options) {
    return storeGetAll(PRACTICE_HISTORY_STORE, options).then(function (rows) {
      return rows.sort(function (a, b) { return b.completedAt - a.completedAt; });
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
    deleteVocab: deleteVocab,
    FAVORITES_STORE: FAVORITES_STORE,
    RECENT_STORE: RECENT_STORE,
    PHRASAL_STORE: PHRASAL_STORE,
    IDIOMS_STORE: IDIOMS_STORE,
    SENTENCES_STORE: SENTENCES_STORE,
    PATTERNS_STORE: PATTERNS_STORE,
    TECHNICAL_STORE: TECHNICAL_STORE,
    REVIEW_STORE: REVIEW_STORE,
    DISTINCTIONS_STORE: DISTINCTIONS_STORE,
    CUSTOM_VERBS_STORE: CUSTOM_VERBS_STORE,
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
    getDistinction: getDistinction,
    putDistinction: putDistinction,
    getAllDistinctions: getAllDistinctions,
    deleteDistinction: deleteDistinction,
    getCustomVerb: getCustomVerb,
    putCustomVerb: putCustomVerb,
    getAllCustomVerbs: getAllCustomVerbs,
    deleteCustomVerb: deleteCustomVerb,
    PREP_STORE: PREP_STORE,
    ARTICLE_STORE: ARTICLE_STORE,
    MODAL_STORE: MODAL_STORE,
    CAPITAL_STORE: CAPITAL_STORE,
    ORDER_STORE: ORDER_STORE,
    QA_STORE: QA_STORE,
    getPrep: getPrep,
    putPrep: putPrep,
    getAllPreps: getAllPreps,
    deletePrep: deletePrep,
    getArticle: getArticle,
    putArticle: putArticle,
    getAllArticles: getAllArticles,
    deleteArticle: deleteArticle,
    getModal: getModal,
    putModal: putModal,
    getAllModals: getAllModals,
    deleteModal: deleteModal,
    getCapital: getCapital,
    putCapital: putCapital,
    getAllCapital: getAllCapital,
    deleteCapital: deleteCapital,
    getOrder: getOrder,
    putOrder: putOrder,
    getAllOrder: getAllOrder,
    deleteOrder: deleteOrder,
    getQa: getQa,
    putQa: putQa,
    getAllQa: getAllQa,
    deleteQa: deleteQa,
    FAMILY_STORE: FAMILY_STORE,
    getFamily: getFamily,
    putFamily: putFamily,
    getAllFamily: getAllFamily,
    deleteFamily: deleteFamily,
    TENSE_STORE: TENSE_STORE,
    getTense: getTense,
    putTense: putTense,
    getAllTense: getAllTense,
    deleteTense: deleteTense,
    richnessScore: richnessScore,
    isRicherEntry: isRicherEntry,
    validateEntry: validateEntry,
    filterValidEntries: filterValidEntries,
    addFavorite: addFavorite,
    removeFavorite: removeFavorite,
    isFavorite: isFavorite,
    getAllFavorites: getAllFavorites,
    getReviewSchedule: getReviewSchedule,
    putReviewSchedule: putReviewSchedule,
    getAllReviewSchedule: getAllReviewSchedule,
    deleteReviewSchedule: deleteReviewSchedule,
    recordPracticeUsage: recordPracticeUsage,
    getAllPracticeUsage: getAllPracticeUsage,
    addPracticeHistory: addPracticeHistory,
    getAllPracticeHistory: getAllPracticeHistory,
    recordRecentlyViewed: recordRecentlyViewed,
    getRecentlyViewed: getRecentlyViewed
  };
});
