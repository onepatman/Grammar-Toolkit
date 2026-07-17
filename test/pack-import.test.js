// Integration tests for the downloadable offline vocabulary pack
// import: the shared validation path (js/vocab-cache.js) plus
// importVocabPack()'s merge into the live app via addVocabEntry().
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

const VALID_PACK = [
  {
    w: "serendipity",
    senses: [{ use: "(noun) A pleasant surprise found by chance.", examples: ["Finding this cafe was pure serendipity."] }],
    syn: ["luck", "fortune"],
    ant: [],
    mistake: null,
    tagalog: null,
    source: "online"
  },
  {
    w: "ephemeral",
    senses: [{ use: "(adjective) Lasting for a very short time.", examples: ["The blossoms were ephemeral."] }],
    syn: ["fleeting"],
    ant: ["permanent"],
    mistake: null,
    tagalog: null,
    source: "online"
  }
];

describe("importVocabPack", () => {
  it("imports every valid entry and reports a summary", async () => {
    const { hooks } = await loadApp();
    const result = hooks.importVocabPack(VALID_PACK);
    expect(result).toEqual({ total: 2, imported: 2, skipped: 0 });
    expect(hooks.vocabData.some((v) => v.w === "serendipity")).toBe(true);
    expect(hooks.vocabData.some((v) => v.w === "ephemeral")).toBe(true);
  });

  it("imported entries become fully searchable, clickable, and dropdown-listed — like a built-in word", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.importVocabPack(VALID_PACK);

    expect(Array.from(document.getElementById("vocabSelect").options).some((o) => o.value === "serendipity")).toBe(true);

    hooks.runSearchPipeline("serendipity");
    const match = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("serendipity"));
    expect(match).toBeTruthy();
    expect(match.textContent).toContain("Vocabulary Bank");

    match.click();
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe("serendipity");
    expect(document.querySelector("#vocabEntry .fav-toggle")).toBeTruthy();
  });

  it("skips malformed entries in the batch without failing the whole import", async () => {
    const { hooks } = await loadApp();
    const batch = [
      VALID_PACK[0],
      { w: "", senses: [] },
      { senses: [{ use: "no word field", examples: [] }] },
      "not an object at all",
      { w: "valid-too", senses: [{ use: "(noun) test", examples: [] }] }
    ];
    const result = hooks.importVocabPack(batch);
    expect(result).toEqual({ total: 5, imported: 2, skipped: 3 });
  });

  it("deduplicates against an already-known word instead of creating a duplicate", async () => {
    const { hooks } = await loadApp();
    // "abandon" already exists as a built-in entry — importing a pack
    // that also defines it must not create a second "abandon".
    const batch = [{ w: "abandon", senses: [{ use: "fabricated", examples: [] }] }];
    hooks.importVocabPack(batch);
    expect(hooks.vocabData.filter((v) => v.w === "abandon")).toHaveLength(1);
    expect(hooks.vocabData.find((v) => v.w === "abandon").senses[0].use).not.toBe("fabricated");
  });

  it("returns a zero-imported summary for a non-array or empty payload", async () => {
    const { hooks } = await loadApp();
    expect(hooks.importVocabPack([])).toEqual({ total: 0, imported: 0, skipped: 0 });
    expect(hooks.importVocabPack(null)).toEqual({ total: 0, imported: 0, skipped: 0 });
  });
});

describe("the file-picker UI", () => {
  it("shows a success status and clears the input after importing valid JSON", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const statusEl = document.getElementById("packImportStatus");
    const input = document.getElementById("packImportInput");

    // jsdom's FileReader works off a real File/Blob-like object.
    const file = new window.File([JSON.stringify(VALID_PACK)], "pack.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new window.Event("change"));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(statusEl.className).toContain("success");
    expect(statusEl.textContent).toContain("Imported 2 of 2");
  });

  it("shows an error status for a file that isn't valid JSON", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const statusEl = document.getElementById("packImportStatus");
    const input = document.getElementById("packImportInput");

    const file = new window.File(["not json at all {{{"], "bad.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new window.Event("change"));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(statusEl.className).toContain("error");
  });
});
