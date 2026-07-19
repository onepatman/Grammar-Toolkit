/* =========================================================
   Vocabulary suggestion heuristic — pulls candidate "worth learning"
   words out of arbitrary text (a Language Bank or Distinctions entry's
   own definition/example sentences), so the app can suggest expanding
   the Vocabulary Bank without scanning every ordinary word in a
   sentence. Deliberately simple: skip common stopwords/function words,
   skip anything already known, skip short words, cap how many come
   back. This is NOT real NLP — just enough precision to keep
   suggestions useful rather than noisy, per the "quality over
   quantity" priority for this feature. The Owner always has final say;
   this module never saves anything itself, it only proposes.

   Loaded as a plain browser <script> (attaches window.VocabSuggest) and
   as a CommonJS module for tests (module.exports). No build step.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.VocabSuggest = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  // ~150 common English stopwords/function words — articles,
  // pronouns, auxiliary/modal verbs, prepositions, conjunctions — the
  // "grammar glue" that's never worth suggesting as new vocabulary.
  var STOPWORDS = [
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "so", "because", "as", "until", "while",
    "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before",
    "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again",
    "further", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few",
    "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "than", "too", "very",
    "can", "will", "just", "now", "i", "me", "my", "myself", "we", "our", "ours",
    "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she",
    "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
    "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "would", "could", "should",
    "shall", "might", "must", "let", "need", "dare", "ought", "used", "get", "got", "go", "goes", "went",
    "gone", "going", "make", "made", "take", "took", "taken", "come", "came", "one", "two", "three", "also",
    "yet", "still", "much", "many", "every", "either", "neither", "don", "isn", "aren", "wasn", "weren",
    "hasn", "haven", "hadn", "won", "wouldn", "shouldn", "couldn", "didn", "doesn", "basic", "advanced"
  ];
  var STOPWORD_SET = {};
  STOPWORDS.forEach(function (w) { STOPWORD_SET[w] = true; });

  function stripHtml(text) {
    return String(text || "").replace(/<[^>]+>/g, "");
  }

  function tokenize(text) {
    // Deliberately splits ON the apostrophe (not through it) — "don't"
    // becomes "don" + "t", so a contraction's stem still matches its
    // stopword entry ("don") instead of the whole contraction slipping
    // past the stopword list as one unmatched token.
    var cleaned = stripHtml(text).toLowerCase();
    return cleaned.match(/[a-z]+/g) || [];
  }

  // `isKnown(word)` is injected (rather than this module importing
  // wordIndexMap directly) so it stays a pure, independently-testable
  // function with no dependency on index.html's global state.
  function extractVocabCandidates(text, options) {
    var opts = options || {};
    var limit = typeof opts.limit === "number" ? opts.limit : 3;
    var minLength = typeof opts.minLength === "number" ? opts.minLength : 4;
    var isKnown = typeof opts.isKnown === "function" ? opts.isKnown : function () { return false; };

    var seen = {};
    var candidates = [];
    tokenize(text).forEach(function (word) {
      if (candidates.length >= limit) return;
      if (word.length < minLength) return;
      if (STOPWORD_SET[word]) return;
      if (seen[word]) return;
      if (isKnown(word)) return;
      seen[word] = true;
      candidates.push(word);
    });
    return candidates;
  }

  return {
    STOPWORDS: STOPWORDS,
    tokenize: tokenize,
    extractVocabCandidates: extractVocabCandidates
  };
});
