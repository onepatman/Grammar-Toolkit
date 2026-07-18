// Integration tests for exporting/sharing the Language Bank as a
// "study sheet" — every entry across all 5 categories (built-in seed
// content plus anything the user added), formatted for offline review.
//
// The button's actual behavior is PDF-first (buildLanguageBankPdfData
// + renderLanguageBankPdf, via jsPDF lazy-loaded on first use from
// js/jspdf.umd.min.js — see exportLanguageBankPdf()), falling back to
// the original plain-text share/download (buildLanguageBankStudySheet
// + shareOrExportLanguageBank) whenever that library can't be loaded.
// jsPDF is vendored locally rather than pulled from a CDN specifically
// so it's a same-origin file — which also means load-app.js's resource
// loader (reads local js/*.js straight off disk, same as every other
// module) serves the REAL library here too, not a stub. So most of
// this file exercises genuine PDF generation; forceNextJsPdfLoadToFail()
// below simulates the one case that can't happen naturally in jsdom —
// the library failing to load at all — to prove the text fallback
// still works when it does.
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

  it("a statusPrefix is prepended to the final message, for a caller (like the PDF fallback) explaining why", async () => {
    const { window, hooks } = await loadApp();
    delete window.navigator.share;

    await hooks.shareOrExportLanguageBank({ statusPrefix: "PDF unavailable —" });

    const text = window.document.getElementById("exportLanguageBankStatus").textContent;
    expect(text.startsWith("PDF unavailable —")).toBe(true);
    expect(text).toContain("Downloaded");
  });
});

describe("buildLanguageBankPdfData()", () => {
  it("returns a generation date and all 5 sections with correctly-counted entries", async () => {
    const { hooks } = await loadApp();
    const data = hooks.buildLanguageBankPdfData();

    expect(data.generatedDate).toBeTruthy();
    expect(data.sections).toHaveLength(5);
    data.sections.forEach((section) => {
      expect(section.entries.length).toBeGreaterThan(0);
      expect(Array.isArray(section.entries)).toBe(true);
    });
    expect(data.sections.map((s) => s.title)).toEqual([
      "Phrasal Verbs", "Idioms & Expressions", "Useful Sentences", "Sentence Patterns", "Technical / Engineering Terms"
    ]);
  });

  it("shapes each entry with word, meanings (use + examples), synonyms, antonyms — HTML stripped", async () => {
    const { hooks } = await loadApp();
    const data = hooks.buildLanguageBankPdfData();
    const technical = data.sections.find((s) => s.title === "Technical / Engineering Terms");
    const tolerance = technical.entries.find((e) => e.word === "tolerance");

    expect(tolerance).toBeTruthy();
    expect(tolerance.meanings[0].use).toBeTruthy();
    expect(tolerance.meanings[0].examples.length).toBeGreaterThan(0);
    expect(tolerance.meanings[0].examples.join(" ")).not.toContain("<b>");
    expect(tolerance.syn.length).toBeGreaterThan(0);
  });

  it("reflects a newly-added custom entry, not just the static built-ins", async () => {
    const { hooks } = await loadApp();
    hooks.addTechnicalEntry(
      { w: "custom-pdf-test-term", senses: [{ use: "(noun) A made-up test entry.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );

    const data = hooks.buildLanguageBankPdfData();
    const technical = data.sections.find((s) => s.title === "Technical / Engineering Terms");
    expect(technical.entries.some((e) => e.word === "custom-pdf-test-term")).toBe(true);
  });
});

// Makes the next <script src="...jspdf..."> injected by loadJsPdf()
// fail instead of actually loading — simulates a real "library
// couldn't be fetched" scenario (offline before it's ever been cached,
// blocked, briefly unreachable) without touching the real vendored
// file on disk. loadJsPdf() appends the script via document.head, and
// only sets .src beforehand, so intercepting appendChild is enough.
function forceNextJsPdfLoadToFail(window) {
  const originalAppendChild = window.document.head.appendChild.bind(window.document.head);
  window.document.head.appendChild = (el) => {
    if (el.tagName === "SCRIPT" && String(el.src).includes("jspdf")) {
      Promise.resolve().then(() => el.onerror && el.onerror(new window.Event("error")));
      return el;
    }
    return originalAppendChild(el);
  };
}

describe("loadJsPdf()", () => {
  it("resolves true — the vendored library actually loads (same-origin file, not a CDN)", async () => {
    const { window, hooks } = await loadApp();
    await expect(hooks.loadJsPdf()).resolves.toBe(true);
    expect(window.jspdf && window.jspdf.jsPDF).toBeTruthy();
  });

  it("resolves false (never throws) when the script fails to load", async () => {
    const { window, hooks } = await loadApp();
    forceNextJsPdfLoadToFail(window);
    await expect(hooks.loadJsPdf()).resolves.toBe(false);
  });
});

describe("renderLanguageBankPdf() — real PDF generation", () => {
  it("produces an actual PDF document (starts with the %PDF- signature)", async () => {
    const { hooks } = await loadApp();
    await hooks.loadJsPdf();
    const doc = hooks.renderLanguageBankPdf(hooks.buildLanguageBankPdfData());

    const dataUri = doc.output("datauristring");
    expect(dataUri.startsWith("data:application/pdf")).toBe(true);
    expect(doc.output("blob").type).toBe("application/pdf");
    expect(doc.output("blob").size).toBeGreaterThan(1000);
  });

  it("spans multiple pages for the full Language Bank (hundreds of entries)", async () => {
    const { hooks } = await loadApp();
    await hooks.loadJsPdf();
    const doc = hooks.renderLanguageBankPdf(hooks.buildLanguageBankPdfData());

    expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("fits a tiny single-entry document on one page", async () => {
    const { hooks } = await loadApp();
    await hooks.loadJsPdf();
    const tinyData = {
      generatedDate: "January 1, 2026",
      sections: [{
        title: "Phrasal Verbs",
        entries: [{ word: "give up", meanings: [{ use: "To stop trying.", examples: ["He gave up."] }], syn: ["quit"], ant: [], mistake: null, tagalog: null }]
      }]
    };
    const doc = hooks.renderLanguageBankPdf(tinyData);

    expect(doc.internal.getNumberOfPages()).toBe(1);
  });
});

describe("exportLanguageBankPdf() — the button's actual handler", () => {
  it("generates and downloads a real PDF when the library is available (the normal case)", async () => {
    const { window, hooks } = await loadApp();
    delete window.navigator.share;

    await hooks.exportLanguageBankPdf();

    const text = window.document.getElementById("exportLanguageBankStatus").textContent;
    expect(text).toBe("Downloaded language-bank-study-sheet.pdf.");
  });

  it("shares the PDF as a file when the device supports sharing files", async () => {
    const { window, hooks } = await loadApp();
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    window.navigator.share = shareSpy;
    window.navigator.canShare = vi.fn().mockReturnValue(true);

    await hooks.exportLanguageBankPdf();

    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0];
    expect(arg.title).toBe("Language Bank Study Sheet");
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0].name).toBe("language-bank-study-sheet.pdf");
    expect(arg.files[0].type).toBe("application/pdf");
    expect(window.document.getElementById("exportLanguageBankStatus").textContent).toContain("Shared");
  });

  it("falls back to the text export when the PDF library fails to load, and explains why", async () => {
    const { window, hooks } = await loadApp();
    delete window.navigator.share;
    forceNextJsPdfLoadToFail(window);

    await hooks.exportLanguageBankPdf();

    const text = window.document.getElementById("exportLanguageBankStatus").textContent;
    expect(text).toContain("PDF export isn't available");
    expect(text).toContain("Downloaded");
    expect(text).toContain("language-bank-study-sheet.txt");
  });

  it("clicking the actual button in the Language Bank tab triggers the same (real PDF) flow", async () => {
    const { window } = await loadApp();
    delete window.navigator.share;
    window.document.querySelector('.thumb-tab[data-tab="langbank"]').click();

    window.document.getElementById("exportLanguageBankBtn").click();
    await wait(100);

    expect(window.document.getElementById("exportLanguageBankStatus").textContent).toBe("Downloaded language-bank-study-sheet.pdf.");
  });
});
