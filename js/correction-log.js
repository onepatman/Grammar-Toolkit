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

  return {
    CORRECTION_LOG_KEY: CORRECTION_LOG_KEY,
    loadPersonalCorrections: loadPersonalCorrections,
    savePersonalCorrections: savePersonalCorrections,
    personalEntryToSense: personalEntryToSense,
    buildCorrectionSenses: buildCorrectionSenses
  };
});
