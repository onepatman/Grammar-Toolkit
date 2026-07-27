// Applies the full-corpus dictionary accuracy review's findings directly
// to vocabData in index.html:
//   1. For each of the 114 confirmed corrections, replaces ONLY the
//      specific senses/tagalog fields that were found wrong — every
//      other field on that entry (w, mistake, syn, ant) is untouched.
//   2. Adds a `verified` metadata field to EVERY one of the 795 entries
//      (see scripts/verification-metadata-schema.md), since every entry
//      has now actually been given a real semantic review — either
//      directly, or by one of the 12 parallel review passes.
//
// Inputs (read-only, from the review pass — not committed to the repo,
// regenerate via the audit + review scripts if needed):
//   - <reviewDir>/merged-corrections.json — the 114 approved corrections
//   - <reviewDir>/heuristic-flags-by-word.json — structural flags per word,
//     carried into verified.heuristicFlags for traceability
//
// Writes index.html in place. Run scripts/extract-vocab-data.js
// afterward (or just `node scripts/apply-corrections.js` — it
// self-validates) to confirm the result is still valid, 795-entry JSON.
const fs = require("fs");
const path = require("path");
const { extractVocabData, INDEX_HTML_PATH } = require("./extract-vocab-data.js");

const REVIEW_DIR = process.argv[2] || "/tmp/claude-0/-home-user-Grammar-Toolkit/7c201f69-094e-5fb0-8513-5fcd2e98549b/scratchpad/full-review";
const TODAY = new Date().toISOString().slice(0, 10);

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  const corrections = loadJson(path.join(REVIEW_DIR, "merged-corrections.json"));
  const heuristicFlags = loadJson(path.join(REVIEW_DIR, "heuristic-flags-by-word.json"));
  const correctionsByWord = new Map(corrections.map((c) => [c.w, c]));

  const data = extractVocabData();
  if (data.length !== 795) {
    throw new Error(`Expected 795 entries before applying corrections, found ${data.length}`);
  }

  let correctedCount = 0;
  const updated = data.map((entry) => {
    const correction = correctionsByWord.get(entry.w);
    const flags = heuristicFlags[entry.w] || [];

    const next = {
      w: entry.w,
      senses: entry.senses,
      mistake: entry.mistake,
      syn: entry.syn,
      ant: entry.ant,
      tagalog: entry.tagalog
    };

    if (correction) {
      correctedCount++;
      next.senses = correction.corrected.senses;
      next.tagalog = correction.corrected.tagalog;
    }

    next.verified = {
      status: "semantically_reviewed",
      checkedAgainst: "llm_review",
      lastAuditedAt: TODAY,
      heuristicFlags: flags
    };

    return next;
  });

  if (correctedCount !== corrections.length) {
    throw new Error(`Applied ${correctedCount} corrections but expected ${corrections.length} — a correction's "w" didn't match any entry`);
  }

  const html = fs.readFileSync(INDEX_HTML_PATH, "utf8");
  const startMarker = "const vocabData = [";
  const start = html.indexOf(startMarker);
  const arrayStart = start + startMarker.length - 1;
  // Reuse the same bracket-depth, string-aware scan as extract-vocab-data.js
  // to find the exact matching closing bracket.
  let depth = 0, inString = false, escaped = false, end = -1;
  for (let i = arrayStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("Could not find the matching closing ']' for vocabData");

  const newArrayText = JSON.stringify(updated, null, 2);
  const newHtml = html.slice(0, arrayStart) + newArrayText + html.slice(end + 1);
  fs.writeFileSync(INDEX_HTML_PATH, newHtml);

  console.log(`Applied ${correctedCount} corrections.`);
  console.log(`Added verified metadata to all ${updated.length} entries.`);

  // Self-validate: re-extract and re-parse the file we just wrote.
  const reExtracted = extractVocabData();
  if (reExtracted.length !== 795) {
    throw new Error(`Post-write validation FAILED: re-extracted ${reExtracted.length} entries, expected 795`);
  }
  const missingVerified = reExtracted.filter((e) => !e.verified);
  if (missingVerified.length > 0) {
    throw new Error(`Post-write validation FAILED: ${missingVerified.length} entries missing verified field`);
  }
  console.log("Post-write validation passed: 795 entries, all with verified metadata, valid JSON.");
}

main();
