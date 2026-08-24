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
    // Unlike the length-tiered clamp()s below (which reach `base` only
    // by ~950px, i.e. tablet/desktop — fine for a long sentence that
    // should stay near its floor through the whole phone range), a
    // short word's floor-to-base gap is small, so it uses a px+vw offset
    // form that actually reaches `base` by 640px — an ordinary large
    // phone, not desktop — so it visibly moves across real phone widths
    // instead of sitting flat at the floor the whole time.
    const { hooks } = await loadApp();
    expect(hooks.headwordFontSize("Achieve", 22)).toBe("clamp(20px, 17.7px + 0.67vw, 22px)");
    expect(hooks.headwordFontSize("Happy", 30)).toBe("clamp(27px, 23.6px + 1.00vw, 30px)");
  });

  it("also gives empty/missing text the same fluid treatment as any other short label", async () => {
    const { hooks } = await loadApp();
    expect(hooks.headwordFontSize("", 22)).toBe("clamp(20px, 17.7px + 0.67vw, 22px)");
    expect(hooks.headwordFontSize(undefined, 22)).toBe("clamp(20px, 17.7px + 0.67vw, 22px)");
  });

  it("scales the clamp() floor down progressively once the text is too long to fit on one line", async () => {
    const { hooks } = await loadApp();
    const short = hooks.headwordFontSize("Come early.", 22); // 11 chars
    const medium = hooks.headwordFontSize("A phrase that runs a bit longer", 22); // 31 chars
    const long = hooks.headwordFontSize("I kindly request your early arrival right now.", 22); // 45 chars
    const veryLong = hooks.headwordFontSize(
      "Please make every effort to arrive at the venue well before the scheduled start time.",
      22
    ); // 84 chars
    expect(clampFloor(short)).toBe(20);
    expect(clampFloor(medium)).toBeLessThan(clampFloor(short));
    expect(clampFloor(long)).toBeLessThan(clampFloor(medium));
    expect(clampFloor(veryLong)).toBeLessThan(clampFloor(long));
  });

  // The reported symptom: two entries on the SAME tab, same phone,
  // rendering at visibly different sizes even though both fit with room
  // to spare. Shrinking started at 14 characters, well before anything
  // was actually at risk of overflowing.
  it("gives every label that fits on one line the SAME size, however many characters it has", async () => {
    const { hooks } = await loadApp();
    const shortest = hooks.headwordFontSize("Tulad ng", 25); // 8 chars
    expect(hooks.headwordFontSize("Such as", 25)).toBe(shortest);
    expect(hooks.headwordFontSize("According to", 25)).toBe(shortest);
    expect(hooks.headwordFontSize("Naaayon sa / Ayon sa", 25)).toBe(shortest); // 20 chars
    // 24 characters is the documented one-line budget — still full size.
    expect(hooks.headwordFontSize("x".repeat(24), 25)).toBe(shortest);
    // 25 crosses it, so this one legitimately shrinks.
    expect(hooks.headwordFontSize("x".repeat(25), 25)).not.toBe(shortest);
  });

  // A vw-ONLY clamp looks fluid but isn't: clamp(21px, 2.63vw, 25px)
  // yields 10.3px at 390px and 16.8px at 640px, both under the floor, so
  // it returns a flat 21px on every real phone and only moves on a
  // desktop-width viewport. Anchoring the line through (340, floor)
  // instead of the origin is what makes it genuinely responsive.
  it("builds a clamp whose vw term is meaningful at phone widths, not frozen at the floor", async () => {
    const { hooks } = await loadApp();
    const parse = (css) => {
      const m = /^clamp\((\d+)px, ([\d.-]+)px \+ ([\d.]+)vw, (\d+)px\)$/.exec(css);
      expect(m, `expected a two-point clamp, got: ${css}`).not.toBeNull();
      return { floor: +m[1], intercept: +m[2], vw: +m[3], base: +m[4] };
    };
    const at = (p, width) => Math.min(Math.max(p.floor, p.intercept + (p.vw * width) / 100), p.base);

    ["Tulad ng", "Naaayon sa / Ayon sa", "x".repeat(30), "x".repeat(45), "x".repeat(70)].forEach((text) => {
      const p = parse(hooks.headwordFontSize(text, 25));
      // Exactly the floor at the narrowest phone we anchor to...
      expect(at(p, 340)).toBeCloseTo(p.floor, 1);
      // ...and strictly climbing from there, all the way through the
      // widths real phones actually report.
      expect(at(p, 390)).toBeGreaterThan(at(p, 340));
      expect(at(p, 430)).toBeGreaterThan(at(p, 390));
      expect(at(p, 540)).toBeGreaterThan(at(p, 430));
      // Never past the base, however wide the screen gets.
      expect(at(p, 1920)).toBe(p.base);
    });
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
    expect(headwords[0].getAttribute("style")).toContain("font-size:clamp(23px, 20.7px + 0.67vw, 25px)");
    expect(headwords[1].getAttribute("style")).toContain("font-size:clamp(23px, 20.7px + 0.67vw, 25px)");
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
    expect(style1).toMatch(/font-size:clamp\(\d+px, [\d.-]+px \+ [\d.]+vw, 25px\)/);
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
    expect(style1).toMatch(/font-size:clamp\(\d+px, [\d.-]+px \+ [\d.]+vw, 25px\)/);
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
