// Integration tests for the new Course tab (structured Intermediate ->
// Advanced lessons, IELTS/Cambridge-style). Phase 1: a category switcher
// with one authored local lesson category (Parts of Speech, reusing the
// exact same LANGUAGE_BANK_CONFIG-driven add/edit/delete machinery every
// other standalone grammar-rule tab already uses — see
// test/rule-tabs-add.test.js) plus four "linked" chips (Modal Verbs,
// Tenses, Prepositions, Word Order) that just hand off to the existing
// tab rather than duplicating its content. Loads the real index.html in
// jsdom and dispatches real DOM interactions, same as every other
// integration test in this repo.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Course tab — shell and category switcher", () => {
  it("appears as its own top-level tab", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const tabBtn = document.querySelector('.thumb-tab[data-tab="course"]');
    expect(tabBtn).not.toBeNull();
    tabBtn.click();
    expect(document.getElementById("panel-course").style.display).toBe("block");
  });

  it("defaults to the Parts of Speech category visible and active", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="course"]').click();
    expect(document.getElementById("course-partsOfSpeech").style.display).not.toBe("none");
    expect(document.querySelector('#courseCategorySeg button[data-val="partsOfSpeech"]').classList.contains("active")).toBe(true);
  });

  it.each([
    ["modals", "Modal Verbs"],
    ["tenses", "Tenses"],
    ["preps", "Prepositions"],
    ["order", "Word Order"]
  ])("clicking the %s chip navigates straight to the existing %s tab instead of showing a local panel", async (linkedTab) => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="course"]').click();

    document.querySelector(`#courseCategorySeg button[data-link="${linkedTab}"]`).click();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe(linkedTab);
    expect(document.getElementById("panel-course").style.display).toBe("none");
    expect(document.getElementById("panel-" + linkedTab).style.display).toBe("block");
  });
});

describe("Course tab — Parts of Speech (owner-only add, manual-only, no online lookup)", () => {
  it("shows the built-in lessons (Noun, Verb, Adjective, Adverb, Preposition, Conjunction)", async () => {
    const { hooks } = await loadApp();
    const words = hooks.partsOfSpeechData.map((p) => p.w);
    expect(words).toEqual(expect.arrayContaining(["Noun", "Verb", "Adjective", "Adverb", "Preposition", "Conjunction"]));
  });

  it("the built-in Verb lesson covers base-form usage and subject-verb agreement", async () => {
    const { hooks } = await loadApp();
    const verbLesson = hooks.partsOfSpeechData.find((p) => p.w === "Verb");
    const allUse = verbLesson.senses.map((s) => s.use).join(" ");
    expect(allUse).toMatch(/base form/i);
    expect(allUse).toMatch(/agree/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("posAddBtn").click();
    await wait(10);
    expect(document.getElementById("posAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("posAddInput").value = "Interjection";
    document.getElementById("posAddBtn").click();
    await wait(30);
    expect(document.getElementById("posAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.partsOfSpeechData.some((p) => p.w === "Interjection")).toBe(false);
  });

  it("goes straight to the manual box — never calls the online lookup", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    document.getElementById("posAddInput").value = "Interjection";
    document.getElementById("posAddBtn").click();
    await wait(30);

    expect(fetchCalled).toBe(false);
    expect(document.getElementById("posManualBox").style.display).not.toBe("none");
    expect(document.getElementById("posManualWord").textContent).toBe("Interjection");
    expect(hooks.languageBankPendingManual.pos).toBe("Interjection");
    expect(hooks.partsOfSpeechData.some((p) => p.w === "Interjection")).toBe(false);
  });

  it("does not duplicate a built-in lesson — navigates to it instead of opening the manual box", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("posAddInput").value = "Noun";
    document.getElementById("posAddBtn").click();
    await wait(30);

    expect(document.getElementById("posAddStatus").textContent).toContain("already in the database");
    expect(document.getElementById("posManualBox").style.display).toBe("none");
    expect(hooks.partsOfSpeechData.filter((p) => p.w === "Noun")).toHaveLength(1);
  });

  it("saves the manually-typed lesson, persists it, activates the Course tab + Parts of Speech category, and wires Edit/Delete", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("posAddInput").value = "Interjection";
    document.getElementById("posAddBtn").click();
    await wait(30);

    document.getElementById("posManualUse").value = "Expresses sudden emotion, usually followed by an exclamation point.";
    document.getElementById("posManualExample").value = "Wow, that reading is high!";
    document.getElementById("posManualSaveBtn").click();
    await wait(30);

    expect(hooks.partsOfSpeechData.some((p) => p.w === "Interjection")).toBe(true);
    const saved = hooks.partsOfSpeechData.find((p) => p.w === "Interjection");
    expect(saved.senses[0].use).toBe("Expresses sudden emotion, usually followed by an exclamation point.");
    expect(saved.source).toBe("online");

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="partsOfSpeech"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("posEntry").querySelector(".headword").textContent).toBe("Interjection");
    expect(document.getElementById("posEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("Cancel discards the pending manual entry — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("posAddInput").value = "Interjection";
    document.getElementById("posAddBtn").click();
    await wait(30);

    document.getElementById("posManualCancelBtn").click();
    await wait(10);

    expect(document.getElementById("posManualBox").style.display).toBe("none");
    expect(hooks.partsOfSpeechData.some((p) => p.w === "Interjection")).toBe(false);
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("posSelect").value = "Noun";
    hooks.renderRuleEntry(hooks.partsOfSpeechData.find((p) => p.w === "Noun"), document.getElementById("posEntry"), "Part of Speech", "pos");
    expect(document.getElementById("posEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — global search integration", () => {
  it("indexes every Parts of Speech lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "Noun" && item.cat === "Part of speech");
    expect(hit).toBeDefined();
  });

  it("clicking a Parts of Speech search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Adjective" && item.cat === "Part of speech");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.getElementById("posEntry").querySelector(".headword").textContent).toBe("Adjective");
  });
});

describe("Restoring cached Course-tab entries from a previous session", () => {
  it("ruleTabsCacheRestorePromise covers the pos category cleanly when nothing is cached", async () => {
    const { hooks } = await loadApp();
    await hooks.ruleTabsCacheRestorePromise;
    expect(hooks.RULE_TAB_CATEGORIES).toContain("pos");
  });
});
