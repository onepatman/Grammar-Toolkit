/* =========================================================
   Fuzzy "did you mean" suggestions for the global search box.

   Loaded as a plain browser <script> (attaches window.FuzzySearch)
   and as a CommonJS module for tests (module.exports). No build step,
   no bundler — this file must stay valid as both.

   Used when the exact/substring search comes back empty: finds the
   closest local labels by edit distance, so a misspelling like
   "recieve" still surfaces "receive" instead of an immediate "No
   matches". Purely local/offline — no network involved.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.FuzzySearch = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  // Standard Levenshtein edit distance (insert/delete/substitute), O(n*m).
  // Words here are short (a few characters to a couple of words), so the
  // full DP table is cheap.
  function levenshteinDistance(a, b) {
    a = a || "";
    b = b || "";
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    var prevRow = [];
    for (var j = 0; j <= b.length; j++) prevRow[j] = j;

    for (var i = 1; i <= a.length; i++) {
      var currRow = [i];
      for (var k = 1; k <= b.length; k++) {
        var cost = a[i - 1] === b[k - 1] ? 0 : 1;
        currRow[k] = Math.min(
          prevRow[k] + 1,       // deletion
          currRow[k - 1] + 1,   // insertion
          prevRow[k - 1] + cost // substitution
        );
      }
      prevRow = currRow;
    }
    return prevRow[b.length];
  }

  // How many edits we'll tolerate before a candidate stops looking like
  // "the same word, misspelled" — scales gently with word length so short
  // words (where a 2-edit distance is basically a different word) stay
  // strict, and longer words get a little more slack.
  function defaultMaxDistance(queryLength) {
    return Math.max(1, Math.min(3, Math.ceil(queryLength * 0.34)));
  }

  // items: any array; getLabel(item) -> string to compare against `query`.
  // Multi-word labels ("listen to") are matched word-by-word too, so a
  // typo in one word of a phrase still surfaces it.
  function findClosestMatches(query, items, options) {
    var opts = options || {};
    var q = (query || "").trim().toLowerCase();
    if (!q || !Array.isArray(items) || items.length === 0) return [];

    var getLabel = opts.getLabel || function (item) { return String(item); };
    var limit = opts.limit || 5;
    var maxDistance = opts.maxDistance != null ? opts.maxDistance : defaultMaxDistance(q.length);

    var scored = [];
    items.forEach(function (item) {
      var label = String(getLabel(item) || "").toLowerCase();
      if (!label || label === q) return; // exact matches belong to the normal search path, not "did you mean"

      var best = levenshteinDistance(q, label);
      if (label.indexOf(" ") !== -1) {
        label.split(/\s+/).forEach(function (part) {
          var d = levenshteinDistance(q, part);
          if (d < best) best = d;
        });
      }

      if (best <= maxDistance) {
        scored.push({ item: item, distance: best });
      }
    });

    scored.sort(function (x, y) { return x.distance - y.distance; });
    return scored.slice(0, limit).map(function (s) { return s.item; });
  }

  return {
    levenshteinDistance: levenshteinDistance,
    findClosestMatches: findClosestMatches
  };
});
