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
  // A combined ceiling across every part of speech (noun/verb/adjective/
  // etc. all count against this together) — high enough that no
  // realistic word gets truncated (5 meanings x 8 possible parts of
  // speech), while still bounding worst-case payload size.
  var MAX_SENSES = 40;
  // Per part-of-speech meaning cap, matching this app's "2-5 meanings
  // per part of speech" editorial target — was 2, which silently
  // dropped a word's 3rd+ meaning under a given part of speech before
  // it ever reached the screen or the editor.
  var DEFINITIONS_PER_MEANING = 5;

  function buildRequestUrl(word) {
    return DICTIONARY_API_BASE + encodeURIComponent(word);
  }

  function buildWiktionaryUrl(word) {
    return WIKTIONARY_API_BASE + encodeURIComponent(word);
  }

  // Neither the Free Dictionary API's own data nor Wiktionary's
  // page/definition REST endpoint (normalizeWiktionaryResponse, above)
  // actually carries synonym/antonym data for every word — dictionaryapi.dev
  // frequently returns an empty synonyms/antonyms array for perfectly
  // ordinary words ("process", "nuisance"), and the definition endpoint
  // never had that data to begin with. Wiktionary's own article DOES
  // usually have a "===Synonyms===" / "===Antonyms===" section though —
  // it just lives in the page's raw wikitext, not the REST API's
  // structured JSON. This fetches that wikitext (via the same MediaWiki
  // Action API already used for search) so it can be scraped as a
  // last-resort fill-in, used only when the primary result is missing
  // synonyms or antonyms entirely (see fetchOnlineDefinition's
  // enrichSynAnt step).
  function buildWiktionaryWikitextUrl(word) {
    var params = [
      "action=parse",
      "page=" + encodeURIComponent(word),
      "prop=wikitext",
      "format=json",
      "formatversion=2",
      "redirects=1",
      "origin=*"
    ];
    return WIKTIONARY_SEARCH_API + "?" + params.join("&");
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

  // The Wiktionary SEARCH fallback (searchWiktionaryThenFetch, below) has
  // no relevance guarantee at all — it's a plain text search, and its top
  // hit for an obscure or misspelled query can be a completely unrelated
  // page (this is the same class of bug that let "juggle" resolve to a
  // translation for "magic": a lookup silently returning a confident-
  // looking result for the wrong word). A Sørensen–Dice bigram
  // coefficient over the two strings gives a cheap, dependency-free 0..1
  // similarity score without needing a real Levenshtein implementation —
  // good enough to separate "genuinely the same headword/idiom, just
  // reworded" from "the search engine grabbed something vaguely related
  // and we should not trust it."
  function computeTitleSimilarity(a, b) {
    var sa = String(a || "").toLowerCase().trim();
    var sb = String(b || "").toLowerCase().trim();
    if (!sa || !sb) return 0;
    if (sa === sb) return 1;
    var ba = bigramsOf(sa), bb = bigramsOf(sb);
    if (ba.length === 0 || bb.length === 0) return 0;
    var bbCounts = Object.create(null);
    bb.forEach(function (bg) { bbCounts[bg] = (bbCounts[bg] || 0) + 1; });
    var matches = 0;
    ba.forEach(function (bg) {
      if (bbCounts[bg] > 0) { matches++; bbCounts[bg]--; }
    });
    return (2 * matches) / (ba.length + bb.length);
  }

  function bigramsOf(s) {
    var out = [];
    for (var i = 0; i < s.length - 1; i++) out.push(s.substring(i, i + 2));
    return out;
  }

  // Below this similarity, the search hit is closer to noise than to a
  // genuine match for the query — discarded entirely (treated as "no
  // result from this source") rather than shown as if it were reliable.
  var SEARCH_MATCH_REJECT_THRESHOLD = 0.15;
  // Between the reject threshold and this one, the hit is plausible
  // (many genuine idiom/phrase matches score in this range, since the
  // canonical Wiktionary title is often worded quite differently from
  // the literal query — "It slipped my mind." vs "slip someone's mind")
  // but not confident enough to present as equivalent to an exact-title
  // match. Flagged via verified.heuristicFlags so the UI can show an
  // explicit uncertainty note instead of presenting it as settled fact.
  var SEARCH_MATCH_LOW_CONFIDENCE_THRESHOLD = 0.5;

  // Real, honest source names for the two APIs this module actually
  // calls — never a recognizable dictionary brand (Oxford, Cambridge,
  // Merriam-Webster) this app doesn't use and has no license or data
  // relationship with. This is separate from whether the word is saved
  // to the user's Vocabulary Bank: "online" is where the definition
  // came from, not a verdict on its accuracy.
  var SOURCE_FREE_DICTIONARY_API = "Free Dictionary API";
  var SOURCE_WIKTIONARY = "Wiktionary";

  // Every online-sourced entry (any of the three tiers) carries provenance
  // metadata — mirrors the `verified` field now present on every built-in
  // vocabData entry (see scripts/verification-metadata-schema.md) purely
  // for internal tracking/audit purposes. This is NOT meant to drive a
  // blanket "unverified" warning in the UI for an ordinary successful
  // lookup — `heuristicFlags` only carries an ACTUAL machine-detected
  // confidence concern (e.g. a weak search-tier title match), which is
  // the one case the UI does still call out.
  function buildReviewMeta(heuristicFlags) {
    return {
      status: "needs_review",
      checkedAgainst: null,
      lastAuditedAt: null,
      heuristicFlags: heuristicFlags || []
    };
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
    if (typeof html !== "string") return "";
    // <style>/<script> blocks carry their own TEXT content between the
    // tags (CSS rules, JS source) — stripping just the tags themselves
    // and leaving that inner text behind would leak raw markup like
    // ".mw-parser-output .defdate{font-size:smaller}" straight into a
    // definition, which is exactly what a Wiktionary response's
    // embedded <style> block does. These are removed whole, body and
    // all, before the generic tag-stripping pass below.
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]*>/g, "")
      .trim();
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

  // The Free Dictionary API usually has a top-level `phonetic` string,
  // but that field is sometimes blank while one of the per-source
  // `phonetics[].text` entries still has a value — checked in that
  // order, first non-empty one wins. Returns null (never a fabricated
  // guess) when neither is present, same "only show what's genuinely
  // there" rule every other optional field in this app follows.
  function extractPhonetic(json) {
    if (!Array.isArray(json) || json.length === 0) return null;
    for (var i = 0; i < json.length; i++) {
      var entry = json[i];
      if (entry.phonetic) return entry.phonetic;
      var phonetics = entry.phonetics || [];
      for (var j = 0; j < phonetics.length; j++) {
        if (phonetics[j] && phonetics[j].text) return phonetics[j].text;
      }
    }
    return null;
  }

  // Some Free Dictionary API entries include a word-origin/etymology
  // string; most don't. Returns the first non-empty one found, or null
  // — never fabricated, same "only show what's genuinely there" rule as
  // extractPhonetic above.
  function extractOrigin(json) {
    if (!Array.isArray(json) || json.length === 0) return null;
    for (var i = 0; i < json.length; i++) {
      if (json[i] && json[i].origin) return json[i].origin;
    }
    return null;
  }

  // How many synonyms/antonyms to keep once deduplicated — the app
  // shows these as clickable chips, so this is a display ceiling, not a
  // claim that the source always has this many; words with fewer just
  // show fewer.
  var MAX_SYN_ANT = 10;

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
      phonetic: extractPhonetic(json),
      origin: extractOrigin(json),
      senses: senses.slice(0, MAX_SENSES),
      syn: dedupe(syn).slice(0, MAX_SYN_ANT),
      ant: dedupe(ant).slice(0, MAX_SYN_ANT),
      mistake: null,
      tagalog: null,
      source: "online",
      sourceName: SOURCE_FREE_DICTIONARY_API,
      verified: buildReviewMeta()
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
      source: "online",
      sourceName: SOURCE_WIKTIONARY,
      verified: buildReviewMeta()
    };
  }

  // Multi-word queries (idioms, expressions, phrasal verbs, sentence
  // patterns, useful sentences) are exactly the category the Free
  // Dictionary API is weakest on — it indexes single headwords, not
  // phrases — so for these, Wiktionary is queried and merged in even
  // when the Free Dictionary API already found something, instead of
  // only being tried as a last-resort fallback. Ordinary single-word
  // queries keep the original behavior (Wiktionary tried only when the
  // Free Dictionary API has nothing at all): its own single-word
  // coverage is already strong, so doubling every plain word lookup's
  // network cost isn't worth it.
  function isMultiWordQuery(text) {
    return /\s/.test(String(text || "").trim());
  }

  function definitionKey(use) {
    return String(use || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  // Combines a Free Dictionary API result and a Wiktionary result for
  // the SAME query into one entry, instead of the caller ever having to
  // pick only one. The Free Dictionary API's own senses/synonyms/
  // antonyms/pronunciation always come first and are never displaced —
  // Wiktionary only ADDS senses whose definition text isn't already
  // covered, which is exactly where its idiom/phrase coverage earns its
  // keep. Wiktionary's syn/ant are always empty in this module's own
  // normalizeWiktionaryResponse (its REST endpoint doesn't expose
  // them) — a real synonym/antonym list, when the merged result still
  // has none, is instead filled in later by fetchOnlineDefinition's own
  // wikitext-scraping enrichment step (see extractSynAntFromWikitext),
  // not by this function.
  function mergeLookupResults(fdaResult, wiktResult) {
    if (!fdaResult) return wiktResult;
    if (!wiktResult) return fdaResult;

    var seen = Object.create(null);
    fdaResult.senses.forEach(function (s) { seen[definitionKey(s.use)] = true; });
    var extraSenses = wiktResult.senses.filter(function (s) { return !seen[definitionKey(s.use)]; });
    var addedNewContent = extraSenses.length > 0;

    return {
      w: fdaResult.w,
      phonetic: fdaResult.phonetic,
      origin: fdaResult.origin,
      senses: fdaResult.senses.concat(extraSenses).slice(0, MAX_SENSES),
      syn: fdaResult.syn,
      ant: fdaResult.ant,
      mistake: fdaResult.mistake,
      tagalog: fdaResult.tagalog,
      source: "online",
      sourceName: addedNewContent
        ? (SOURCE_FREE_DICTIONARY_API + " + " + SOURCE_WIKTIONARY)
        : fdaResult.sourceName,
      verified: fdaResult.verified
    };
  }

  // Only a plain word/short-phrase token is trusted as a real synonym or
  // antonym — anything left over from a wikitext template or link the
  // regexes below couldn't fully unwrap (stray braces, "=", digits used
  // as a sense-note marker, etc.) is dropped rather than shown to the
  // user as if it were a real word.
  function isPlausibleSynAntTerm(term) {
    return /^[A-Za-z][A-Za-z' -]{0,39}$/.test(term);
  }

  function cleanSynAntToken(raw) {
    if (!raw) return "";
    var t = String(raw).split("<")[0].replace(/\{\{[^}]*\}\}/g, "").trim();
    return t;
  }

  // Pulls plain terms out of one Synonyms/Antonyms wikitext section body —
  // handles the two shapes Wiktionary entries actually use: template
  // form ({{syn|en|term1|term2}}, {{l|en|term}}) and plain wikilinks
  // ([[term]], [[term|display]], skipping [[Thesaurus:...]] links which
  // point at a thesaurus page rather than being a term themselves).
  function extractTermsFromWikitextBlock(block) {
    var terms = [];
    var templateRe = /\{\{\s*(?:syn|ant|l|link)\s*\|([^}]*)\}\}/gi;
    var m;
    while ((m = templateRe.exec(block))) {
      var parts = m[1].split("|");
      // parts[0] is the language code (e.g. "en"); positional terms
      // follow. Named parameters (q1=, t1=, alt1=, ...) are qualifiers/
      // annotations, not terms, and are skipped.
      for (var i = 1; i < parts.length; i++) {
        if (/^[A-Za-z0-9_]+\s*=/.test(parts[i])) continue;
        var term = cleanSynAntToken(parts[i]);
        if (term && isPlausibleSynAntTerm(term)) terms.push(term);
      }
    }
    var linkRe = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
    while ((m = linkRe.exec(block))) {
      var target = m[1].split("#")[0]; // drop any #section anchor
      if (/^Thesaurus:/i.test(target)) continue;
      var linkTerm = cleanSynAntToken(target);
      if (linkTerm && isPlausibleSynAntTerm(linkTerm)) terms.push(linkTerm);
    }
    return terms;
  }

  // Collects every "===Synonyms===" (or "====Synonyms====", nested under
  // a specific part-of-speech heading) section's terms — a word can have
  // more than one such section, one per sense/part of speech.
  function extractTermsForWikitextHeading(section, headingName) {
    // No "m" flag — with it, "$" in the lookahead would mean "end of any
    // line" rather than "end of the whole string", cutting the capture
    // off after the very first line every time. "(?:^|\n)" does the
    // "start of a line" job "^" would otherwise need "m" for.
    var re = new RegExp(
      "(?:^|\\n)={3,4}\\s*" + headingName + "\\s*={3,4}[ \\t]*\\n([\\s\\S]*?)(?=\\n={2,4}[^=]|$)",
      "g"
    );
    var terms = [];
    var match;
    while ((match = re.exec(section))) {
      terms = terms.concat(extractTermsFromWikitextBlock(match[1]));
    }
    return terms;
  }

  // The English-language section only — a page's wikitext covers every
  // language sharing that spelling (French, German, ...), and their
  // Synonyms sections are in a different language entirely.
  function extractSynAntFromWikitext(wikitext) {
    if (typeof wikitext !== "string" || !wikitext) return { syn: [], ant: [] };
    var englishMatch = wikitext.match(/(?:^|\n)==\s*English\s*==\s*\n([\s\S]*?)(?=\n==[^=]|$)/);
    // No "==English==" heading at all means there's nothing safe to
    // scan — falling back to the whole page risks pulling in another
    // language's Synonyms section for a word that also exists there.
    if (!englishMatch) return { syn: [], ant: [] };
    var section = englishMatch[1];
    return {
      syn: extractTermsForWikitextHeading(section, "Synonyms"),
      ant: extractTermsForWikitextHeading(section, "Antonyms")
    };
  }

  function withWiktionaryAttribution(sourceName) {
    if (!sourceName) return SOURCE_WIKTIONARY;
    if (sourceName.indexOf(SOURCE_WIKTIONARY) !== -1) return sourceName;
    return sourceName + " + " + SOURCE_WIKTIONARY;
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
          var similarity = computeTitleSimilarity(title, queryText);
          if (similarity < SEARCH_MATCH_REJECT_THRESHOLD) return null; // too unrelated to trust at all
          return fetchAndNormalize(buildWiktionaryUrl(title), normalizeWiktionaryResponse)
            .then(function (result) {
              if (result && similarity < SEARCH_MATCH_LOW_CONFIDENCE_THRESHOLD) {
                result.verified = buildReviewMeta(["low_confidence_title_match"]);
                result.matchConfidence = "low";
              }
              return result;
            });
        })
        .catch(function () { return null; });
    }

    return fetchAndNormalize(buildRequestUrl(queryText), normalizeDictionaryResponse)
      .then(function (fdaResult) {
        // A single-word query the Free Dictionary API already answered
        // is left exactly as is — no second network call. A multi-word
        // query (idiom/phrase/expression territory) is worth checking
        // Wiktionary for too, EVEN when the Free Dictionary API already
        // succeeded, so any additional senses it has get merged in
        // rather than silently discarded; a query the Free Dictionary
        // API had nothing for always tries Wiktionary next regardless
        // of word count, same as before.
        if (fdaResult && !isMultiWordQuery(queryText)) return fdaResult;
        return fetchAndNormalize(buildWiktionaryUrl(queryText), normalizeWiktionaryResponse)
          .then(function (wiktResult) {
            return fdaResult ? mergeLookupResults(fdaResult, wiktResult) : wiktResult;
          });
      })
      .then(function (result) {
        if (result) return result;
        return searchWiktionaryThenFetch();
      })
      .then(function (result) {
        if (!result) return result;
        var missingSyn = !result.syn || result.syn.length === 0;
        var missingAnt = !result.ant || result.ant.length === 0;
        if (!missingSyn && !missingAnt) return result;
        return fetchImpl(buildWiktionaryWikitextUrl(result.w || queryText), { signal: opts.signal })
          .then(function (res) { return res && res.ok ? res.json() : null; })
          .then(function (json) {
            var wikitext = json && json.parse && json.parse.wikitext;
            if (!wikitext) return result;
            var extracted = extractSynAntFromWikitext(wikitext);
            if (missingSyn && extracted.syn.length) {
              result.syn = dedupe(extracted.syn).slice(0, MAX_SYN_ANT);
              result.sourceName = withWiktionaryAttribution(result.sourceName);
            }
            if (missingAnt && extracted.ant.length) {
              result.ant = dedupe(extracted.ant).slice(0, MAX_SYN_ANT);
              result.sourceName = withWiktionaryAttribution(result.sourceName);
            }
            return result;
          })
          .catch(function () { return result; });
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
    buildWiktionaryWikitextUrl: buildWiktionaryWikitextUrl,
    extractWiktionarySearchTitle: extractWiktionarySearchTitle,
    extractSynAntFromWikitext: extractSynAntFromWikitext,
    extractPhonetic: extractPhonetic,
    extractOrigin: extractOrigin,
    MAX_SYN_ANT: MAX_SYN_ANT,
    normalizeQueryText: normalizeQueryText,
    normalizeDictionaryResponse: normalizeDictionaryResponse,
    normalizeWiktionaryResponse: normalizeWiktionaryResponse,
    generateFallbackExample: generateFallbackExample,
    createMemoryCache: createMemoryCache,
    fetchOnlineDefinition: fetchOnlineDefinition,
    isMultiWordQuery: isMultiWordQuery,
    mergeLookupResults: mergeLookupResults,
    computeTitleSimilarity: computeTitleSimilarity,
    SEARCH_MATCH_REJECT_THRESHOLD: SEARCH_MATCH_REJECT_THRESHOLD,
    SEARCH_MATCH_LOW_CONFIDENCE_THRESHOLD: SEARCH_MATCH_LOW_CONFIDENCE_THRESHOLD,
    SOURCE_FREE_DICTIONARY_API: SOURCE_FREE_DICTIONARY_API,
    SOURCE_WIKTIONARY: SOURCE_WIKTIONARY
  };
});
