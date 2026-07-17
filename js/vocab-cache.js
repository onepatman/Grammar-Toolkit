/* =========================================================
   Vocabulary cache — persists words looked up online into IndexedDB,
   so they become a permanent, offline-available extension of the local
   Vocabulary Bank instead of a one-off session lookup.

   Loaded as a plain browser <script> (attaches window.VocabCache) and
   as a CommonJS module for tests (module.exports). No build step, no
   bundler — this file must stay valid as both.

   Design notes:
   - Every operation resolves to a safe fallback (undefined/false/[])
     instead of throwing or rejecting — same "never breaks the caller"
     contract as js/online-lookup.js. A browser with IndexedDB disabled
     (private-mode Safari, some embedded webviews) just gets no cache,
     not a crash.
   - The database name is versioned (DB_VERSION) and every entry is
     namespaced as "vocabEntries" specifically so this can grow into a
     real local-first data layer later — additional object stores for
     favorites, recently-viewed words, or a bundled offline vocabulary
     pack can be added in a future onupgradeneeded without touching or
     migrating this store. That's the intended extension point.
   - `openDb()`/`get()`/`put()`/`getAll()` all accept an injectable
     `indexedDB` implementation (and a shared `dbPromise` to avoid
     reopening the connection per call) purely for testability — the
     production path always uses the real global `indexedDB`.
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
  var DB_VERSION = 1;
  var STORE_NAME = "vocabEntries";

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

  function get(word, options) {
    return resolveDb(options).then(function (db) {
      if (!db) return undefined;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, "readonly");
          var req = tx.objectStore(STORE_NAME).get(normalizeKey(word));
          req.onsuccess = function () { resolve(req.result ? req.result.entry : undefined); };
          req.onerror = function () { resolve(undefined); };
        } catch (e) {
          resolve(undefined);
        }
      });
    });
  }

  function put(entry, options) {
    if (!entry || !entry.w) return Promise.resolve(false);
    return resolveDb(options).then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put({ key: normalizeKey(entry.w), entry: entry });
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
          tx.onabort = function () { resolve(false); };
        } catch (e) {
          resolve(false);
        }
      });
    });
  }

  function getAll(options) {
    return resolveDb(options).then(function (db) {
      if (!db) return [];
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, "readonly");
          var req = tx.objectStore(STORE_NAME).getAll();
          req.onsuccess = function () {
            resolve((req.result || []).map(function (row) { return row.entry; }));
          };
          req.onerror = function () { resolve([]); };
        } catch (e) {
          resolve([]);
        }
      });
    });
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

  return {
    DB_NAME: DB_NAME,
    DB_VERSION: DB_VERSION,
    STORE_NAME: STORE_NAME,
    openDb: openDb,
    get: get,
    put: put,
    getAll: getAll,
    richnessScore: richnessScore,
    isRicherEntry: isRicherEntry
  };
});
