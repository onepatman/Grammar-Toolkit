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

// headwordFontSize() returns a CSS value string, not a bare number: either
// a plain "Npx" (short text — no shrinking needed at any width) or a
// clamp(floor, Nvw, base) expression (long text — shrinks toward `floor`
// only on narrow/phone-width viewports, and grows back to the normal
// `base` size once the viewport is roughly desktop-width, since the
// content column itself widens there and the text no longer needs to
// shrink just because it's long). This helper pulls the floor value back
// out of a clamp() string for tests that care about the progression.
function clampFloor(cssValue) {
  const m = /^clamp\((\d+)px/.exec(cssValue);
  return m ? Number(m[1]) : null;
}

describe("headwordFontSize()", () => {
  it("still returns a fluid clamp() for a short single word, not a flat unresponsive px", async () => {
    // A flat px here used to render identically on every phone width,
    // which reads as proportionally BIGGER on a narrower phone than the
    // exact same pixel count does on a wider one right next to it — the
    // mismatch this clamp() closes. The ceiling still equals `base`, so
    // short words stay essentially full-size; only the floor differs.
    const { hooks } = await loadApp();
    expect(hooks.headwordFontSize("Achieve", 22)).toBe("clamp(20px, 2.32vw, 22px)");
    expect(hooks.headwordFontSize("Happy", 30)).toBe("clamp(27px, 3.16vw, 30px)");
  });

  it("also gives empty/missing text the same fluid treatment as any other short label", async () => {
    const { hooks } = await loadApp();
    expect(hooks.headwordFontSize("", 22)).toBe("clamp(20px, 2.32vw, 22px)");
    expect(hooks.headwordFontSize(undefined, 22)).toBe("clamp(20px, 2.32vw, 22px)");
  });

  it("scales the clamp() floor down progressively as the text gets longer", async () => {
    const { hooks } = await loadApp();
    const short = hooks.headwordFontSize("Come early.", 22); // 11 chars
    const medium = hooks.headwordFontSize("A short-ish phrase", 22); // 18 chars
    const long = hooks.headwordFontSize("I kindly request your early arrival.", 22); // 37 chars
    const veryLong = hooks.headwordFontSize(
      "Please make every effort to arrive at the venue well before the scheduled start time.",
      22
    ); // 87 chars
    expect(clampFloor(short)).toBe(20);
    expect(clampFloor(medium)).toBeLessThan(clampFloor(short));
    expect(clampFloor(long)).toBeLessThan(clampFloor(medium));
    expect(clampFloor(veryLong)).toBeLessThan(clampFloor(long));
  });

  it("every clamp() still tops out at the original base size, for wide/desktop viewports", async () => {
    const { hooks } = await loadApp();
    const long = hooks.headwordFontSize("I kindly request your early arrival.", 22);
    expect(long).toBe(`clamp(${clampFloor(long)}px, 2.32vw, 22px)`);
  });

  it("never shrinks its floor below a sane minimum even for extremely long text", async () => {
    const { hooks } = await loadApp();
    const huge = "x".repeat(500);
    expect(clampFloor(hooks.headwordFontSize(huge, 22))).toBeGreaterThanOrEqual(13);
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
  it("gives short basic/advanced words the fluid clamp() for the normal 25px headword size", async () => {
    const { window, hooks } = await loadApp();
    hooks.addBasicAdvancedEntry(
      { basic: "happy", advanced: "elated", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [] },
      { persist: false }
    );
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    const headwords = window.document.querySelectorAll("#basicAdvancedEntry .headword");
    expect(headwords).toHaveLength(2);
    // Style is read from the raw attribute (not the parsed .style object)
    // since jsdom's CSS parser doesn't resolve clamp() the way a real
    // browser does — the attribute text is what actually ships to users.
    // Both sides still share one clamp() topping out at 25px, just with
    // a mild floor now instead of a flat, viewport-unresponsive value.
    expect(headwords[0].getAttribute("style")).toContain("font-size:clamp(23px, 2.63vw, 25px)");
    expect(headwords[1].getAttribute("style")).toContain("font-size:clamp(23px, 2.63vw, 25px)");
  });

  it("sizes BOTH headwords off whichever side is longer, so a pair never renders with two visibly mismatched sizes", async () => {
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
    // The short "Come early." side does NOT get its own independent
    // (larger) size — both sides share the clamp() computed off the
    // longer "advanced" text, so the pair reads as one consistent size
    // instead of two mismatched ones.
    const style0 = headwords[0].getAttribute("style");
    const style1 = headwords[1].getAttribute("style");
    expect(style0).toBe(style1);
    // ...and that shared size is a clamp() — a fixed floor for
    // narrow/phone viewports, scaling back up to the normal 25px base
    // once there's enough room, rather than a fixed shrink that also
    // applies on a wide desktop window with no space problem at all.
    expect(style1).toMatch(/font-size:clamp\(\d+px, [\d.]+vw, 25px\)/);
    expect(clampFloor(style1.match(/font-size:(clamp\([^)]*\))/)[1])).toBeLessThan(25);
  });
});

describe("Distinctions Words pair — headword sizing", () => {
  it("sizes BOTH word headwords off whichever side is longer, so a pair never renders with two visibly mismatched sizes", async () => {
    const { window, hooks } = await loadApp();
    const item = hooks.addDistinctionEntry(
      {
        w: "Arise vs Persnickety",
        word1: { w: "Arise", senses: [], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
        word2: { w: "Extraordinarily meticulous", senses: [], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }
      },
      { persist: false }
    );
    item.action();
    const headwords = window.document.querySelectorAll("#distinctionsEntry .headword");
    expect(headwords).toHaveLength(2);
    const style0 = headwords[0].getAttribute("style");
    const style1 = headwords[1].getAttribute("style");
    expect(style0).toBe(style1);
    expect(style1).toMatch(/font-size:clamp\(\d+px, [\d.]+vw, 25px\)/);
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
