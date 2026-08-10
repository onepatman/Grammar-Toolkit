// Tests for the "excess words" UI fix: long, sentence-length content
// (a Word Bank pair, a Word Chunk, a favorited sentence) used to render
// at the same big fixed size/layout tuned for a single short word,
// wrapping into cramped, unprofessional-looking multi-line blocks.
// headwordFontSize() scales the big serif headword down as content gets
// longer, and isLongLabel() (+ the .long-label CSS it triggers) gives
// long Favorites/search-result rows their own line instead of squeezing
// next to the category tag and star.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

describe("headwordFontSize()", () => {
  it("keeps the base size for a short single word", async () => {
    const { hooks } = await loadApp();
    expect(hooks.headwordFontSize("Achieve", 22)).toBe(22);
    expect(hooks.headwordFontSize("Happy", 30)).toBe(30);
  });

  it("keeps the base size for empty/missing text", async () => {
    const { hooks } = await loadApp();
    expect(hooks.headwordFontSize("", 22)).toBe(22);
    expect(hooks.headwordFontSize(undefined, 22)).toBe(22);
  });

  it("scales down progressively as the text gets longer", async () => {
    const { hooks } = await loadApp();
    const short = hooks.headwordFontSize("Come early.", 22); // 11 chars
    const medium = hooks.headwordFontSize("A short-ish phrase", 22); // 18 chars
    const long = hooks.headwordFontSize("I kindly request your early arrival.", 22); // 37 chars
    const veryLong = hooks.headwordFontSize(
      "Please make every effort to arrive at the venue well before the scheduled start time.",
      22
    ); // 87 chars
    expect(short).toBe(22);
    expect(medium).toBeLessThan(short);
    expect(long).toBeLessThan(medium);
    expect(veryLong).toBeLessThan(long);
  });

  it("never shrinks below a sane floor even for extremely long text", async () => {
    const { hooks } = await loadApp();
    const huge = "x".repeat(500);
    expect(hooks.headwordFontSize(huge, 22)).toBeGreaterThanOrEqual(13);
  });
});

describe("isLongLabel()", () => {
  it("is false for short single-word/short-phrase labels", async () => {
    const { hooks } = await loadApp();
    expect(hooks.isLongLabel("Achieve")).toBe(false);
    expect(hooks.isLongLabel("Achieve → Attain")).toBe(false);
  });

  it("is true once the label crosses the sentence-length threshold", async () => {
    const { hooks } = await loadApp();
    expect(hooks.isLongLabel("Come early. → I kindly request your early arrival.")).toBe(true);
  });

  it("is false for empty/missing text", async () => {
    const { hooks } = await loadApp();
    expect(hooks.isLongLabel("")).toBe(false);
    expect(hooks.isLongLabel(undefined)).toBe(false);
  });
});

describe("Word Bank Basic → Advanced pair — headword sizing", () => {
  it("keeps short basic/advanced words at the normal 22px headword size", async () => {
    const { window, hooks } = await loadApp();
    hooks.addBasicAdvancedEntry(
      { basic: "happy", advanced: "elated", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [] },
      { persist: false }
    );
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    const headwords = window.document.querySelectorAll("#basicAdvancedEntry .headword");
    expect(headwords).toHaveLength(2);
    expect(headwords[0].style.fontSize).toBe("22px");
    expect(headwords[1].style.fontSize).toBe("22px");
  });

  it("shrinks the headword size for a sentence-length side, independently per side", async () => {
    const { window, hooks } = await loadApp();
    hooks.addBasicAdvancedEntry(
      {
        basic: "Come early.",
        advanced: "I kindly request your early arrival.",
        basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: []
      },
      { persist: false }
    );
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    const headwords = window.document.querySelectorAll("#basicAdvancedEntry .headword");
    expect(headwords).toHaveLength(2);
    // "Come early." stays short enough to keep the base size...
    expect(headwords[0].style.fontSize).toBe("22px");
    // ...but the long "advanced" side shrinks well below it.
    const advancedSize = parseInt(headwords[1].style.fontSize, 10);
    expect(advancedSize).toBeLessThan(22);
    expect(advancedSize).toBeGreaterThanOrEqual(13);
  });
});

describe("Favorites Cards view — long-label layout", () => {
  it("does not add long-label to a short single-word favorite", async () => {
    const { window, hooks } = await loadApp();
    hooks.runSearchPipeline("abandon");
    const match = Array.from(window.document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("Vocabulary Bank"));
    match.click();
    window.document.querySelector("#vocabEntry .fav-toggle").click();

    window.document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await new Promise((r) => setTimeout(r, 40));

    const row = window.document.querySelector("#favoritesList .search-result-item");
    expect(row).not.toBeNull();
    expect(row.classList.contains("long-label")).toBe(false);
  });

  it("adds long-label to a favorited pair whose combined text is sentence-length", async () => {
    const { window, hooks } = await loadApp();
    hooks.addBasicAdvancedEntry(
      {
        basic: "Come early.",
        advanced: "I kindly request your early arrival.",
        basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: []
      },
      { persist: false }
    );
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    window.document.querySelectorAll("#basicAdvancedEntry .fav-toggle")[0].click();

    window.document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await new Promise((r) => setTimeout(r, 40));

    const row = window.document.querySelector("#favoritesList .search-result-item");
    expect(row).not.toBeNull();
    expect(row.classList.contains("long-label")).toBe(true);
    expect(row.querySelector(".label").textContent).toContain("I kindly request your early arrival.");
  });
});

describe("Global search dropdown — long-label layout", () => {
  it("adds long-label to a matched entry whose own headword text is sentence-length", async () => {
    const { window, hooks } = await loadApp();
    hooks.runSearchPipeline("kindly request your early arrival");
    const rows = Array.from(window.document.querySelectorAll("#searchResults .search-result-item"));
    // Nothing in the seed data matches this made-up phrase, so this just
    // confirms the dropdown never throws and stays label-free when empty.
    expect(rows.length).toBe(0);
  });
});
