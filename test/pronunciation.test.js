// Integration tests for the pronunciation feature — a "Listen" button
// (Web Speech API, entirely client-side, no network) and IPA phonetic
// text shown next to the headword when an online lookup provided one.
// jsdom has no Web Speech API at all; test/helpers/load-app.js installs
// a minimal window.speechSynthesis/SpeechSynthesisUtterance stub so the
// feature's own feature-detection stays true by default in tests (see
// that file), same spirit as the crypto.subtle/TextEncoder polyfills
// already there for owner-mode.js.
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("speakText()", () => {
  it("calls speechSynthesis.speak with an utterance for the given text", async () => {
    const { window, hooks } = await loadApp();
    const speakSpy = vi.fn();
    window.speechSynthesis.speak = speakSpy;

    hooks.speakText("resilient");

    expect(speakSpy).toHaveBeenCalledTimes(1);
    expect(speakSpy.mock.calls[0][0].text).toBe("resilient");
  });

  it("cancels any in-progress utterance first, so a fast double-tap doesn't queue/overlap speech", async () => {
    const { window, hooks } = await loadApp();
    const cancelSpy = vi.fn();
    window.speechSynthesis.cancel = cancelSpy;

    hooks.speakText("hello");

    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it("does nothing (never throws) when speechSynthesis isn't supported at all", async () => {
    const { window, hooks } = await loadApp();
    delete window.speechSynthesis;

    expect(() => hooks.speakText("hello")).not.toThrow();
  });
});

describe("makeListenButtonHtml()", () => {
  it("renders a button when speechSynthesis is supported", async () => {
    const { hooks } = await loadApp();
    expect(hooks.makeListenButtonHtml()).toContain("listen-btn");
  });

  it("renders nothing when speechSynthesis is unsupported, so no dead button appears", async () => {
    const { window, hooks } = await loadApp();
    delete window.speechSynthesis;
    expect(hooks.makeListenButtonHtml()).toBe("");
  });
});

describe("makePhoneticHtml()", () => {
  it("renders the phonetic text when present", async () => {
    const { hooks } = await loadApp();
    expect(hooks.makePhoneticHtml("/rɪˈzɪliənt/")).toContain("/rɪˈzɪliənt/");
  });

  it("renders nothing when there's no phonetic spelling — never fabricated", async () => {
    const { hooks } = await loadApp();
    expect(hooks.makePhoneticHtml(null)).toBe("");
    expect(hooks.makePhoneticHtml(undefined)).toBe("");
  });
});

describe("Listen button appears and works across every word/phrase tab", () => {
  it("Vocabulary Bank entry (via renderRuleEntry)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const speakSpy = vi.fn();
    window.speechSynthesis.speak = speakSpy;

    const btn = document.getElementById("vocabEntry").querySelector(".listen-btn");
    expect(btn).toBeTruthy();
    btn.click();
    expect(speakSpy).toHaveBeenCalledTimes(1);
  });

  it("Language Bank entry (phrasal verb, via renderRuleEntry with a categoryKey)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const speakSpy = vi.fn();
    window.speechSynthesis.speak = speakSpy;

    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    const btn = document.getElementById("phrasalEntry").querySelector(".listen-btn");
    expect(btn).toBeTruthy();
    btn.click();
    expect(speakSpy).toHaveBeenCalledTimes(1);
  });

  it("Verbs tab entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const speakSpy = vi.fn();
    window.speechSynthesis.speak = speakSpy;

    const btn = document.getElementById("verbEntry").querySelector(".listen-btn");
    expect(btn).toBeTruthy();
    btn.click();
    expect(speakSpy).toHaveBeenCalledTimes(1);
  });

  it("Prepositions tab entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const speakSpy = vi.fn();
    window.speechSynthesis.speak = speakSpy;

    const btn = document.getElementById("prepEntry").querySelector(".listen-btn");
    expect(btn).toBeTruthy();
    btn.click();
    expect(speakSpy).toHaveBeenCalledTimes(1);
  });

  it("Word Family tab entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const speakSpy = vi.fn();
    window.speechSynthesis.speak = speakSpy;

    const btn = document.getElementById("familyEntry").querySelector(".listen-btn");
    expect(btn).toBeTruthy();
    btn.click();
    expect(speakSpy).toHaveBeenCalledTimes(1);
  });

  it("speaks the CORRECT word for the currently-selected entry, not a stale one", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const speakSpy = vi.fn();
    window.speechSynthesis.speak = speakSpy;

    // Switch to a specific verb, then click Listen.
    document.getElementById("verbSelect").selectedIndex = 1;
    hooks.renderVerb();
    const secondWord = document.getElementById("verbEntry").querySelector(".headword").textContent;

    document.getElementById("verbEntry").querySelector(".listen-btn").click();
    expect(speakSpy.mock.calls[0][0].text).toBe(secondWord);
  });

  it("no dead Listen button appears anywhere when speechSynthesis is unsupported", async () => {
    const { window } = await loadApp();
    delete window.speechSynthesis;
    // Re-render so the (now feature-detected-off) button is omitted.
    window.__TOOLKIT_TEST_HOOKS__.renderVerb();

    expect(window.document.getElementById("verbEntry").querySelector(".listen-btn")).toBeNull();
  });
});

describe("phonetic spelling shown for an online-looked-up word", () => {
  it("shows the phonetic text next to the headword when the lookup provided one", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "resilient-test",
      phonetic: "/rɪˈzɪliənt/",
      senses: [{ use: "(adjective) Able to recover quickly.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    document.getElementById("phrasalAddInput").value = "resilient-test";
    document.getElementById("phrasalAddBtn").click();
    await wait(30);

    document.getElementById("phrasalAddStatus").querySelector(".lb-lookup-save-btn").click();
    await wait(30);

    expect(document.getElementById("phrasalEntry").querySelector(".phonetic").textContent).toBe("/rɪˈzɪliənt/");
  });

  it("shows nothing extra when the lookup had no phonetic field — never fabricated", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "no-phonetic-test",
      senses: [{ use: "(noun) A test entry.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    document.getElementById("phrasalAddInput").value = "no-phonetic-test";
    document.getElementById("phrasalAddBtn").click();
    await wait(30);

    expect(document.getElementById("phrasalEntry").querySelector(".phonetic")).toBeNull();
  });
});
