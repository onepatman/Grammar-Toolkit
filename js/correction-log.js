/* =========================================================
   Personal correction log — storage + shaping logic.
   Loaded as a plain browser <script> (attaches window.CorrectionLog)
   and as a CommonJS module for tests (module.exports). No build step,
   no bundler — this file must stay valid as both.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.CorrectionLog = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  var CORRECTION_LOG_KEY = "mepf_toolkit_personal_corrections_v1";

  function loadPersonalCorrections(storage) {
    var store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return [];
    try {
      var raw = store.getItem(CORRECTION_LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function savePersonalCorrections(list, storage) {
    var store = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    if (!store) return false;
    try {
      store.setItem(CORRECTION_LOG_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function personalEntryToSense(entry) {
    return {
      use: entry.why || "Personal correction — added by you.",
      examples: ["✗ " + entry.wrong + " → ✓ <b>" + entry.right + "</b>"],
      personal: true,
      id: entry.id
    };
  }

  // Pure: given the fixed built-in senses and whatever's currently saved,
  // produce the full sense list. Kept separate from any DOM/localStorage
  // access so it's trivial to unit test.
  function buildCorrectionSenses(builtinSenses, savedEntries) {
    return builtinSenses.concat((savedEntries || []).map(personalEntryToSense));
  }

  // Buckets saved personal corrections by which Fixes-tab category they
  // were filed under (entry.category — the value of a mistakeData "w"),
  // so each category's own senses can be rebuilt from its OWN saved
  // corrections instead of every personal entry landing in one catch-all
  // log. A saved entry with no category (every entry created before this
  // per-category filing existed) falls back to defaultCategory, which
  // keeps every pre-existing correction showing up exactly where it
  // always did — the general "my correction log" entry.
  function groupCorrectionsByCategory(savedEntries, defaultCategory) {
    var map = {};
    (savedEntries || []).forEach(function (entry) {
      var cat = entry.category || defaultCategory;
      if (!map[cat]) map[cat] = [];
      map[cat].push(entry);
    });
    return map;
  }

  return {
    CORRECTION_LOG_KEY: CORRECTION_LOG_KEY,
    loadPersonalCorrections: loadPersonalCorrections,
    savePersonalCorrections: savePersonalCorrections,
    personalEntryToSense: personalEntryToSense,
    buildCorrectionSenses: buildCorrectionSenses,
    groupCorrectionsByCategory: groupCorrectionsByCategory
  };
});
