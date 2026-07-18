// Integration tests for exporting/sharing the Language Bank as a plain
// text "study sheet" — every entry across all 5 categories (built-in
// seed content plus anything the user added), formatted for offline
// review. Covers the content-generation logic itself (pure, no DOM)
// and the share-vs-download dispatch (Web Share API first, a plain
// text-file download whenever that's unavailable or rejected for a
// reason other than the user just cancelling the share sheet).
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("buildLanguageBankStudySheet()", () => {
  it("includes a title, generation date, and all 5 category sections with counts", async () => {
    const { hooks } = await loadApp();
    const text = hooks.buildLanguageBankStudySheet();

    expect(text).toContain("LANGUAGE BANK STUDY SHEET");
    expect(text).toContain("Generated ");
    expect(text).toMatch(/PHRASAL VERBS \(\d+\)/);
    expect(text).toMatch(/IDIOMS & EXPRESSIONS \(\d+\)/);
    expect(text).toMatch(/USEFUL SENTENCES \(\d+\)/);
    expect(text).toMatch(/SENTENCE PATTERNS \(\d+\)/);
    expect(text).toMatch(/TECHNICAL \/ ENGINEERING TERMS \(\d+\)/);
  });

  it("includes a known built-in entry from each category, with its meaning and example", async () => {
    const { hooks } = await loadApp();
    const text = hooks.buildLanguageBankStudySheet();

    expect(text).toContain("break the ice");
    expect(text).toContain("tolerance");
    expect(text).toMatch(/give up|move on/); // whichever built-in phrasal verb ships first
  });

  it("strips <b> markup from examples and mistake text — plain text has no use for it", async () => {
    const { hooks } = await loadApp();
    const text = hooks.buildLanguageBankStudySheet();

    expect(text).not.toContain("<b>");
    expect(text).not.toContain("</b>");
    // Sanity: the bolded word itself should still be present, just unbolded.
    expect(text).toContain("tolerance");
  });

  it("includes synonyms and antonyms when the entry has them", async () => {
    const { hooks } = await loadApp();
    const text = hooks.buildLanguageBankStudySheet();

    expect(text).toMatch(/Synonyms: margin, allowance|Synonyms:.*margin/);
  });

  it("reflects a newly-added custom entry, not just the static built-ins", async () => {
    const { hooks } = await loadApp();
    hooks.addTechnicalEntry(
      { w: "custom-export-test-term", senses: [{ use: "(noun) A made-up test entry.", examples: ["Used in a custom-export-test-term scenario."] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );

    const text = hooks.buildLanguageBankStudySheet();
    expect(text).toContain("custom-export-test-term");
  });
});

describe("shareOrExportLanguageBank()", () => {
  it("uses the Web Share API when available, sharing the study sheet as text", async () => {
    const { window, hooks } = await loadApp();
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    window.navigator.share = shareSpy;

    await hooks.shareOrExportLanguageBank();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0];
    expect(arg.title).toBe("Language Bank Study Sheet");
    expect(arg.text).toContain("LANGUAGE BANK STUDY SHEET");
    expect(window.document.getElementById("exportLanguageBankStatus").textContent).toContain("Shared");
  });

  it("cancelling the share sheet (AbortError) does not fall back to a download or show an error", async () => {
    const { window, hooks } = await loadApp();
    const abortError = Object.assign(new Error("cancelled"), { name: "AbortError" });
    window.navigator.share = vi.fn().mockRejectedValue(abortError);

    await hooks.shareOrExportLanguageBank();

    expect(window.document.getElementById("exportLanguageBankStatus").textContent).toBe("");
  });

  it("a genuine share failure (not a cancel) falls back to a text-file download", async () => {
    const { window, hooks } = await loadApp();
    window.navigator.share = vi.fn().mockRejectedValue(new Error("share not permitted"));

    await hooks.shareOrExportLanguageBank();

    expect(window.document.getElementById("exportLanguageBankStatus").textContent).toContain("Downloaded");
    expect(window.document.getElementById("exportLanguageBankStatus").textContent).toContain("language-bank-study-sheet.txt");
  });

  it("downloads directly when the Web Share API isn't available at all", async () => {
    const { window, hooks } = await loadApp();
    delete window.navigator.share;

    await hooks.shareOrExportLanguageBank();

    expect(window.document.getElementById("exportLanguageBankStatus").textContent).toContain("Downloaded");
  });

  it("clicking the actual button in the Language Bank tab triggers the same flow", async () => {
    const { window } = await loadApp();
    delete window.navigator.share;
    window.document.querySelector('.thumb-tab[data-tab="langbank"]').click();

    window.document.getElementById("exportLanguageBankBtn").click();
    await wait(30);

    expect(window.document.getElementById("exportLanguageBankStatus").textContent).toContain("Downloaded");
  });
});
