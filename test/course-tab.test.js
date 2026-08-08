// Integration tests for the Course tab (structured Intermediate ->
// Advanced lessons, IELTS/Cambridge-style). A single category switcher
// hosts seventeen nested categories — Parts of Speech, Modal Verbs,
// Tenses, Tense Mastery, Conditionals, Active/Passive Voice, Reported
// Speech, Relative Clauses, Complex Sentence Building, Cohesive
// Devices, Nominalization, Collocations & Paraphrasing, Writing
// Templates, Spoken Fluency & Register, Prepositions, Word Order, and
// Articles — all living inside panel-course as .course-category divs
// (mirroring Language Bank's own category-switcher pattern; the chip
// row scrolls horizontally past 5 categories, same treatment as Word
// Bank's own category seg). Modal Verbs/Tenses/Prepositions/Word
// Order/Articles used to be separate top-level tabs that a chip
// merely linked out to; they're merged in here now, so nothing
// redundant is left outside the Course tab, and their old
// panel-modals/panel-tenses/panel-preps/panel-order/panel-articles
// sections and thumb-tab buttons no longer exist. Tense Mastery,
// Conditionals, Active/Passive Voice, Reported Speech, Relative
// Clauses, Complex Sentence Building, Cohesive Devices,
// Nominalization, Collocations & Paraphrasing, Writing Templates, and
// Spoken Fluency & Register are brand-new — none of them ever had a
// standalone tab. Their own add/edit/delete/CRUD behavior is still
// covered by test/rule-tabs-add.test.js and test/tenses-add.test.js —
// this file focuses on the Course tab shell/category-switcher, Parts
// of Speech, Tense Mastery, Conditionals, Active/Passive Voice,
// Reported Speech, Relative Clauses, Complex Sentence Building,
// Cohesive Devices, Nominalization, Collocations & Paraphrasing,
// Writing Templates, and Spoken Fluency & Register content.
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
    ["activePassive", "activePassiveSelect", "When to Use Passive Voice"],
    ["reportedSpeech", "reportedSpeechSelect", "Backshift: Present to Past in Reported Statements"],
    ["relativeClauses", "relativeClausesSelect", "Defining vs Non-Defining Relative Clauses"],
    ["complexSentences", "complexSentencesSelect", "Sentence Types: Simple, Compound, Complex, Compound-Complex"],
    ["cohesiveDevices", "cohesiveDevicesSelect", "Addition Linkers: Furthermore, Moreover, In Addition"],
    ["nominalization", "nominalizationSelect", "What Is Nominalization?"],
    ["collocations", "collocationsSelect", "What Are Collocations?"],
    ["writingTemplates", "writingTemplatesSelect", "IELTS Writing Task 2 Essay Structure: Four Paragraphs"],
    ["spokenFluency", "spokenFluencySelect", "What Is Register?"],
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

// "Mark as Done" progress tracking — per-device localStorage state (same
// precedent as the Self-Check Checklist and Favorites "reviewed" set),
// letting a learner check off which of the 17 Course categories they've
// finished. Not synced across devices, not tied to any actual content
// interaction — it's an honor-system habit tracker, same spirit as a
// paper textbook's table-of-contents checkboxes.
describe("Course tab — 'Mark as Done' progress tracking", () => {
  it("starts with 0 / 17 lessons completed and an unchecked Mark as Done button", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="course"]').click();
    expect(document.getElementById("courseProgressSummary").textContent).toBe("0 / 17 lessons completed");
    const btn = document.getElementById("courseMarkDoneBtn");
    expect(btn.textContent).toBe("Mark as Done");
    expect(btn.classList.contains("done")).toBe(false);
    expect(document.querySelector('#courseCategorySeg button[data-val="partsOfSpeech"]').classList.contains("course-chip-done")).toBe(false);
  });

  it("clicking Mark as Done marks the currently active category complete and updates the summary + chip", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="course"]').click();

    document.getElementById("courseMarkDoneBtn").click();

    expect(document.getElementById("courseProgressSummary").textContent).toBe("1 / 17 lessons completed");
    const btn = document.getElementById("courseMarkDoneBtn");
    expect(btn.textContent).toContain("Completed");
    expect(btn.classList.contains("done")).toBe(true);
    expect(document.querySelector('#courseCategorySeg button[data-val="partsOfSpeech"]').classList.contains("course-chip-done")).toBe(true);
  });

  it("clicking Mark as Done again on the same category undoes it", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="course"]').click();

    const btn = document.getElementById("courseMarkDoneBtn");
    btn.click();
    btn.click();

    expect(document.getElementById("courseProgressSummary").textContent).toBe("0 / 17 lessons completed");
    expect(btn.textContent).toBe("Mark as Done");
    expect(btn.classList.contains("done")).toBe(false);
  });

  it("marking one category done doesn't affect another category's state, and the button reflects whichever is active", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="course"]').click();

    document.getElementById("courseMarkDoneBtn").click(); // marks partsOfSpeech done
    document.querySelector('#courseCategorySeg button[data-val="tenseMastery"]').click();

    const btn = document.getElementById("courseMarkDoneBtn");
    expect(btn.textContent).toBe("Mark as Done"); // tenseMastery is NOT done
    expect(btn.classList.contains("done")).toBe(false);
    expect(document.getElementById("courseProgressSummary").textContent).toBe("1 / 17 lessons completed");
    expect(document.querySelector('#courseCategorySeg button[data-val="partsOfSpeech"]').classList.contains("course-chip-done")).toBe(true);
    expect(document.querySelector('#courseCategorySeg button[data-val="tenseMastery"]').classList.contains("course-chip-done")).toBe(false);

    document.querySelector('#courseCategorySeg button[data-val="partsOfSpeech"]').click();
    expect(document.getElementById("courseMarkDoneBtn").textContent).toContain("Completed");
  });

  it("persists across a re-render (switching tabs and back)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="course"]').click();
    document.getElementById("courseMarkDoneBtn").click();

    document.querySelector('.thumb-tab[data-tab="vocab"]').click();
    document.querySelector('.thumb-tab[data-tab="course"]').click();

    expect(document.getElementById("courseProgressSummary").textContent).toBe("1 / 17 lessons completed");
    expect(document.querySelector('#courseCategorySeg button[data-val="partsOfSpeech"]').classList.contains("course-chip-done")).toBe(true);
  });

  it("persists across a full page reload (localStorage, not IndexedDB)", async () => {
    const first = await loadApp();
    first.window.document.querySelector('.thumb-tab[data-tab="course"]').click();
    first.window.document.getElementById("courseMarkDoneBtn").click();
    first.window.document.querySelector('#courseCategorySeg button[data-val="conditionals"]').click();
    first.window.document.getElementById("courseMarkDoneBtn").click();

    const second = await loadApp({
      localStorage: { mepf_toolkit_course_progress: first.window.localStorage.getItem("mepf_toolkit_course_progress") }
    });
    second.window.document.querySelector('.thumb-tab[data-tab="course"]').click();

    expect(second.window.document.getElementById("courseProgressSummary").textContent).toBe("2 / 17 lessons completed");
    expect(second.window.document.querySelector('#courseCategorySeg button[data-val="partsOfSpeech"]').classList.contains("course-chip-done")).toBe(true);
    expect(second.window.document.querySelector('#courseCategorySeg button[data-val="conditionals"]').classList.contains("course-chip-done")).toBe(true);
  });

  it("getCourseProgressState/saveCourseProgressState/toggleActiveCourseCategoryDone are exposed as pure test hooks", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="course"]').click();

    expect(hooks.getCourseProgressState().partsOfSpeech).toBe(false);
    expect(hooks.getActiveCourseCategoryKey()).toBe("partsOfSpeech");

    hooks.saveCourseProgressState({ ...hooks.getCourseProgressState(), partsOfSpeech: true });
    hooks.renderCourseProgressUI();
    expect(document.getElementById("courseProgressSummary").textContent).toBe("1 / 17 lessons completed");

    hooks.toggleActiveCourseCategoryDone();
    expect(hooks.getCourseProgressState().partsOfSpeech).toBe(false);
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

describe("Course tab — Active/Passive Voice (formation, modals, agent phrase, technical register)", () => {
  it("covers when to use passive, formation across tenses, modals, the 'by' agent phrase, reporting verbs, common mistakes, and register choice", async () => {
    const { hooks } = await loadApp();
    const words = hooks.activePassiveData.map((a) => a.w);
    expect(words).toEqual(expect.arrayContaining([
      "When to Use Passive Voice",
      "Forming the Passive: be + Past Participle Across Tenses",
      "Passive with Modals",
      "The 'by' Agent Phrase: When to Include It",
      "Passive with Reporting/Belief Verbs (It is believed that...)",
      "Common Passive Mistakes",
      "Choosing Active vs Passive for Technical/Engineering Writing"
    ]));
  });

  it("the Common Passive Mistakes lesson warns against passivizing intransitive verbs", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.activePassiveData.find((a) => a.w === "Common Passive Mistakes");
    expect(lesson.mistake).toMatch(/intransitive/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("activePassiveAddBtn").click();
    await wait(10);
    expect(document.getElementById("activePassiveAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("activePassiveAddInput").value = "Passive for Lab Reports";
    document.getElementById("activePassiveAddBtn").click();
    await wait(30);
    expect(document.getElementById("activePassiveAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.activePassiveData.some((a) => a.w === "Passive for Lab Reports")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Active/Passive Voice category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("activePassiveAddInput").value = "Passive for Lab Reports";
    document.getElementById("activePassiveAddBtn").click();
    await wait(30);

    document.getElementById("activePassiveManualUse").value = "Lab reports use passive throughout to keep focus on the procedure, not the researcher.";
    document.getElementById("activePassiveManualExample").value = "The solution was titrated until the color changed.";
    document.getElementById("activePassiveManualSaveBtn").click();
    await wait(30);

    expect(hooks.activePassiveData.some((a) => a.w === "Passive for Lab Reports")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="activePassive"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("activePassiveEntry").querySelector(".headword").textContent).toBe("Passive for Lab Reports");
    expect(document.getElementById("activePassiveEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("activePassiveSelect").value = "When to Use Passive Voice";
    hooks.renderRuleEntry(
      hooks.activePassiveData.find((a) => a.w === "When to Use Passive Voice"),
      document.getElementById("activePassiveEntry"), "Active/Passive Voice Rule", "activePassive"
    );
    expect(document.getElementById("activePassiveEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — Reported Speech (backshift, questions, commands, pronoun/time/place shifts)", () => {
  it("covers backshift, when backshift is skipped, reported questions, commands, pronoun/time/place shifts, reporting verbs beyond said/told, and common mistakes", async () => {
    const { hooks } = await loadApp();
    const words = hooks.reportedSpeechData.map((r) => r.w);
    expect(words).toEqual(expect.arrayContaining([
      "Backshift: Present to Past in Reported Statements",
      "When Backshift Is NOT Required",
      "Reporting Questions (Yes/No and Wh-)",
      "Reporting Commands and Requests",
      "Pronoun, Time, and Place Changes",
      "Reporting Verbs Beyond 'Said' and 'Told'",
      "Common Reported Speech Mistakes"
    ]));
  });

  it("the reporting-questions lesson warns against keeping do/does/did and question word order", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.reportedSpeechData.find((r) => r.w === "Reporting Questions (Yes/No and Wh-)");
    expect(lesson.mistake).toMatch(/do\/does\/did/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("reportedSpeechAddBtn").click();
    await wait(10);
    expect(document.getElementById("reportedSpeechAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("reportedSpeechAddInput").value = "Reporting Conditional Statements";
    document.getElementById("reportedSpeechAddBtn").click();
    await wait(30);
    expect(document.getElementById("reportedSpeechAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.reportedSpeechData.some((r) => r.w === "Reporting Conditional Statements")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Reported Speech category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("reportedSpeechAddInput").value = "Reporting Conditional Statements";
    document.getElementById("reportedSpeechAddBtn").click();
    await wait(30);

    document.getElementById("reportedSpeechManualUse").value = "First-conditional 'will' backshifts to 'would' in reported speech.";
    document.getElementById("reportedSpeechManualExample").value = "He said that if it rained, he would stay inside.";
    document.getElementById("reportedSpeechManualSaveBtn").click();
    await wait(30);

    expect(hooks.reportedSpeechData.some((r) => r.w === "Reporting Conditional Statements")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="reportedSpeech"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("reportedSpeechEntry").querySelector(".headword").textContent).toBe("Reporting Conditional Statements");
    expect(document.getElementById("reportedSpeechEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("reportedSpeechSelect").value = "Backshift: Present to Past in Reported Statements";
    hooks.renderRuleEntry(
      hooks.reportedSpeechData.find((r) => r.w === "Backshift: Present to Past in Reported Statements"),
      document.getElementById("reportedSpeechEntry"), "Reported Speech Rule", "reportedSpeech"
    );
    expect(document.getElementById("reportedSpeechEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — Relative Clauses (defining/non-defining, pronoun choice, omission, reduced clauses)", () => {
  it("covers defining vs non-defining clauses, pronoun choice, omission, prepositions, reduced clauses, 'whose', and common mistakes", async () => {
    const { hooks } = await loadApp();
    const words = hooks.relativeClausesData.map((r) => r.w);
    expect(words).toEqual(expect.arrayContaining([
      "Defining vs Non-Defining Relative Clauses",
      "Choosing the Right Relative Pronoun",
      "Omitting the Relative Pronoun (Object Relative Clauses)",
      "Relative Clauses with Prepositions",
      "Reduced Relative Clauses (Participle Clauses)",
      "'Whose' for Possession — People AND Things",
      "Common Relative Clause Mistakes"
    ]));
  });

  it("the defining vs non-defining lesson explains that comma placement changes meaning, not just style", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.relativeClausesData.find((r) => r.w === "Defining vs Non-Defining Relative Clauses");
    expect(lesson.mistake).toMatch(/changes the meaning/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("relativeClausesAddBtn").click();
    await wait(10);
    expect(document.getElementById("relativeClausesAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("relativeClausesAddInput").value = "'Some of whom' relative clauses";
    document.getElementById("relativeClausesAddBtn").click();
    await wait(30);
    expect(document.getElementById("relativeClausesAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.relativeClausesData.some((r) => r.w === "'Some of whom' relative clauses")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Relative Clauses category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("relativeClausesAddInput").value = "'Some of whom' relative clauses";
    document.getElementById("relativeClausesAddBtn").click();
    await wait(30);

    document.getElementById("relativeClausesManualUse").value = "A quantifier + 'of whom/which' introduces a formal non-defining clause about part of a group.";
    document.getElementById("relativeClausesManualExample").value = "The engineers, some of whom had over a decade of experience, approved the design.";
    document.getElementById("relativeClausesManualSaveBtn").click();
    await wait(30);

    expect(hooks.relativeClausesData.some((r) => r.w === "'Some of whom' relative clauses")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="relativeClauses"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("relativeClausesEntry").querySelector(".headword").textContent).toBe("'Some of whom' relative clauses");
    expect(document.getElementById("relativeClausesEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("relativeClausesSelect").value = "Defining vs Non-Defining Relative Clauses";
    hooks.renderRuleEntry(
      hooks.relativeClausesData.find((r) => r.w === "Defining vs Non-Defining Relative Clauses"),
      document.getElementById("relativeClausesEntry"), "Relative Clauses Rule", "relativeClauses"
    );
    expect(document.getElementById("relativeClausesEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — Complex Sentence Building (sentence types, joining clauses, run-ons/fragments, IELTS balance)", () => {
  it("covers sentence types, coordinating vs subordinating conjunctions, clause order, combining, run-ons/comma splices, fragments, and balance for IELTS", async () => {
    const { hooks } = await loadApp();
    const words = hooks.complexSentencesData.map((c) => c.w);
    expect(words).toEqual(expect.arrayContaining([
      "Sentence Types: Simple, Compound, Complex, Compound-Complex",
      "Coordinating vs Subordinating Conjunctions",
      "Clause Order: Subordinate Clause First vs Second",
      "Combining Short Sentences for Variety",
      "Avoiding Run-on Sentences and Comma Splices",
      "Avoiding Sentence Fragments",
      "Balancing Sentence Complexity for IELTS Writing Task 2"
    ]));
  });

  it("the IELTS balance lesson warns against chasing complexity for its own sake", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.complexSentencesData.find((c) => c.w === "Balancing Sentence Complexity for IELTS Writing Task 2");
    expect(lesson.mistake).toMatch(/complexity for its own sake/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("complexSentencesAddBtn").click();
    await wait(10);
    expect(document.getElementById("complexSentencesAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("complexSentencesAddInput").value = "Correlative conjunctions";
    document.getElementById("complexSentencesAddBtn").click();
    await wait(30);
    expect(document.getElementById("complexSentencesAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.complexSentencesData.some((c) => c.w === "Correlative conjunctions")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Complex Sentences category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("complexSentencesAddInput").value = "Correlative conjunctions";
    document.getElementById("complexSentencesAddBtn").click();
    await wait(30);

    document.getElementById("complexSentencesManualUse").value = "Pairs like 'not only...but also' and 'either...or' link two balanced parts of a sentence.";
    document.getElementById("complexSentencesManualExample").value = "Not only did the pump fail, but also the backup generator stalled.";
    document.getElementById("complexSentencesManualSaveBtn").click();
    await wait(30);

    expect(hooks.complexSentencesData.some((c) => c.w === "Correlative conjunctions")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="complexSentences"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("complexSentencesEntry").querySelector(".headword").textContent).toBe("Correlative conjunctions");
    expect(document.getElementById("complexSentencesEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("complexSentencesSelect").value = "Sentence Types: Simple, Compound, Complex, Compound-Complex";
    hooks.renderRuleEntry(
      hooks.complexSentencesData.find((c) => c.w === "Sentence Types: Simple, Compound, Complex, Compound-Complex"),
      document.getElementById("complexSentencesEntry"), "Complex Sentences Rule", "complexSentences"
    );
    expect(document.getElementById("complexSentencesEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — Cohesive Devices (addition/contrast/cause-effect/sequencing linkers, reference, substitution)", () => {
  it("covers addition, contrast, cause-effect, sequencing linkers, reference words, substitution, and common mistakes", async () => {
    const { hooks } = await loadApp();
    const words = hooks.cohesiveDevicesData.map((c) => c.w);
    expect(words).toEqual(expect.arrayContaining([
      "Addition Linkers: Furthermore, Moreover, In Addition",
      "Contrast Linkers: However, Nevertheless, On the Other Hand, Whereas",
      "Cause-Effect Linkers: Therefore, Consequently, As a Result",
      "Sequencing Linkers: Firstly, Subsequently, Finally",
      "Reference Words: This/These/Such + Noun",
      "Substitution: One, Do So, Ones (Avoiding Repetition)",
      "Common Cohesive Device Mistakes"
    ]));
  });

  it("the contrast linkers lesson distinguishes 'whereas' (subordinator) from 'however' (sentence adverb)", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.cohesiveDevicesData.find((c) => c.w === "Contrast Linkers: However, Nevertheless, On the Other Hand, Whereas");
    expect(lesson.mistake).toMatch(/fragment/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("cohesiveDevicesAddBtn").click();
    await wait(10);
    expect(document.getElementById("cohesiveDevicesAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("cohesiveDevicesAddInput").value = "Despite / in spite of";
    document.getElementById("cohesiveDevicesAddBtn").click();
    await wait(30);
    expect(document.getElementById("cohesiveDevicesAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.cohesiveDevicesData.some((c) => c.w === "Despite / in spite of")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Cohesive Devices category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("cohesiveDevicesAddInput").value = "Despite / in spite of";
    document.getElementById("cohesiveDevicesAddBtn").click();
    await wait(30);

    document.getElementById("cohesiveDevicesManualUse").value = "Both take a noun phrase or gerund, not a full clause with a subject and verb.";
    document.getElementById("cohesiveDevicesManualExample").value = "Despite the delay, the project finished on time.";
    document.getElementById("cohesiveDevicesManualSaveBtn").click();
    await wait(30);

    expect(hooks.cohesiveDevicesData.some((c) => c.w === "Despite / in spite of")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="cohesiveDevices"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("cohesiveDevicesEntry").querySelector(".headword").textContent).toBe("Despite / in spite of");
    expect(document.getElementById("cohesiveDevicesEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("cohesiveDevicesSelect").value = "Addition Linkers: Furthermore, Moreover, In Addition";
    hooks.renderRuleEntry(
      hooks.cohesiveDevicesData.find((c) => c.w === "Addition Linkers: Furthermore, Moreover, In Addition"),
      document.getElementById("cohesiveDevicesEntry"), "Cohesive Devices Rule", "cohesiveDevices"
    );
    expect(document.getElementById("cohesiveDevicesEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — Nominalization (turning verbs/adjectives into nouns for formal register)", () => {
  it("covers what nominalization is, common suffixes, academic register, structure changes, irregular forms, overuse, and common mistakes", async () => {
    const { hooks } = await loadApp();
    const words = hooks.nominalizationData.map((c) => c.w);
    expect(words).toEqual(expect.arrayContaining([
      "What Is Nominalization?",
      "Common Nominalization Suffixes: -tion, -sion, -ment, -ness, -ity, -ance/-ence",
      "Nominalization for Academic/Formal Register (IELTS Writing Task 2)",
      "Nominalization Changes Sentence Structure",
      "Irregular Noun Forms",
      "Overusing Nominalization",
      "Common Nominalization Mistakes"
    ]));
  });

  it("the irregular forms lesson flags 'choice' (not 'choosement') as the correct noun form of 'choose'", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.nominalizationData.find((c) => c.w === "Irregular Noun Forms");
    const allExamples = lesson.senses.flatMap((s) => s.examples).join(" ");
    expect(allExamples).toMatch(/choice/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("nominalizationAddBtn").click();
    await wait(10);
    expect(document.getElementById("nominalizationAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("nominalizationAddInput").value = "Prevent / prevention";
    document.getElementById("nominalizationAddBtn").click();
    await wait(30);
    expect(document.getElementById("nominalizationAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.nominalizationData.some((c) => c.w === "Prevent / prevention")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Nominalization category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("nominalizationAddInput").value = "Prevent / prevention";
    document.getElementById("nominalizationAddBtn").click();
    await wait(30);

    document.getElementById("nominalizationManualUse").value = "The verb 'prevent' becomes the noun 'prevention' by adding -ion.";
    document.getElementById("nominalizationManualExample").value = "The new policy aims at the prevention of accidents.";
    document.getElementById("nominalizationManualSaveBtn").click();
    await wait(30);

    expect(hooks.nominalizationData.some((c) => c.w === "Prevent / prevention")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="nominalization"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("nominalizationEntry").querySelector(".headword").textContent).toBe("Prevent / prevention");
    expect(document.getElementById("nominalizationEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("nominalizationSelect").value = "What Is Nominalization?";
    hooks.renderRuleEntry(
      hooks.nominalizationData.find((c) => c.w === "What Is Nominalization?"),
      document.getElementById("nominalizationEntry"), "Nominalization Rule", "nominalization"
    );
    expect(document.getElementById("nominalizationEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — Collocations & Paraphrasing (natural word pairings and restatement strategies)", () => {
  it("covers what collocations are, verb+noun and adjective+noun pairings, three paraphrasing strategies, and common mistakes", async () => {
    const { hooks } = await loadApp();
    const words = hooks.collocationsData.map((c) => c.w);
    expect(words).toEqual(expect.arrayContaining([
      "What Are Collocations?",
      "Verb + Noun Collocations: Make, Do, Take, Have",
      "Adjective + Noun Collocations",
      "Paraphrasing Strategy 1: Synonym Substitution",
      "Paraphrasing Strategy 2: Changing Word Form (Part of Speech)",
      "Paraphrasing Strategy 3: Changing Sentence Structure",
      "Common Collocation & Paraphrasing Mistakes"
    ]));
  });

  it("the make/do/take/have lesson flags swapping them as a common mistake", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.collocationsData.find((c) => c.w === "Verb + Noun Collocations: Make, Do, Take, Have");
    expect(lesson.mistake).toMatch(/make homework|do a decision/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("collocationsAddBtn").click();
    await wait(10);
    expect(document.getElementById("collocationsAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("collocationsAddInput").value = "Make vs Do";
    document.getElementById("collocationsAddBtn").click();
    await wait(30);
    expect(document.getElementById("collocationsAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.collocationsData.some((c) => c.w === "Make vs Do")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Collocations category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("collocationsAddInput").value = "Make vs Do";
    document.getElementById("collocationsAddBtn").click();
    await wait(30);

    document.getElementById("collocationsManualUse").value = "A quick memory aid for the make/do collocation pair.";
    document.getElementById("collocationsManualExample").value = "Make a decision, but do your homework.";
    document.getElementById("collocationsManualSaveBtn").click();
    await wait(30);

    expect(hooks.collocationsData.some((c) => c.w === "Make vs Do")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="collocations"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("collocationsEntry").querySelector(".headword").textContent).toBe("Make vs Do");
    expect(document.getElementById("collocationsEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("collocationsSelect").value = "What Are Collocations?";
    hooks.renderRuleEntry(
      hooks.collocationsData.find((c) => c.w === "What Are Collocations?"),
      document.getElementById("collocationsEntry"), "Collocations & Paraphrasing Rule", "collocations"
    );
    expect(document.getElementById("collocationsEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — Writing Templates (IELTS/Cambridge-style Task 1 & 2 essay structure)", () => {
  it("covers essay structure, introduction/body/conclusion templates, Task 1 overview, opinion vs discussion essays, and common mistakes", async () => {
    const { hooks } = await loadApp();
    const words = hooks.writingTemplatesData.map((c) => c.w);
    expect(words).toEqual(expect.arrayContaining([
      "IELTS Writing Task 2 Essay Structure: Four Paragraphs",
      "Introduction Paragraph Template",
      "Body Paragraph Template: Point, Explain, Example (PEE)",
      "Conclusion Paragraph Template",
      "Task 1 Overview Statement Template (Graphs & Charts)",
      "Opinion Essay vs Discussion Essay Templates",
      "Common Writing Template Mistakes"
    ]));
  });

  it("the conclusion template lesson flags introducing a new idea in the conclusion as a mistake", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.writingTemplatesData.find((c) => c.w === "Conclusion Paragraph Template");
    expect(lesson.mistake).toMatch(/new argument|new idea/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("writingTemplatesAddBtn").click();
    await wait(10);
    expect(document.getElementById("writingTemplatesAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("writingTemplatesAddInput").value = "Advantages/Disadvantages Essay Template";
    document.getElementById("writingTemplatesAddBtn").click();
    await wait(30);
    expect(document.getElementById("writingTemplatesAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.writingTemplatesData.some((c) => c.w === "Advantages/Disadvantages Essay Template")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Writing Templates category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("writingTemplatesAddInput").value = "Advantages/Disadvantages Essay Template";
    document.getElementById("writingTemplatesAddBtn").click();
    await wait(30);

    document.getElementById("writingTemplatesManualUse").value = "Body 1 covers advantages, Body 2 covers disadvantages, then a balanced conclusion.";
    document.getElementById("writingTemplatesManualExample").value = "One advantage is X. On the other hand, a disadvantage is Y.";
    document.getElementById("writingTemplatesManualSaveBtn").click();
    await wait(30);

    expect(hooks.writingTemplatesData.some((c) => c.w === "Advantages/Disadvantages Essay Template")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="writingTemplates"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("writingTemplatesEntry").querySelector(".headword").textContent).toBe("Advantages/Disadvantages Essay Template");
    expect(document.getElementById("writingTemplatesEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("writingTemplatesSelect").value = "IELTS Writing Task 2 Essay Structure: Four Paragraphs";
    hooks.renderRuleEntry(
      hooks.writingTemplatesData.find((c) => c.w === "IELTS Writing Task 2 Essay Structure: Four Paragraphs"),
      document.getElementById("writingTemplatesEntry"), "Writing Templates Rule", "writingTemplates"
    );
    expect(document.getElementById("writingTemplatesEntry").querySelector(".lb-edit-btn")).toBeNull();
  });
});

describe("Course tab — Spoken Fluency & Register (formal/informal language choice for natural speech)", () => {
  it("covers register, formal/informal vocabulary, contractions, fillers, discourse markers, register mismatches, and common mistakes", async () => {
    const { hooks } = await loadApp();
    const words = hooks.spokenFluencyData.map((c) => c.w);
    expect(words).toEqual(expect.arrayContaining([
      "What Is Register?",
      "Formal vs Informal Vocabulary",
      "Contractions: When to Use / Avoid Them",
      "Filler Words & Hesitation Devices for Natural Fluency",
      "Discourse Markers for Spoken Fluency",
      "Register Mismatches",
      "Common Register/Fluency Mistakes"
    ]));
  });

  it("the common mistakes lesson flags overusing filler words as replacing actual content", async () => {
    const { hooks } = await loadApp();
    const lesson = hooks.spokenFluencyData.find((c) => c.w === "Common Register/Fluency Mistakes");
    const allExamples = lesson.senses.flatMap((s) => s.examples).join(" ");
    expect(allExamples).toMatch(/um|like, um/i);
  });

  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("spokenFluencyAddBtn").click();
    await wait(10);
    expect(document.getElementById("spokenFluencyAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("spokenFluencyAddInput").value = "Formal vs Casual Greetings";
    document.getElementById("spokenFluencyAddBtn").click();
    await wait(30);
    expect(document.getElementById("spokenFluencyAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.spokenFluencyData.some((c) => c.w === "Formal vs Casual Greetings")).toBe(false);
  });

  it("saves a manually-typed rule, persists it, and activates the Course tab + Spoken Fluency category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById("spokenFluencyAddInput").value = "Formal vs Casual Greetings";
    document.getElementById("spokenFluencyAddBtn").click();
    await wait(30);

    document.getElementById("spokenFluencyManualUse").value = "'Good afternoon' is formal; 'hey' or 'what's up' is casual.";
    document.getElementById("spokenFluencyManualExample").value = "Good afternoon, everyone. vs Hey, what's up?";
    document.getElementById("spokenFluencyManualSaveBtn").click();
    await wait(30);

    expect(hooks.spokenFluencyData.some((c) => c.w === "Formal vs Casual Greetings")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="spokenFluency"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("spokenFluencyEntry").querySelector(".headword").textContent).toBe("Formal vs Casual Greetings");
    expect(document.getElementById("spokenFluencyEntry").querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("a built-in lesson (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("spokenFluencySelect").value = "What Is Register?";
    hooks.renderRuleEntry(
      hooks.spokenFluencyData.find((c) => c.w === "What Is Register?"),
      document.getElementById("spokenFluencyEntry"), "Spoken Fluency & Register Rule", "spokenFluency"
    );
    expect(document.getElementById("spokenFluencyEntry").querySelector(".lb-edit-btn")).toBeNull();
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

  it("indexes every Active/Passive Voice lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "When to Use Passive Voice" && item.cat === "Active/passive voice");
    expect(hit).toBeDefined();
  });

  it("clicking an Active/Passive Voice search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Passive with Modals" && item.cat === "Active/passive voice");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="activePassive"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("activePassiveEntry").querySelector(".headword").textContent).toBe("Passive with Modals");
  });

  it("indexes every Reported Speech lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "Backshift: Present to Past in Reported Statements" && item.cat === "Reported speech");
    expect(hit).toBeDefined();
  });

  it("clicking a Reported Speech search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Reporting Questions (Yes/No and Wh-)" && item.cat === "Reported speech");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="reportedSpeech"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("reportedSpeechEntry").querySelector(".headword").textContent).toBe("Reporting Questions (Yes/No and Wh-)");
  });

  it("indexes every Relative Clauses lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "Defining vs Non-Defining Relative Clauses" && item.cat === "Relative clauses");
    expect(hit).toBeDefined();
  });

  it("clicking a Relative Clauses search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Omitting the Relative Pronoun (Object Relative Clauses)" && item.cat === "Relative clauses");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="relativeClauses"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("relativeClausesEntry").querySelector(".headword").textContent).toBe("Omitting the Relative Pronoun (Object Relative Clauses)");
  });

  it("indexes every Complex Sentences lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "Sentence Types: Simple, Compound, Complex, Compound-Complex" && item.cat === "Complex sentences");
    expect(hit).toBeDefined();
  });

  it("clicking a Complex Sentences search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Avoiding Run-on Sentences and Comma Splices" && item.cat === "Complex sentences");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="complexSentences"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("complexSentencesEntry").querySelector(".headword").textContent).toBe("Avoiding Run-on Sentences and Comma Splices");
  });

  it("indexes every Cohesive Devices lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "Addition Linkers: Furthermore, Moreover, In Addition" && item.cat === "Cohesive devices");
    expect(hit).toBeDefined();
  });

  it("clicking a Cohesive Devices search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Common Cohesive Device Mistakes" && item.cat === "Cohesive devices");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="cohesiveDevices"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("cohesiveDevicesEntry").querySelector(".headword").textContent).toBe("Common Cohesive Device Mistakes");
  });

  it("indexes every Nominalization lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "What Is Nominalization?" && item.cat === "Nominalization");
    expect(hit).toBeDefined();
  });

  it("clicking a Nominalization search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Common Nominalization Mistakes" && item.cat === "Nominalization");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="nominalization"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("nominalizationEntry").querySelector(".headword").textContent).toBe("Common Nominalization Mistakes");
  });

  it("indexes every Collocations & Paraphrasing lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "What Are Collocations?" && item.cat === "Collocations and paraphrasing");
    expect(hit).toBeDefined();
  });

  it("clicking a Collocations & Paraphrasing search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Common Collocation & Paraphrasing Mistakes" && item.cat === "Collocations and paraphrasing");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="collocations"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("collocationsEntry").querySelector(".headword").textContent).toBe("Common Collocation & Paraphrasing Mistakes");
  });

  it("indexes every Writing Templates lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "IELTS Writing Task 2 Essay Structure: Four Paragraphs" && item.cat === "Writing templates");
    expect(hit).toBeDefined();
  });

  it("clicking a Writing Templates search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Common Writing Template Mistakes" && item.cat === "Writing templates");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="writingTemplates"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("writingTemplatesEntry").querySelector(".headword").textContent).toBe("Common Writing Template Mistakes");
  });

  it("indexes every Spoken Fluency & Register lesson under the Course tab", async () => {
    const { hooks } = await loadApp();
    const hit = hooks.searchIndex.find((item) => item.label === "What Is Register?" && item.cat === "Spoken fluency and register");
    expect(hit).toBeDefined();
  });

  it("clicking a Spoken Fluency & Register search result opens the Course tab with the right lesson selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const hit = hooks.searchIndex.find((item) => item.label === "Common Register/Fluency Mistakes" && item.cat === "Spoken fluency and register");
    hit.action();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="spokenFluency"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("spokenFluencyEntry").querySelector(".headword").textContent).toBe("Common Register/Fluency Mistakes");
  });
});

describe("Restoring cached Course-tab entries from a previous session", () => {
  it("ruleTabsCacheRestorePromise covers the pos category cleanly when nothing is cached", async () => {
    const { hooks } = await loadApp();
    await hooks.ruleTabsCacheRestorePromise;
    expect(hooks.RULE_TAB_CATEGORIES).toContain("pos");
  });
});
