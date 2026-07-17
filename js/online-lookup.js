/* =========================================================
   Online dictionary lookup — fallback for words the local
   vocabulary bank doesn't have.

   Loaded as a plain browser <script> (attaches window.OnlineLookup)
   and as a CommonJS module for tests (module.exports). No build step,
   no bundler — this file must stay valid as both.

   Design notes (why it's shaped this way):
   - fetchOnlineDefinition() never throws — any failure (offline, HTTP
     error, malformed response) resolves to `null` so callers can treat
     "no online result" exactly like "no local result" and fall back to
     the existing empty-state UI.
   - The network call, the "are we online" check, and the cache are all
     injectable. Today `createMemoryCache()` is an in-memory Map that
     only lives for the page session; swapping it for a persistent
     store (localStorage/IndexedDB, for offline reuse of past lookups)
     later is a one-line change at the call site, not a rewrite of this
     module.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.OnlineLookup = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  var DICTIONARY_API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";
  var MAX_SENSES = 6;
  var DEFINITIONS_PER_MEANING = 2;

  function buildRequestUrl(word) {
    return DICTIONARY_API_BASE + encodeURIComponent(word);
  }

  // Turns the Free Dictionary API's response shape into the same
  // {w, senses:[{use, examples}], syn, ant} shape renderRuleEntry()
  // already knows how to draw — so the result is indistinguishable
  // from a local Vocabulary Bank entry once it's on screen.
  function normalizeDictionaryResponse(json, word) {
    if (!Array.isArray(json) || json.length === 0) return null;

    var senses = [];
    var syn = [];
    var ant = [];

    json.forEach(function (entry) {
      (entry.meanings || []).forEach(function (meaning) {
        var pos = meaning.partOfSpeech ? "(" + meaning.partOfSpeech + ") " : "";
        (meaning.definitions || []).slice(0, DEFINITIONS_PER_MEANING).forEach(function (def) {
          if (!def.definition) return;
          senses.push({
            use: pos + def.definition,
            examples: def.example ? [def.example] : []
          });
          if (Array.isArray(def.synonyms)) syn = syn.concat(def.synonyms);
          if (Array.isArray(def.antonyms)) ant = ant.concat(def.antonyms);
        });
        if (Array.isArray(meaning.synonyms)) syn = syn.concat(meaning.synonyms);
        if (Array.isArray(meaning.antonyms)) ant = ant.concat(meaning.antonyms);
      });
    });

    if (senses.length === 0) return null;

    return {
      w: (json[0].word || word),
      senses: senses.slice(0, MAX_SENSES),
      syn: dedupe(syn).slice(0, 8),
      ant: dedupe(ant).slice(0, 8),
      mistake: null,
      tagalog: null,
      source: "online"
    };
  }

  function dedupe(arr) {
    var seen = Object.create(null);
    var out = [];
    arr.forEach(function (v) {
      var key = String(v).toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        out.push(v);
      }
    });
    return out;
  }

  // A same-session cache, keyed by lowercased word. Deliberately the
  // simplest thing that satisfies the interface fetchOnlineDefinition
  // expects (get/set) — a future persistent cache just needs to expose
  // the same two methods.
  function createMemoryCache() {
    var store = new Map();
    return {
      get: function (word) { return store.get(word.trim().toLowerCase()); },
      set: function (word, value) { store.set(word.trim().toLowerCase(), value); }
    };
  }

  function fetchOnlineDefinition(word, options) {
    var opts = options || {};
    var trimmed = (word || "").trim();
    if (!trimmed) return Promise.resolve(null);

    var isOnline = typeof opts.isOnline === "function"
      ? opts.isOnline
      : function () { return typeof navigator === "undefined" || navigator.onLine !== false; };
    if (!isOnline()) return Promise.resolve(null);

    var cache = opts.cache;
    if (cache) {
      var cached = cache.get(trimmed);
      if (cached !== undefined) return Promise.resolve(cached);
    }

    var fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchImpl) return Promise.resolve(null);

    return fetchImpl(buildRequestUrl(trimmed), { signal: opts.signal })
      .then(function (res) {
        if (!res || !res.ok) return null;
        return res.json();
      })
      .then(function (json) {
        var result = json ? normalizeDictionaryResponse(json, trimmed) : null;
        if (result && cache) cache.set(trimmed, result);
        return result;
      })
      .catch(function () {
        // Offline, aborted, CORS failure, malformed JSON, etc. — all
        // treated the same: no online result, caller falls back.
        return null;
      });
  }

  return {
    DICTIONARY_API_BASE: DICTIONARY_API_BASE,
    buildRequestUrl: buildRequestUrl,
    normalizeDictionaryResponse: normalizeDictionaryResponse,
    createMemoryCache: createMemoryCache,
    fetchOnlineDefinition: fetchOnlineDefinition
  };
});
