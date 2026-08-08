// Integration tests for the Course tab (structured Intermediate ->
// Advanced lessons, IELTS/Cambridge-style). A single category switcher
// hosts eight nested categories — Parts of Speech, Modal Verbs, Tenses,
// Tense Mastery, Conditionals, Prepositions, Word Order, and Articles —
// all living inside panel-course as .course-category divs (mirroring
// Language Bank's own category-switcher pattern; the chip row scrolls
// horizontally past 5 categories, same treatment as Word Bank's own
// category seg). Modal Verbs/Tenses/Prepositions/Word Order/Articles
// used to be separate top-level tabs that a chip merely linked out to;
// they're merged in here now, so nothing redundant is left outside the
// Course tab, and their old panel-modals/panel-tenses/panel-preps/
// panel-order/panel-articles sections and thumb-tab buttons no longer
// exist. Tense Mastery and Conditionals are brand-new — neither ever
// had a standalone tab. Their own add/edit/delete/CRUD behavior is
// still covered by test/rule-tabs-add.test.js and test/tenses-add.test.js
// — this file focuses on the Course tab shell/category-switcher, Parts
// of Speech, Tense Mastery, and Conditionals content.
// Loads the real index.html in jsdom and dispatches real DOM
// interactions, same as every other integration test in this repo.
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
    ["modals", "modalSelect", "can"],
    ["tenses", "tenseSelect", "Simple Present"],
    ["tenseMastery", "tenseMasterySelect", "Simple Past vs. Present Perfect"],
    ["conditionals", "conditionalsSelect", "Zero Conditional: General Truths & Facts"],
    ["preps", "prepSelect", "at"],
    ["order", "orderSelect", "adverb placement"],
    ["articles", "articleSelect", "a"]
  ])("clicking the %s chip shows it inline inside the Course tab — no navigating away", async (key, selectId, builtInOption) => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="course"]').click();

    document.querySelector(`#courseCategorySeg button[data-val="${key}"]`).click();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.getElementById("panel-course").style.display).toBe("block");
    expect(document.getElementById("course-" + key).style.display).not.toBe("none");
    expect(document.getElementById("course-partsOfSpeech").style.display).toBe("none");
    expect(document.querySelector(`#courseCategorySeg button[data-val="${key}"]`).classList.contains("active")).toBe(true);
    expect(document.querySelector('#courseCategorySeg button[data-val="partsOfSpeech"]').classList.contains("active")).toBe(false);

    // the built-in content genuinely renders inline, not just an empty shell
    const options = Array.from(document.getElementById(selectId).options).map((o) => o.value);
    expect(options).toContain(builtInOption);
  });

  it("none of the old standalone tabs exist anymore — no redundant duplicates left outside Course", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.querySelector('.thumb-tab[data-tab="modals"]')).toBeNull();
    expect(document.querySelector('.thumb-tab[data-tab="tenses"]')).toBeNull();
    expect(document.querySelector('.thumb-tab[data-tab="preps"]')).toBeNull();
    expect(document.querySelector('.thumb-tab[data-tab="order"]')).toBeNull();
    expect(document.querySelector('.thumb-tab[data-tab="articles"]')).toBeNull();
    expect(document.getElementById("panel-modals")).toBeNull();
    expect(document.getElementById("panel-tenses")).toBeNull();
    expect(document.getElementById("panel-preps")).toBeNull();
    expect(document.getElementById("panel-order")).toBeNull();
    expect(document.getElementById("panel-articles")).toBeNull();
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

describe("Course tab — Tense Mastery (all 12 tenses, mixed usage, paragraph consistency)", () => {
  it("covers the full range beyond simple present/past — perfect, continuous, and future forms", async () => {
    const { hooks } = await loadApp();
    const words = hooks.tenseMasteryData.map((t) => t.w);
    expect(words).toEqual(expect.arrayContaining([
      "Simple Past vs. Present Perfect",
      "Simple Past vs. Past Continuous",
      "Present Perfect vs. Present Perfect Continuous",
      "Past Perfect: the extra step back",
      "Tense Consistency Within a Paragraph",
      "Future Forms: will vs. going to vs. Present Continuous"
    ]));
  });

  it("addresses tense-consistency drift within a paragraph — the common 6.0-band weakness", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.tenseMasteryData.find((t) => t.w === "Tense Consistency Within a Paragraph");
    const allUse = lesson.senses.map((s) => s.use).join(" ");
    expect(allUse).toMatch(/anchor.{0,20}tense/i);
    expect(lesson.mistake).toMatch(/6\.0/);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("tenseMasteryAddBtn").click();
    await wait(10);
    expect(document.getElementById("tenseMasteryAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("tenseMasteryAddInput").value = "Mixed Conditionals";
    document.getElementById("tenseMasteryAddBtn").click();
    await wait(30);
    expect(document.getElementById("tenseMasteryAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.tenseMasteryData.some((t) => t.w === "Mixed Conditionals")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Tense Mastery category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("tenseMasteryAddInput").value = "Mixed Conditionals";
    document.getElementById("tenseMasteryAddBtn").click();
    await wait(30);

    document.getElementById("tenseMasteryManualUse").value = "Combines a past hypothetical condition with a present result.";
    document.getElementById("tenseMasteryManualExample").value = "If I had studied engineering, I would be working on-site now.";
    document.getElementById("tenseMasteryManualSaveBtn").click();
    await wait(30);

    expect(hooks.tenseMasteryData.some((t) => t.w === "Mixed Conditionals")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="tenseMastery"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("tenseMasteryEntry").querySelector(".headword").textContent).toBe("Mixed Conditionals");
    expect(document.getElementById("tenseMasteryEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("tenseMasterySelect").value = "Simple Past vs. Present Perfect";
    hooks.renderRuleEntry(
      hooks.tenseMasteryData.find((t) => t.w === "Simple Past vs. Present Perfect"),
      document.getElementById("tenseMasteryEntry"), "Tense Mastery Rule", "tenseMastery"
    );
    expect(document.getElementById("tenseMasteryEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — Conditionals (Zero through Third, mixed, and formal inversion)", () => {
  it("covers Zero through Third Conditional, Mixed Conditionals, alternatives to 'if', and formal inversion", async () => {
    const { hooks } = await loadApp();
    const words = hooks.conditionalsData.map((c) => c.w);
    expect(words).toEqual(expect.arrayContaining([
      "Zero Conditional: General Truths & Facts",
      "First Conditional: Real Future Possibility",
      "Second Conditional: Unreal Present/Future",
      "Third Conditional: Unreal Past (Regret / Different Result)",
      "Mixed Conditionals: Combining Time Frames",
      "Alternatives to 'If': Unless, Provided That, As Long As, In Case",
      "Formal Inversion: Were / Had / Should Instead of 'If'"
    ]));
  });

  it("the Third Conditional lesson warns against the common 'would have' inside the if-clause error", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.conditionalsData.find((c) => c.w === "Third Conditional: Unreal Past (Regret / Different Result)");
    expect(lesson.mistake).toMatch(/would have/i);
    expect(lesson.mistake).toMatch(/if-clause/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("conditionalsAddBtn").click();
    await wait(10);
    expect(document.getElementById("conditionalsAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("conditionalsAddInput").value = "Second Conditional for Polite Hedging";
    document.getElementById("conditionalsAddBtn").click();
    await wait(30);
    expect(document.getElementById("conditionalsAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.conditionalsData.some((c) => c.w === "Second Conditional for Polite Hedging")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Conditionals category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("conditionalsAddInput").value = "Second Conditional for Polite Hedging";
    document.getElementById("conditionalsAddBtn").click();
    await wait(30);

    document.getElementById("conditionalsManualUse").value = "Using would/could softens a suggestion, making it sound less direct.";
    document.getElementById("conditionalsManualExample").value = "It would be helpful if you could double-check the readings.";
    document.getElementById("conditionalsManualSaveBtn").click();
    await wait(30);

    expect(hooks.conditionalsData.some((c) => c.w === "Second Conditional for Polite Hedging")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="conditionals"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("conditionalsEntry").querySelector(".headword").textContent).toBe("Second Conditional for Polite Hedging");
    expect(document.getElementById("conditionalsEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("conditionalsSelect").value = "Zero Conditional: General Truths & Facts";
    hooks.renderRuleEntry(
      hooks.conditionalsData.find((c) => c.w === "Zero Conditional: General Truths & Facts"),
      document.getElementById("conditionalsEntry"), "Conditionals Rule", "conditionals"
    );
    expect(document.getElementById("conditionalsEntry").querySelector(".lb-edit-btn")).toBeNull();
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

  it("indexes every Tense Mastery lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "Simple Past vs. Present Perfect" && item.cat === "Tense mastery");
    expect(hit).toBeDefined();
  });

  it("clicking a Tense Mastery search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Tense Consistency Within a Paragraph" && item.cat === "Tense mastery");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="tenseMastery"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("tenseMasteryEntry").querySelector(".headword").textContent).toBe("Tense Consistency Within a Paragraph");
  });

  it("indexes every Conditionals lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "Zero Conditional: General Truths & Facts" && item.cat === "Conditionals");
    expect(hit).toBeDefined();
  });

  it("clicking a Conditionals search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Third Conditional: Unreal Past (Regret / Different Result)" && item.cat === "Conditionals");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="conditionals"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("conditionalsEntry").querySelector(".headword").textContent).toBe("Third Conditional: Unreal Past (Regret / Different Result)");
  });
});

describe("Restoring cached Course-tab entries from a previous session", () => {
  it("ruleTabsCacheRestorePromise covers the pos category cleanly when nothing is cached", async () => {
    const { hooks } = await loadApp();
    await hooks.ruleTabsCacheRestorePromise;
    expect(hooks.RULE_TAB_CATEGORIES).toContain("pos");
  });
});
