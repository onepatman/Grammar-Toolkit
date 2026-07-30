/* =========================================================
   DuplicateChecker — Phase 1 architecture-plan service (see
   js/lookup-service.js's header comment for the two-phase project this
   is part of). Formalizes the case/whitespace-insensitive matching
   rule this app already enforced consistently (normalizeWordKey /
   normalizeForDuplicateCheck in index.html) as one named, injectable,
   independently-testable service, so "is this a duplicate?" is answered
   the same way everywhere ("Run"/"run"/"RUN" — and, for the fuzzy
   variant, "Let me know." / "let me know" — are all the same entry) —
   rather than re-deriving the rule per call site.

   This is a pure extraction: the two rules below are byte-for-byte the
   same behavior index.html's own normalizeWordKey()/
   normalizeForDuplicateCheck() already implemented — nothing about how
   "is this a duplicate" is decided changes by introducing this module.

   Loaded as a plain browser <script> (attaches window.DuplicateChecker)
   and as a CommonJS module for tests (module.exports). No build step,
   no bundler — this file must stay valid as both.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.DuplicateChecker = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  // The app-wide canonical key: trim, lowercase, collapse internal
  // whitespace runs. Used for the Master Vocabulary Bank's
  // wordIndexMap/vocabLookup and every category's own data array.
  function normalizeKey(text) {
    return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  // A slightly stricter variant, used only for "is this the same
  // Language Bank / Distinctions / rule-tab entry" checks: on top of
  // normalizeKey(), also drops a trailing run of sentence-ending
  // punctuation (., !, or ?), since a full sentence retyped with or
  // without its closing period is still the same sentence to a user.
  // Deliberately NOT folded into normalizeKey() itself, which is also
  // the key scheme for the app-wide word index — changing that
  // everywhere would risk silently merging unrelated entries elsewhere
  // that happen to share a spelling but differ by trailing punctuation.
  function normalizeForFuzzyMatch(text) {
    return normalizeKey(text).replace(/[.!?]+$/, "");
  }

  // True when two strings are the same entry under the given rule
  // ("key", the default, or "fuzzy" for the sentence-punctuation-
  // tolerant variant).
  function isMatch(a, b, mode) {
    var normalize = mode === "fuzzy" ? normalizeForFuzzyMatch : normalizeKey;
    return normalize(a) === normalize(b);
  }

  // Finds the first item in `items` whose key (via `getKey`) matches
  // `text` under the given rule — the shared shape behind every
  // "isKnownX(word)"/"findExistingX(text)" helper in the app (Vocab,
  // Verbs, Language Bank, Distinctions, the 6 standalone rule tabs).
  // Returns the matching item, or undefined.
  function findByKey(items, getKey, text, mode) {
    var normalize = mode === "fuzzy" ? normalizeForFuzzyMatch : normalizeKey;
    var target = normalize(text);
    if (!items) return undefined;
    for (var i = 0; i < items.length; i++) {
      if (normalize(getKey(items[i])) === target) return items[i];
    }
    return undefined;
  }

  return {
    normalizeKey: normalizeKey,
    normalizeForFuzzyMatch: normalizeForFuzzyMatch,
    isMatch: isMatch,
    findByKey: findByKey
  };
});
