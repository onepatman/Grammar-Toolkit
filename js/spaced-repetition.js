/* =========================================================
   Spaced-repetition scheduling for the Favorites "Study mode" —
   a small Leitner-style algorithm: each favorited word sits at a
   level from 0 (just missed / brand new) to MAX_LEVEL (well known),
   and the interval before it's due again grows with the level.

   Loaded as a plain browser <script> (attaches window.SpacedRepetition)
   and as a CommonJS module for tests (module.exports). No build step,
   no bundler — this file must stay valid as both.

   Pure and DOM-free by design — index.html owns building the study
   queue and rendering cards; this module only owns the scheduling
   math, so it's trivial to unit test and impossible for a rendering
   bug to corrupt.
========================================================= */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.SpacedRepetition = mod;
  }
})(typeof window !== "undefined" ? window : this, function () {

  var DAY_MS = 24 * 60 * 60 * 1000;
  // Days until the next review, indexed by level. A missed card always
  // drops back to level 0 (due again tomorrow) rather than immediately,
  // so a single study session doesn't loop the same card forever.
  var INTERVAL_DAYS = [1, 2, 4, 7, 14, 30];
  var MAX_LEVEL = INTERVAL_DAYS.length - 1;

  // Computes the next schedule state after reviewing a card.
  // `current` is the existing {level, dueAt, lastReviewedAt} record, or
  // null/undefined for a card that's never been reviewed before (starts
  // at level 0). `outcome` is "again" (missed it) or "good" (knew it).
  function nextReviewState(current, outcome, now) {
    if (outcome !== "again" && outcome !== "good") {
      throw new Error('outcome must be "again" or "good"');
    }
    var at = typeof now === "number" ? now : Date.now();
    var level = current && typeof current.level === "number" ? current.level : 0;
    var newLevel = outcome === "again" ? 0 : Math.min(level + 1, MAX_LEVEL);
    return {
      level: newLevel,
      dueAt: at + INTERVAL_DAYS[newLevel] * DAY_MS,
      lastReviewedAt: at
    };
  }

  // A card with no schedule yet (never reviewed) is always due. Once
  // reviewed, it's due again once its interval has elapsed.
  function isDue(schedule, now) {
    var at = typeof now === "number" ? now : Date.now();
    if (!schedule) return true;
    return schedule.dueAt <= at;
  }

  return {
    DAY_MS: DAY_MS,
    INTERVAL_DAYS: INTERVAL_DAYS,
    MAX_LEVEL: MAX_LEVEL,
    nextReviewState: nextReviewState,
    isDue: isDue
  };
});
