/* =========================================================
   Grammar Check — English writing feedback for the Journal tab.
   Calls LanguageTool's free public REST API (no API key needed) to
   find grammar/spelling issues in a block of text, normalizing its
   response into the {wrong, right, why} shape the Journal tab
   renders directly under a saved entry — the same wrong/right pair
   shape js/correction-log.js already uses for the Fixes tab, so a
   Journal correction can be filed into that same personal log
   unchanged (see addJournalCorrectionsToFixes in index.html).

   Loaded as a plain browser <script> (attaches window.GrammarCheck)
   and as a CommonJS module for tests (module.exports). No build
   step, no bundler — this file must stay valid as both.

   Design notes (same "never breaks the caller" contract as
   js/online-lookup.js):
   - checkText() always resolves, never rejects — offline, a network
     failure, an API error response, or an aborted request all just
     resolve to {ok:false, reason}, so callers never need a catch.
   - opts.fetchImpl / opts.signal / opts.isOnline are injectable for
     testability, the same seam fetchOnlineDefinition uses.
   - The 0-10 "clarity score" is a simple, transparent error-density
     heuristic (see scoreFromDensity) — a rough practice-progress
     signal, not a claim of linguistic accuracy.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.GrammarCheck = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  var API_URL = "https://api.languagetool.org/v2/check";

  function countWords(text) {
    var trimmed = String(text || "").trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  // Errors-per-word density penalizes short, error-dense text more
  // than long text with the same absolute error count — matches how
  // a human reader would judge "one typo in one sentence" very
  // differently from "one typo across five paragraphs".
  function scoreFromDensity(wordCount, errorCount) {
    if (wordCount === 0) return 10;
    var density = errorCount / wordCount;
    var raw = 10 - density * 30;
    return Math.max(0, Math.round(Math.min(10, raw) * 10) / 10);
  }

  function gradeLabel(score) {
    if (score >= 9) return { label: "Excellent", tier: "excellent" };
    if (score >= 7) return { label: "Good", tier: "good" };
    if (score >= 5) return { label: "Fair — keep practicing", tier: "fair" };
    return { label: "Needs practice", tier: "needs-practice" };
  }

  function normalizeResponse(json, originalText) {
    var matches = (json && Array.isArray(json.matches)) ? json.matches : [];
    var corrections = matches.map(function (m) {
      var wrong = (typeof m.offset === "number" && typeof m.length === "number")
        ? originalText.substr(m.offset, m.length)
        : "";
      var replacement = (m.replacements && m.replacements[0] && m.replacements[0].value) || "";
      var why = m.message || (m.rule && m.rule.description) || "This may be a grammar or spelling issue.";
      return { wrong: wrong, right: replacement, why: why };
    }).filter(function (c) { return c.wrong; });

    var wordCount = countWords(originalText);
    var score = scoreFromDensity(wordCount, corrections.length);
    return {
      ok: true,
      corrections: corrections,
      score: score,
      grade: gradeLabel(score),
      wordCount: wordCount,
      errorCount: corrections.length
    };
  }

  // Resolves to one of:
  //   {ok:true, corrections, score, grade, wordCount, errorCount}
  //   {ok:false, reason: "empty" | "offline" | "no-fetch" | "http-error" | "network-error"}
  function checkText(text, options) {
    var opts = options || {};
    var trimmed = String(text || "").trim();
    if (!trimmed) return Promise.resolve({ ok: false, reason: "empty" });

    var isOnline = typeof opts.isOnline === "boolean"
      ? opts.isOnline
      : (typeof navigator === "undefined" || navigator.onLine !== false);
    if (!isOnline) return Promise.resolve({ ok: false, reason: "offline" });

    var fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!fetchImpl) return Promise.resolve({ ok: false, reason: "no-fetch" });

    var body = "text=" + encodeURIComponent(trimmed) + "&language=" + encodeURIComponent(opts.language || "en-US");

    return fetchImpl(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
      signal: opts.signal
    }).then(function (res) {
      if (!res || !res.ok) return null;
      return res.json();
    }).then(function (json) {
      return json ? normalizeResponse(json, trimmed) : { ok: false, reason: "http-error" };
    }).catch(function () {
      return { ok: false, reason: "network-error" };
    });
  }

  return {
    API_URL: API_URL,
    countWords: countWords,
    scoreFromDensity: scoreFromDensity,
    gradeLabel: gradeLabel,
    normalizeResponse: normalizeResponse,
    checkText: checkText
  };
});
