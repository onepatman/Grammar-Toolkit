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
  var WIKTIONARY_API_BASE = "https://en.wiktionary.org/api/rest_v1/page/definition/";
  var WIKTIONARY_SEARCH_API = "https://en.wiktionary.org/w/api.php";
  var MAX_SENSES = 6;
  var DEFINITIONS_PER_MEANING = 2;

  function buildRequestUrl(word) {
    return DICTIONARY_API_BASE + encodeURIComponent(word);
  }

  function buildWiktionaryUrl(word) {
    return WIKTIONARY_API_BASE + encodeURIComponent(word);
  }

  // The MediaWiki Action API (keyless, CORS-enabled via origin=*, same
  // Wikimedia infrastructure as WIKTIONARY_API_BASE above) — used as a
  // last resort to find the closest matching Wiktionary PAGE TITLE for
  // a phrase that doesn't have its own exact-title entry. This is what
  // lets a full sentence or an inflected idiom ("It slipped my mind.")
  // find its way to the dictionary entry that actually has the
  // definition ("slip someone's mind"), without us maintaining any
  // manual list of idiom variants ourselves.
  function buildWiktionarySearchUrl(phrase) {
    var params = [
      "action=query",
      "list=search",
      "format=json",
      "origin=*",
      "srlimit=1",
      "srsearch=" + encodeURIComponent(phrase)
    ];
    return WIKTIONARY_SEARCH_API + "?" + params.join("&");
  }

  // Pulls the top search hit's page title out of the Action API's
  // response shape, or null if the search itself came back empty.
  function extractWiktionarySearchTitle(json) {
    var results = json && json.query && json.query.search;
    if (!Array.isArray(results) || results.length === 0) return null;
    return results[0].title || null;
  }

  // Query text is normalized ONLY for building lookup/search URLs — the
  // entry actually saved always keeps the literal text the user typed
  // (normalizeDictionaryResponse/normalizeWiktionaryResponse are always
  // called with the original, unnormalized word). Stripping wrapping
  // quotes and trailing sentence punctuation measurably improves exact
  // Wiktionary title matches (e.g. an entry literally titled "no
  // worries" won't match a query of "No worries.") without touching
  // internal apostrophes that matter for contractions/possessives.
  function normalizeQueryText(word) {
    return String(word || "")
      .trim()
      .replace(/^["'‘“]+|["'’”]+$/g, "")
      .replace(/[.?!]+$/, "")
      .trim();
  }

  function stripHtml(html) {
    return typeof html === "string" ? html.replace(/<[^>]*>/g, "").trim() : "";
  }

  // The Free Dictionary API frequently omits an example sentence for a
  // given definition. Rather than leave that sense with no example at
  // all, fall back to a simple, grammatically-safe template sentence for
  // the definition's part of speech, so every sense a user opens has at
  // least one usable example — same goal as the local Vocabulary Bank,
  // where every entry is hand-authored with one.
  var FALLBACK_EXAMPLE_TEMPLATES = {
    noun: [
      "The team discussed the {word} during the meeting.",
      "Understanding {word} is useful in this context.",
      "The report included a section on {word}."
    ],
    verb: [
      "They decided to {word} it before the deadline.",
      "It's important to {word} carefully in this situation.",
      "The team plans to {word} the new system next week."
    ],
    adjective: [
      "The results were considered {word}.",
      "Everyone agreed the plan was {word}.",
      "It turned out to be a {word} approach."
    ],
    adverb: [
      "She completed the task {word}.",
      "He explained the process {word}.",
      "The system responded {word}."
    ],
    _default: [
      "Here is an example sentence using \"{word}.\"",
      "\"{word}\" is a word commonly used in everyday English."
    ]
  };

  function generateFallbackExample(word, partOfSpeech, seed) {
    var templates = FALLBACK_EXAMPLE_TEMPLATES[partOfSpeech] || FALLBACK_EXAMPLE_TEMPLATES._default;
    var index = (typeof seed === "number" ? seed : 0) % templates.length;
    return templates[index].replace("{word}", "<b>" + word + "</b>");
  }

  // Turns the Free Dictionary API's response shape into the same
  // {w, senses:[{use, examples}], syn, ant} shape renderRuleEntry()
  // already knows how to draw — so the result is indistinguishable
  // from a local Vocabulary Bank entry once it's on screen.
  function normalizeDictionaryResponse(json, word, options) {
    if (!Array.isArray(json) || json.length === 0) return null;

    var allowFallbackExamples = !options || options.generateFallbackExamples !== false;
    var senses = [];
    var syn = [];
    var ant = [];
    var senseIndex = 0;

    json.forEach(function (entry) {
      (entry.meanings || []).forEach(function (meaning) {
        var pos = meaning.partOfSpeech ? "(" + meaning.partOfSpeech + ") " : "";
        (meaning.definitions || []).slice(0, DEFINITIONS_PER_MEANING).forEach(function (def) {
          if (!def.definition) return;
          var examples = [];
          if (def.example) {
            examples.push(def.example);
          } else if (allowFallbackExamples) {
            examples.push(generateFallbackExample(entry.word || word, meaning.partOfSpeech, senseIndex));
          }
          senses.push({
            use: pos + def.definition,
            examples: examples
          });
          senseIndex++;
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

  // Second, independent source — tried only when the primary API
  // (dictionaryapi.dev) has nothing, e.g. words it doesn't index at all.
  // Wiktionary's REST API (Wikimedia, no key required, CORS-enabled)
  // returns definitions per part of speech, keyed by language code, with
  // HTML-formatted text — stripped down to plain text here since we
  // don't want arbitrary external markup/links rendered inside our UI.
  function normalizeWiktionaryResponse(json, word, options) {
    if (!json || typeof json !== "object") return null;
    var entries = json.en; // English only, matching this app's audience
    if (!Array.isArray(entries) || entries.length === 0) return null;

    var allowFallbackExamples = !options || options.generateFallbackExamples !== false;
    var senses = [];
    var senseIndex = 0;

    entries.forEach(function (entry) {
      var partOfSpeech = (entry.partOfSpeech || "").toLowerCase();
      var pos = partOfSpeech ? "(" + partOfSpeech + ") " : "";
      (entry.definitions || []).slice(0, DEFINITIONS_PER_MEANING).forEach(function (def) {
        var text = stripHtml(def.definition);
        if (!text) return;

        var rawExamples = def.parsedExamples || def.examples || [];
        var examples = [];
        rawExamples.slice(0, 1).forEach(function (ex) {
          var exText = stripHtml(typeof ex === "string" ? ex : (ex.example || ex.expansion || ""));
          if (exText) examples.push(exText);
        });

        senses.push({
          use: pos + text,
          examples: examples.length ? examples : (allowFallbackExamples ? [generateFallbackExample(word, partOfSpeech, senseIndex)] : [])
        });
        senseIndex++;
      });
    });

    if (senses.length === 0) return null;

    return {
      w: word,
      senses: senses.slice(0, MAX_SENSES),
      syn: [],
      ant: [],
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

    // Only used to build outbound URLs — the entry ultimately saved
    // always carries `trimmed` (the literal text as typed) as its `w`,
    // via the fetchAndNormalize() closure below.
    var queryText = normalizeQueryText(trimmed) || trimmed;

    function fetchAndNormalize(url, normalize) {
      return fetchImpl(url, { signal: opts.signal })
        .then(function (res) {
          if (!res || !res.ok) return null;
          return res.json();
        })
        .then(function (json) {
          return json ? normalize(json, trimmed, opts) : null;
        })
        .catch(function () {
          // Offline, aborted, CORS failure, malformed JSON, etc. — all
          // treated the same: no result from this source.
          return null;
        });
    }

    // Third and last resort: multi-word phrases (idioms, useful
    // sentences, sentence patterns) very often don't have their own
    // exact-title Wiktionary entry — "It slipped my mind." is written
    // up under the canonical title "slip someone's mind", not the
    // literal inflected sentence — so a title lookup alone (above)
    // misses most of them. Wiktionary's own search finds the closest
    // matching title, which is then fetched and normalized exactly like
    // a direct hit.
    function searchWiktionaryThenFetch() {
      return fetchImpl(buildWiktionarySearchUrl(queryText), { signal: opts.signal })
        .then(function (res) { return res && res.ok ? res.json() : null; })
        .then(function (json) {
          var title = extractWiktionarySearchTitle(json);
          if (!title || title.toLowerCase() === queryText.toLowerCase()) return null; // already tried this exact title above
          return fetchAndNormalize(buildWiktionaryUrl(title), normalizeWiktionaryResponse);
        })
        .catch(function () { return null; });
    }

    return fetchAndNormalize(buildRequestUrl(queryText), normalizeDictionaryResponse)
      .then(function (result) {
        if (result) return result;
        // Primary source had nothing for this word — try a second,
        // independent source before giving up. Safe to chain: any
        // failure here (network, unexpected shape) still resolves to
        // null the same way a single-source lookup would.
        return fetchAndNormalize(buildWiktionaryUrl(queryText), normalizeWiktionaryResponse);
      })
      .then(function (result) {
        if (result) return result;
        return searchWiktionaryThenFetch();
      })
      .then(function (result) {
        if (result && cache) cache.set(trimmed, result);
        return result;
      });
  }

  return {
    DICTIONARY_API_BASE: DICTIONARY_API_BASE,
    WIKTIONARY_API_BASE: WIKTIONARY_API_BASE,
    WIKTIONARY_SEARCH_API: WIKTIONARY_SEARCH_API,
    buildRequestUrl: buildRequestUrl,
    buildWiktionaryUrl: buildWiktionaryUrl,
    buildWiktionarySearchUrl: buildWiktionarySearchUrl,
    extractWiktionarySearchTitle: extractWiktionarySearchTitle,
    normalizeQueryText: normalizeQueryText,
    normalizeDictionaryResponse: normalizeDictionaryResponse,
    normalizeWiktionaryResponse: normalizeWiktionaryResponse,
    generateFallbackExample: generateFallbackExample,
    createMemoryCache: createMemoryCache,
    fetchOnlineDefinition: fetchOnlineDefinition
  };
});
