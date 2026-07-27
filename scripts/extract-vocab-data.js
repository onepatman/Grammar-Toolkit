// Extracts the vocabData array literal out of index.html and returns it
// as a plain JS array. vocabData is authored as strict JSON (double-quoted
// keys/strings, no comments, no trailing commas, no JS-only syntax) even
// though it lives inside a <script> tag rather than a .json file, so this
// is a straight JSON.parse() once the "const vocabData = " prefix and the
// trailing ";" are stripped off.
const fs = require("fs");
const path = require("path");

const INDEX_HTML_PATH = path.join(__dirname, "..", "index.html");

function extractVocabData(indexHtmlPath) {
  const html = fs.readFileSync(indexHtmlPath || INDEX_HTML_PATH, "utf8");
  const startMarker = "const vocabData = [";
  const start = html.indexOf(startMarker);
  if (start === -1) throw new Error("Could not find 'const vocabData = [' in index.html");

  // Walk forward from the opening bracket, tracking bracket depth while
  // respecting string literals (so a "]" inside an example sentence like
  // "zoom out [see also: zoom in]" never closes the array early).
  const arrayStart = start + startMarker.length - 1; // index of the "["
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = arrayStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error("Could not find the matching closing ']' for vocabData");

  const arrayText = html.slice(arrayStart, end + 1);
  return JSON.parse(arrayText);
}

module.exports = { extractVocabData, INDEX_HTML_PATH };

if (require.main === module) {
  const data = extractVocabData();
  console.log(`Extracted ${data.length} vocabData entries.`);
}
