/* =========================================================
   Tagalog/Filipino translation lookup — fallback for a word (or sense)
   the local Vocabulary Bank has no Filipino equivalent for yet, and for
   translating a Tagalog search query into English.

   Loaded as a plain browser <script> (attaches window.TagalogLookup)
   and as a CommonJS module for tests (module.exports). No build step,
   no bundler — this file must stay valid as both. Mirrors
   js/online-lookup.js's shape and design rules on purpose:
   - fetchTagalogTranslation() never throws — any failure (offline,
     HTTP error, malformed response, low-confidence match) resolves to
     `null` so callers can treat "no reliable translation" exactly like
     "no online result" and fall back to explicit "not found" messaging
     instead of inventing or guessing a translation.
   - The network call, the "are we online" check, and the cache are all
     injectable, same as online-lookup.js.
   - MyMemory (api.mymemory.translated.net) is free, keyless, and
     CORS-enabled — same "no API key, no server" constraint every other
     online source in this app already follows.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.TagalogLookup = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  var TRANSLATE_API_BASE = "https://api.mymemory.translated.net/get";
  // Below this match-quality score (MyMemory's own 0-1 confidence
  // metric), a candidate is treated the same as "nothing came back" —
  // showing a low-confidence guess as if it were an accurate
  // translation is exactly the "inventing one" behavior this module
  // must avoid.
  var MIN_MATCH_QUALITY = 0.5;
  var MAX_ALTERNATES = 4;

  function buildRequestUrl(text, langpair) {
    return TRANSLATE_API_BASE + "?q=" + encodeURIComponent(text) + "&langpair=" + encodeURIComponent(langpair);
  }

  function dedupeCaseInsensitive(arr) {
    var seen = Object.create(null);
    var out = [];
    arr.forEach(function (v) {
      var trimmed = String(v || "").trim();
      if (!trimmed) return;
      var key = trimmed.toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        out.push(trimmed);
      }
    });
    return out;
  }

  // MyMemory sometimes echoes the query back as the "translation" when
  // it has nothing better (especially for short/ambiguous input) —
  // treated the same as no result, never shown as a real equivalent.
  function isEchoOfQuery(candidate, query) {
    return String(candidate || "").trim().toLowerCase() === String(query || "").trim().toLowerCase();
  }

  // Pulls every distinct, high-confidence alternate translation out of
  // MyMemory's `matches` array (not just the single top `responseData`
  // pick), so a word with several natural Filipino equivalents (like
  // "iwan / talikuran" for "abandon" in this app's own built-in data)
  // can be represented the same way here — closest accurate match
  // first, never padded out with low-quality guesses.
  function extractCandidates(json, query) {
    var out = [];
    var seenScore = -1;
    if (json && json.responseData && json.responseData.translatedText) {
      var topScore = typeof json.responseData.match === "number" ? json.responseData.match : 1;
      if (topScore >= MIN_MATCH_QUALITY && !isEchoOfQuery(json.responseData.translatedText, query)) {
        out.push(json.responseData.translatedText);
        seenScore = topScore;
      }
    }
    if (Array.isArray(json && json.matches)) {
      json.matches
        .slice()
        .sort(function (a, b) { return (b.match || 0) - (a.match || 0); })
        .forEach(function (m) {
          var score = typeof m.match === "number" ? m.match : parseFloat(m.match);
          if (!(score >= MIN_MATCH_QUALITY)) return;
          if (isEchoOfQuery(m.translation, query)) return;
          out.push(m.translation);
        });
    }
    return dedupeCaseInsensitive(out).slice(0, MAX_ALTERNATES);
  }

  // langpair is "en|tl" (English -> Filipino, the common case) or
  // "tl|en" (Filipino -> English, used for the reverse-search fallback
  // when a typed query doesn't match anything in English at all).
  function fetchTranslation(text, langpair, options) {
    var opts = options || {};
    var trimmed = (text || "").trim();
    if (!trimmed) return Promise.resolve(null);

    var isOnline = typeof opts.isOnline === "function"
      ? opts.isOnline
      : function () { return typeof navigator === "undefined" || navigator.onLine !== false; };
    if (!isOnline()) return Promise.resolve(null);

    var cacheKey = langpair + ":" + trimmed.toLowerCase();
    var cache = opts.cache;
    if (cache) {
      var cached = cache.get(cacheKey);
      if (cached !== undefined) return Promise.resolve(cached);
    }

    var fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchImpl) return Promise.resolve(null);

    return fetchImpl(buildRequestUrl(trimmed, langpair), { signal: opts.signal })
      .then(function (res) {
        if (!res || !res.ok) return null;
        return res.json();
      })
      .then(function (json) {
        if (!json) return null;
        // A rate-limited/quota-exhausted anonymous request still
        // returns HTTP 200 with a warning baked into the text instead
        // of a real translation — never surface that as a result.
        var responseDetails = String(json.responseDetails || "");
        if (/MYMEMORY WARNING|INVALID LANGUAGE PAIR|QUOTA/i.test(responseDetails)) return null;

        var candidates = extractCandidates(json, trimmed);
        if (candidates.length === 0) return null;
        return { text: candidates.join("; "), candidates: candidates };
      })
      .catch(function () {
        // Offline, aborted, CORS failure, malformed JSON, etc. — all
        // treated the same: no reliable translation from this attempt.
        return null;
      })
      .then(function (result) {
        if (cache) cache.set(cacheKey, result);
        return result;
      });
  }

  // English word/phrase -> Filipino equivalent(s). Returns
  // {text, candidates} on a reliable match, or null — never a fabricated
  // guess. `text` is candidates.join("; "), matching the "iwan /
  // talikuran"-style multi-equivalent convention this app's own
  // built-in vocabData already uses (joined with "; " rather than "/"
  // so it never collides with a translation that legitimately contains
  // a slash).
  function fetchTagalogTranslation(word, options) {
    return fetchTranslation(word, "en|tl", options);
  }

  // Filipino/Tagalog word or phrase -> English equivalent. Used only as
  // a last-resort fallback when a search query matches nothing locally
  // and no English dictionary source recognizes it either — the
  // resulting English word (if any) is then run back through the
  // normal English lookup pipeline, never displayed as a standalone
  // "translation" result on its own.
  function fetchEnglishTranslation(word, options) {
    return fetchTranslation(word, "tl|en", options);
  }

  // Same same-session cache shape as OnlineLookup.createMemoryCache() —
  // get/set, keyed by whatever string the caller passes in.
  function createMemoryCache() {
    var store = new Map();
    return {
      get: function (key) { return store.get(key); },
      set: function (key, value) { store.set(key, value); }
    };
  }

  return {
    TRANSLATE_API_BASE: TRANSLATE_API_BASE,
    MIN_MATCH_QUALITY: MIN_MATCH_QUALITY,
    buildRequestUrl: buildRequestUrl,
    extractCandidates: extractCandidates,
    fetchTagalogTranslation: fetchTagalogTranslation,
    fetchEnglishTranslation: fetchEnglishTranslation,
    createMemoryCache: createMemoryCache
  };
});
