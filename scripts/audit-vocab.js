// Heuristic, fully-automated first pass over vocabData (see
// extract-vocab-data.js) for the 4 checks requested in the dictionary
// accuracy audit:
//   a. definition accuracy   — structural red flags only (true semantic
//      accuracy against Merriam-Webster/Oxford needs a human/LLM judgment
//      pass — this script narrows down candidates, it doesn't replace it)
//   b. definition-example mismatch — flags a sense whose examples contain
//      no recognizable form of the headword at all (a strong, if weak-
//      recall, mismatch signal; doesn't catch a *different sense* of the
//      same word used correctly grammatically but wrongly semantically —
//      that needs the deep pass too)
//   c. generic/filler examples — matches the exact machine-template
//      patterns this app's own online-lookup fallback generator uses
//      (js/online-lookup.js FALLBACK_EXAMPLE_TEMPLATES) plus a few other
//      generic-sentence shapes
//   d. translation red flags — missing, English-identical, or otherwise
//      structurally suspicious tagalog fields (NOT semantic correctness —
//      "Salamangka" for "juggle" is real Filipino text, not empty or
//      English, so only a semantic/human pass catches that class of error)
//
// This script never modifies vocabData — it only reads and reports. See
// scripts/README.md for how its output feeds the deep review pass.
const fs = require("fs");
const path = require("path");
const { extractVocabData } = require("./extract-vocab-data.js");

// Built directly from js/online-lookup.js's own FALLBACK_EXAMPLE_TEMPLATES
// (the machine-generated filler examples used when an online lookup has
// no real example sentence) — the single source of truth, so this list
// can't silently drift out of sync with the actual generator. Each
// {word} slot is anchored to a SINGLE token (no internal whitespace),
// matching how the generator actually substitutes the headword — a
// looser wildcard here (e.g. allowing multiple words) would false-
// positive on real hand-authored sentences that merely happen to share
// the template's surrounding wording, like "The system responded to the
// rapid pressure change." (a genuine, unrelated sentence, not the
// filler template "The system responded {word}.").
const RAW_FILLER_TEMPLATES = [
  "The team discussed the {word} during the meeting.",
  "Understanding {word} is useful in this context.",
  "The report included a section on {word}.",
  "They decided to {word} it before the deadline.",
  "It's important to {word} carefully in this situation.",
  "The team plans to {word} the new system next week.",
  "The results were considered {word}.",
  "Everyone agreed the plan was {word}.",
  "It turned out to be a {word} approach.",
  "She completed the task {word}.",
  "He explained the process {word}.",
  "The system responded {word}.",
  'Here is an example sentence using "{word}."',
  '"{word}" is a word commonly used in everyday English.'
];

function buildFillerRegex(template) {
  const WORD_SLOT = "(?:<b>)?[a-zA-Z][a-zA-Z'-]{0,25}?(?:</b>)?"; // single token, optionally <b>-wrapped like the real generator output
  const parts = template.split("{word}").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp("^\\s*" + parts.join(WORD_SLOT) + "\\s*$", "i");
}

const FILLER_EXAMPLE_PATTERNS = RAW_FILLER_TEMPLATES.map(buildFillerRegex);

const VAGUE_DEFINITION_PATTERNS = [
  /^(a|an|the)?\s*thing$/i,
  /^something (related to|about|to do with)/i,
  /^used (for|to describe) (stuff|things)$/i,
  /^a type of (thing|something)$/i
];

// Common irregular verbs actually likely to appear in this data — the
// suffix-based generator below only knows regular inflection rules, so
// without this table "become"/"became", "buy"/"bought", "choose"/"chose"
// etc. all look like false mismatches even though the example is using
// the headword correctly. Not exhaustive by design (see the prefix
// fallback in headwordFormCandidates for anything missed here).
const IRREGULAR_VERBS = {
  arise: ["arose", "arisen"], be: ["was", "were", "been", "am", "is", "are"],
  become: ["became", "become"], begin: ["began", "begun"],
  bind: ["bound"], bite: ["bit", "bitten"], bleed: ["bled"],
  blow: ["blew", "blown"], break: ["broke", "broken"], breed: ["bred"],
  bring: ["brought"], build: ["built"], burst: ["burst"],
  buy: ["bought"], catch: ["caught"], choose: ["chose", "chosen"],
  cling: ["clung"], come: ["came"], cost: ["cost"], creep: ["crept"],
  cut: ["cut"], deal: ["dealt"], dig: ["dug"], do: ["did", "does", "done"],
  draw: ["drew", "drawn"], dream: ["dreamt", "dreamed"], drink: ["drank", "drunk"],
  drive: ["drove", "driven"], eat: ["ate", "eaten"], fall: ["fell", "fallen"],
  feed: ["fed"], feel: ["felt"], fight: ["fought"], find: ["found"],
  flee: ["fled"], fly: ["flew", "flown"], forbid: ["forbade", "forbidden"],
  forget: ["forgot", "forgotten"], forgive: ["forgave", "forgiven"],
  freeze: ["froze", "frozen"], get: ["got", "gotten"], give: ["gave", "given"],
  go: ["went", "gone", "goes"], grow: ["grew", "grown"], hang: ["hung"],
  have: ["had", "has"], hear: ["heard"], hide: ["hid", "hidden"],
  hit: ["hit"], hold: ["held"], keep: ["kept"], know: ["knew", "known"],
  lay: ["laid"], lead: ["led"], leave: ["left"], lend: ["lent"],
  let: ["let"], lie: ["lay", "lain"], lose: ["lost"], make: ["made"],
  mean: ["meant"], meet: ["met"], pay: ["paid"], put: ["put"],
  read: ["read"], ride: ["rode", "ridden"], ring: ["rang", "rung"],
  rise: ["rose", "risen"], run: ["ran"], say: ["said"], see: ["saw", "seen"],
  seek: ["sought"], sell: ["sold"], send: ["sent"], set: ["set"],
  shake: ["shook", "shaken"], shine: ["shone"], shoot: ["shot"],
  show: ["showed", "shown"], shrink: ["shrank", "shrunk"], shut: ["shut"],
  sing: ["sang", "sung"], sink: ["sank", "sunk"], sit: ["sat"],
  sleep: ["slept"], slide: ["slid"], speak: ["spoke", "spoken"],
  spend: ["spent"], spin: ["spun"], split: ["split"], spread: ["spread"],
  spring: ["sprang", "sprung"], stand: ["stood"], steal: ["stole", "stolen"],
  stick: ["stuck"], sting: ["stung"], strike: ["struck"],
  swear: ["swore", "sworn"], sweep: ["swept"], swim: ["swam", "swum"],
  swing: ["swung"], take: ["took", "taken"], teach: ["taught"],
  tear: ["tore", "torn"], tell: ["told"], think: ["thought"],
  throw: ["threw", "thrown"], understand: ["understood"], wake: ["woke", "woken"],
  wear: ["wore", "worn"], win: ["won"], withdraw: ["withdrew", "withdrawn"],
  write: ["wrote", "written"]
};

// Very small set of function words filtered out before comparing an
// example sentence's words against the headword's own letters — keeps
// the "does this example even contain the headword" check from being
// thrown off by capitalization/punctuation only.
function normalizeToken(s) {
  return String(s || "").toLowerCase().replace(/[^a-z]/g, "");
}

// Cheap, deliberately permissive inflection generator — over-generates
// candidate forms rather than under-generating, since this check is a
// recall-oriented red flag (few false negatives), not a precision tool.
function headwordFormCandidates(headword) {
  const base = normalizeToken(headword.split(" ")[0]); // first word of a phrasal verb, e.g. "zoom" from "zoom out"
  if (!base) return [];
  const forms = new Set([base]);
  forms.add(base + "s");
  forms.add(base + "es");
  forms.add(base + "ing");
  forms.add(base + "ed");
  forms.add(base + "d");
  forms.add(base + "er");
  forms.add(base + "or");
  if (base.endsWith("e")) {
    forms.add(base.slice(0, -1) + "ing");
    forms.add(base.slice(0, -1) + "er");
  }
  if (/[^aeiou]y$/.test(base)) {
    // consonant + y -> ied/ies (e.g. "deny" -> "denied"/"denies", "try" -> "tried"/"tries")
    const stem = base.slice(0, -1);
    forms.add(stem + "ied");
    forms.add(stem + "ies");
  }
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(base)) {
    // consonant-vowel-consonant -> doubled final consonant (e.g. "run" -> "running")
    const doubled = base + base[base.length - 1];
    forms.add(doubled + "ing");
    forms.add(doubled + "ed");
  }
  if (IRREGULAR_VERBS[base]) {
    IRREGULAR_VERBS[base].forEach((form) => forms.add(form));
  }
  return Array.from(forms);
}

// Prefix length below which a shared prefix is too short to mean
// anything (e.g. "to"/"top" sharing "to" isn't evidence of a match) —
// only used as a last-resort fallback for derived forms the suffix
// rules and the irregular-verb table above both miss (comparatives,
// nominalizations, an irregular verb not in the table, etc.).
const MIN_FUZZY_PREFIX_LEN = 4;

function exampleContainsHeadword(example, headword) {
  const tokens = String(example || "")
    .toLowerCase()
    .split(/[^a-z]+/i)
    .filter(Boolean);
  const candidates = headwordFormCandidates(headword);
  if (tokens.some((t) => candidates.includes(t))) return true;

  const base = normalizeToken(headword.split(" ")[0]);
  if (base.length < MIN_FUZZY_PREFIX_LEN) return false;
  const prefix = base.slice(0, MIN_FUZZY_PREFIX_LEN);
  return tokens.some((t) => t.length >= MIN_FUZZY_PREFIX_LEN && t.startsWith(prefix));
}

function isFillerExample(example) {
  return FILLER_EXAMPLE_PATTERNS.some((re) => re.test(example));
}

// Genuinely vague/empty — the pattern list below, or nothing there at
// all. Distinct from isTerseGloss() below: an empty/pattern-matched
// definition conveys no real meaning, whereas a terse gloss ("To
// cancel.") is accurate, just thinner than a standard dictionary's
// fuller wording — conflating the two would misreport correct entries
// as wrong.
function isVagueDefinition(def) {
  const trimmed = String(def || "").trim();
  if (!trimmed) return true;
  return VAGUE_DEFINITION_PATTERNS.some((re) => re.test(trimmed));
}

// A single-word (or two-word) gloss like "To cancel." or "Beside
// something." — likely accurate, but thinner than a standard
// dictionary's fuller definition style (e.g. Merriam-Webster's "call
// off" is "to cause to be cancelled," not just "cancel"). Flagged
// separately, at lower severity, as a candidate for optional expansion
// rather than a correctness problem.
function isTerseGloss(def) {
  const trimmed = String(def || "").trim();
  if (!trimmed) return false;
  return trimmed.split(/\s+/).length < 3;
}

// English-stopword-heavy check: if the "Filipino" text is mostly common
// English function words, it's very likely an untranslated echo rather
// than genuine Tagalog. Deliberately conservative (short allow-list) so
// it doesn't false-positive on real Tagalog words that happen to be short.
const ENGLISH_STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "is", "are",
  "not", "no", "yes", "this", "that", "with", "by", "at", "as", "be", "it"
]);

function looksUntranslated(tagalog, headword) {
  if (!tagalog) return true;
  const norm = normalizeToken(tagalog);
  const headNorm = normalizeToken(headword.split(" ")[0]);
  if (norm === headNorm) return true; // identical to the English headword
  const words = String(tagalog).toLowerCase().split(/[\/,;]/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return true;
  const englishish = words.filter((w) => {
    const tokens = w.split(/\s+/);
    return tokens.every((t) => ENGLISH_STOPWORDS.has(normalizeToken(t)));
  });
  return englishish.length === words.length;
}

// A definition like "To shut something, or to be near in distance."
// bundles two genuinely distinct senses (verb + adjective, here) into
// one `use` string instead of splitting them into separate senses —
// found by manual review, not by any single-entry structural check
// (spot-checking a sample of entries that passed every OTHER heuristic
// still turned this pattern up in ~1 of every 4 checked). Comma-before-
// "or" is the actual clause boundary that distinguishes this from a
// same-sense near-synonym pair like "To lead or direct someone" (still
// one sense, two verbs). Fewer than 2 examples is a strong sign the
// second bundled sense has no demonstration at all — with 2+ examples
// it's plausible (not certain) each sense got its own.
function hasUnderdemonstratedBundledSense(sense) {
  return /,\s*or\b/i.test(sense.use || "") && (sense.examples || []).length < 2;
}

// Flags an example that may actually be demonstrating a DIFFERENT,
// more specific multi-word headword that already exists elsewhere in
// this same dictionary (e.g. "move" being defined with an example that
// really shows "move on", a separately-listed phrasal verb with its own
// distinct idiomatic meaning) rather than the plain headword itself.
// Deliberately lower-confidence than the other checks: many verbs
// grammatically require a specific preposition every time they're used
// ("comply" almost always takes "with", "participate" almost always
// takes "in") — that's normal usage, not a different sense, so this
// check's hits still need a human/semantic look rather than being
// treated as confirmed errors.
function findHeadwordCollision(example, headword, multiWordHeadwords) {
  const base = normalizeToken(headword);
  if (headword.includes(" ") || !base) return null; // only meaningful for single-word headwords
  const tokens = example.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] !== base) continue;
    const twoWord = tokens[i] + " " + tokens[i + 1];
    if (multiWordHeadwords.has(twoWord) && twoWord !== base) return twoWord;
  }
  return null;
}

function auditEntry(entry, context) {
  const flags = [];
  const multiWordHeadwords = (context && context.multiWordHeadwords) || new Set();

  (entry.senses || []).forEach((sense, senseIdx) => {
    if (isVagueDefinition(sense.use)) {
      flags.push({
        type: "vague_definition",
        detail: `Sense ${senseIdx + 1}: "${sense.use}"`
      });
    } else if (isTerseGloss(sense.use)) {
      flags.push({
        type: "terse_single_word_gloss",
        detail: `Sense ${senseIdx + 1}: "${sense.use}"`
      });
    }

    if (hasUnderdemonstratedBundledSense(sense)) {
      flags.push({
        type: "bundled_sense_underdemonstrated",
        detail: `Sense ${senseIdx + 1} defines what look like two senses ("${sense.use}") but has only ${sense.examples.length} example(s) — the second sense may have no example, and the tagalog field may only cover one of the two`
      });
    }

    const examples = sense.examples || [];
    if (examples.length === 0) {
      flags.push({ type: "no_example", detail: `Sense ${senseIdx + 1} has no example sentence` });
    }

    examples.forEach((ex, exIdx) => {
      if (isFillerExample(ex)) {
        flags.push({
          type: "filler_example",
          detail: `Sense ${senseIdx + 1}, example ${exIdx + 1}: "${ex}"`
        });
      }
      if (!exampleContainsHeadword(ex, entry.w)) {
        flags.push({
          type: "example_may_not_match_headword",
          detail: `Sense ${senseIdx + 1}, example ${exIdx + 1} contains no recognizable form of "${entry.w}": "${ex}"`
        });
      }
      const collision = findHeadwordCollision(ex, entry.w, multiWordHeadwords);
      if (collision) {
        flags.push({
          type: "example_may_demonstrate_different_headword",
          detail: `Sense ${senseIdx + 1}, example ${exIdx + 1} contains "${collision}", which is ALSO a separate headword in this dictionary — needs a human check for whether this example is really demonstrating "${entry.w}" or "${collision}": "${ex}"`
        });
      }
    });
  });

  if (looksUntranslated(entry.tagalog, entry.w)) {
    flags.push({
      type: "translation_missing_or_untranslated",
      detail: `tagalog field: ${JSON.stringify(entry.tagalog)}`
    });
  }

  // Structural-only note: this heuristic layer CANNOT detect a real-word
  // mistranslation like "juggle" -> "Salamangka" ("magic"), since
  // "Salamangka" is genuine, non-empty Filipino text, not an English
  // echo or a blank field. Every entry that passes the structural checks
  // still needs the semantic/deep-review pass before being marked
  // "verified" — see the `source` field this script assigns below.

  return flags;
}

function auditAll() {
  const data = extractVocabData();
  const multiWordHeadwords = new Set(data.map((e) => e.w.toLowerCase()).filter((w) => w.includes(" ")));
  const context = { multiWordHeadwords };
  const results = data.map((entry, index) => {
    const flags = auditEntry(entry, context);
    return {
      index,
      w: entry.w,
      flagCount: flags.length,
      flags,
      // Heuristic-only status. "flagged" means the automated layer found
      // a structural issue worth a human/LLM look; "needs_semantic_review"
      // means it PASSED every automated check but has NOT been verified
      // against a standard dictionary yet (the vast majority of entries
      // land here on this first pass, by design — see the deep-review
      // task for narrowing this down further).
      source: flags.length > 0 ? "flagged_by_heuristic_audit" : "needs_semantic_review"
    };
  });

  const byType = {};
  results.forEach((r) => {
    r.flags.forEach((f) => {
      byType[f.type] = (byType[f.type] || 0) + 1;
    });
  });

  const flaggedEntries = results.filter((r) => r.flagCount > 0);

  return { totalEntries: results.length, flaggedCount: flaggedEntries.length, byType, results };
}

function main() {
  const report = auditAll();
  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "heuristic-audit-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Audited ${report.totalEntries} entries.`);
  console.log(`${report.flaggedCount} flagged by at least one heuristic check.`);
  console.log("\nFlags by type:");
  Object.entries(report.byType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => console.log(`  ${type}: ${count}`));
  console.log(`\nFull report written to ${reportPath}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  auditAll, auditEntry, isFillerExample, isVagueDefinition, isTerseGloss,
  looksUntranslated, exampleContainsHeadword, hasUnderdemonstratedBundledSense,
  findHeadwordCollision
};
