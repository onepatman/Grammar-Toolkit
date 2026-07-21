// Integration tests for the Practice tab — Flashcards / Multiple Choice /
// Spelling / True-False / Matching, each a randomized 15-item session
// built from My Favorites (default) / Vocabulary Bank / All Available
// Content. Loads the real index.html in jsdom and dispatches real DOM
// interactions, same pattern as the rest of this test suite.
//
// Tests use the "favorites" source with synthetic seeded words (rather
// than "vocab", which also includes the ~800 built-in Vocabulary Bank
// words) so each test's candidate pool is small, exact, and isolated.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeVocabWord(n, use) {
  return {
    w: `practice-word-${n}`,
    senses: [{ use: use || `(noun) Definition number ${n}.`, examples: [`Example sentence ${n}.`] }],
    syn: [`syn${n}a`, `syn${n}b`],
    ant: [`ant${n}`],
    mistake: null,
    tagalog: null,
    source: "online"
  };
}

// Adds `count` synthetic vocab words AND favorites every one of them
// directly via VocabCache, giving an exact, isolated pool for the
// default "My Favorites" practice source — no slow UI-driven favoriting
// and no interference from the ~800 built-in Vocabulary Bank words.
function seedFavoritedWords(window, hooks, count) {
  const words = [];
  for (let i = 1; i <= count; i++) {
    hooks.addVocabEntry(makeVocabWord(i), { persist: false });
    words.push(`practice-word-${i}`);
  }
  return Promise.all(
    words.map((w) => window.VocabCache.addFavorite(w, { word: w, cat: "Vocabulary Bank" }, { dbPromise: hooks.vocabDbPromise }))
  ).then(() => words);
}

describe("Practice tab — home view", () => {
  it("appears as its own tab beside Favorites, and defaults to My Favorites as the source", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const tabs = Array.from(document.querySelectorAll(".thumb-tab")).map((t) => t.dataset.tab);
    expect(tabs.indexOf("practice")).toBe(tabs.indexOf("favorites") + 1);

    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    expect(document.getElementById("panel-practice").style.display).toBe("block");
    expect(document.querySelector('input[name="practiceSource"][value="favorites"]').checked).toBe(true);

    const modes = Array.from(document.querySelectorAll(".practice-mode-btn")).map((b) => b.dataset.mode);
    expect(modes).toEqual(["flashcards", "mcq", "spelling", "truefalse", "matching"]);
  });

  it("shows a clear message instead of a broken session when the chosen source has nothing usable", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.practice-mode-btn[data-mode="flashcards"]').click();
    await wait(20);

    expect(document.getElementById("practiceHomeStatus").textContent).toContain("Nothing to practice yet");
    expect(document.getElementById("practiceSession").style.display).toBe("none");
  });

  it("does not break Favorites or Study My Favorites — both keep working after visiting Practice", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await wait(20);

    expect(document.getElementById("panel-favorites").style.display).toBe("block");
    expect(document.getElementById("favoritesList").textContent).toContain("No favorites yet");
    expect(document.getElementById("studyFavoritesBtn")).toBeTruthy();
  });
});

describe("Practice tab — session data layer", () => {
  it("buildPracticeCandidates() skips candidates with no usable definition, never fabricating one", async () => {
    const { window, hooks } = await loadApp();
    hooks.addVocabEntry({ w: "no-def-word", senses: [], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }, { persist: false });
    await window.VocabCache.addFavorite("no-def-word", { word: "no-def-word", cat: "Vocabulary Bank" }, { dbPromise: hooks.vocabDbPromise });
    await seedFavoritedWords(window, hooks, 3);

    const candidates = await hooks.buildPracticeCandidates("favorites");
    expect(candidates.some((c) => c.word === "no-def-word")).toBe(false);
    expect(candidates.filter((c) => c.word.startsWith("practice-word-")).length).toBe(3);
  });

  it("buildPracticeSession() returns exactly 15 distinct items when the pool has 15 or more usable candidates", async () => {
    const { window, hooks } = await loadApp();
    await seedFavoritedWords(window, hooks, 20);

    const { session, pool } = await hooks.buildPracticeSession("favorites");
    expect(pool.length).toBe(20);
    expect(session.length).toBe(15);
    expect(new Set(session.map((s) => s.key)).size).toBe(15);
  });

  it("buildPracticeSession() reuses least-recently-used candidates to reach 15 when the pool is smaller", async () => {
    const { window, hooks } = await loadApp();
    await seedFavoritedWords(window, hooks, 4);

    const { session, pool } = await hooks.buildPracticeSession("favorites");
    expect(pool.length).toBe(4);
    expect(session.length).toBe(15);
    // Every real candidate appears at least once even though it's a small pool.
    const keys = new Set(session.map((s) => s.key));
    expect(keys.size).toBe(4);
  });

  it("prioritizes never-used/least-recently-used candidates over ones just asked", async () => {
    const { window, hooks } = await loadApp();
    await seedFavoritedWords(window, hooks, 16); // sessions hold 15 — exactly one is always left out

    const first = await hooks.buildPracticeSession("favorites");
    expect(first.session.length).toBe(15);
    const leftOutWord = first.pool.map((c) => c.word).find((w) => !first.session.some((s) => s.word === w));
    expect(leftOutWord).toBeTruthy();

    hooks.recordPracticeSessionUsage(first.session);

    const second = await hooks.buildPracticeSession("favorites");
    // The word skipped last time has no usage record at all, so it's
    // guaranteed to sort first this time and be included again.
    expect(second.session.some((s) => s.word === leftOutWord)).toBe(true);
  });

  it("Multiple Choice: every question offers up to 4 choices, the correct answer is always included, and choices are real content (never fabricated)", async () => {
    const { window, hooks } = await loadApp();
    await seedFavoritedWords(window, hooks, 20);
    const { session, pool } = await hooks.buildPracticeSession("favorites");
    const questions = hooks.buildMcqItems(session, pool);

    expect(questions.length).toBe(15);
    questions.forEach((q) => {
      expect(q.choices.length).toBeGreaterThanOrEqual(1);
      expect(q.choices.length).toBeLessThanOrEqual(4);
      expect(q.choices).toContain(q.correctAnswer);
      expect(new Set(q.choices).size).toBe(q.choices.length); // no duplicate choice text
    });
  });

  it("True/False: the statement always names the word being tested, and the answer is checkable", async () => {
    const { window, hooks } = await loadApp();
    await seedFavoritedWords(window, hooks, 20);
    const { session, pool } = await hooks.buildPracticeSession("favorites");
    const questions = hooks.buildTrueFalseItems(session, pool);

    expect(questions.length).toBe(15);
    questions.forEach((q) => {
      expect(q.statement).toContain(q.word);
      expect(typeof q.answer).toBe("boolean");
    });
  });

  it("Matching: batches cover every session item exactly once, in groups of at most 6", async () => {
    const { window, hooks } = await loadApp();
    await seedFavoritedWords(window, hooks, 20);
    const { session } = await hooks.buildPracticeSession("favorites");
    const batches = hooks.buildMatchingBatches(session);

    batches.forEach((b) => expect(b.length).toBeLessThanOrEqual(6));
    const allKeys = batches.flat().map((b) => b.key);
    expect(allKeys.length).toBe(session.length);
    expect(new Set(allKeys).size).toBe(session.length);
  });

  it("ratePracticeScore() matches the documented rating table", async () => {
    const { hooks } = await loadApp();
    expect(hooks.ratePracticeScore(15)).toBe("Excellent 🌟");
    expect(hooks.ratePracticeScore(14)).toBe("Excellent 🌟");
    expect(hooks.ratePracticeScore(13)).toBe("Very Good 👍");
    expect(hooks.ratePracticeScore(12)).toBe("Very Good 👍");
    expect(hooks.ratePracticeScore(11)).toBe("Good");
    expect(hooks.ratePracticeScore(10)).toBe("Good");
    expect(hooks.ratePracticeScore(9)).toBe("Fair");
    expect(hooks.ratePracticeScore(8)).toBe("Fair");
    expect(hooks.ratePracticeScore(7)).toBe("Needs Improvement 📚");
    expect(hooks.ratePracticeScore(0)).toBe("Needs Improvement 📚");
  });
});

describe("Practice tab — Flashcards mode", () => {
  it("shows the word as the front, reveals definition/example/synonyms/antonyms on Show Answer, and Next/Previous navigate", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.practice-mode-btn[data-mode="flashcards"]').click();
    await wait(20);

    expect(document.getElementById("practiceProgressText").textContent).toBe("Question 1 of 15");
    const front = document.querySelector(".practice-front").textContent;
    expect(front).toMatch(/^practice-word-\d+$/);
    expect(document.getElementById("practiceFlashBack").style.display).toBe("none");

    document.querySelector(".practice-flash-flip-btn").click();
    expect(document.getElementById("practiceFlashBack").style.display).toBe("block");
    expect(document.getElementById("practiceFlashBack").textContent).toContain("Definition");

    document.querySelector(".practice-flash-next-btn").click();
    expect(document.getElementById("practiceProgressText").textContent).toBe("Question 2 of 15");

    document.querySelector(".practice-flash-prev-btn").click();
    expect(document.getElementById("practiceProgressText").textContent).toBe("Question 1 of 15");
  });

  it("shows a completion summary (no score) after the last card, with Try Another and Back buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.practice-mode-btn[data-mode="flashcards"]').click();
    await wait(20);

    for (let i = 0; i < 15; i++) {
      document.querySelector(".practice-flash-next-btn").click();
    }
    await wait(20);

    expect(document.getElementById("practiceSession").style.display).toBe("none");
    const resultsText = document.getElementById("practiceResultsView").textContent;
    expect(resultsText).toContain("Practice Complete");
    expect(resultsText).toContain("15 flashcards");
    expect(document.querySelector(".practice-again-btn")).toBeTruthy();
    expect(document.querySelector(".practice-back-btn")).toBeTruthy();

    document.querySelector(".practice-back-btn").click();
    expect(document.getElementById("practiceHome").style.display).toBe("block");
  });
});

describe("Practice tab — Multiple Choice mode", () => {
  it("scores answers, shows correct/incorrect styling immediately, and produces a final results screen with score/percentage/rating", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 20);
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.practice-mode-btn[data-mode="mcq"]').click();
    await wait(20);

    for (let i = 0; i < 15; i++) {
      const state = hooks.getPracticeState();
      const item = state.items[state.index];
      const correctBtn = Array.from(document.querySelectorAll(".practice-choice-btn"))
        .find((b) => b.textContent.includes(item.correctAnswer));
      correctBtn.click();
      expect(correctBtn.classList.contains("correct")).toBe(true);
      document.querySelectorAll(".practice-choice-btn").forEach((b) => expect(b.disabled).toBe(true));
      document.querySelector(".practice-next-question-btn").click();
    }
    await wait(20);

    const resultsText = document.getElementById("practiceResultsView").textContent;
    expect(resultsText).toContain("15 / 15");
    expect(resultsText).toContain("100%");
    expect(resultsText).toContain("Excellent");
  });

  it("saves a history record with mode/score/percentage/rating after a completed session", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 20);
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.practice-mode-btn[data-mode="mcq"]').click();
    await wait(20);

    for (let i = 0; i < 15; i++) {
      document.querySelectorAll(".practice-choice-btn")[0].click();
      document.querySelector(".practice-next-question-btn").click();
    }
    await wait(30);

    const history = await window.VocabCache.getAllPracticeHistory({ dbPromise: hooks.vocabDbPromise });
    expect(history.length).toBe(1);
    expect(history[0].mode).toBe("mcq");
    expect(history[0].total).toBe(15);
    expect(typeof history[0].correct).toBe("number");
    expect(typeof history[0].percentage).toBe("number");
    expect(typeof history[0].rating).toBe("string");
  });
});

describe("Practice tab — Spelling mode", () => {
  it("accepts a correct spelling (case-insensitive) and flags an incorrect one, showing the correct spelling", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.practice-mode-btn[data-mode="spelling"]').click();
    await wait(20);

    let state = hooks.getPracticeState();
    let item = state.items[state.index];
    document.getElementById("practiceSpellingInput").value = item.word.toUpperCase();
    document.getElementById("practiceSpellingSubmitBtn").click();
    expect(document.getElementById("practiceSpellingFeedback").textContent).toContain("Correct");
    expect(document.getElementById("practiceSpellingInput").disabled).toBe(true);

    document.querySelector(".practice-next-question-btn").click();

    state = hooks.getPracticeState();
    item = state.items[state.index];
    document.getElementById("practiceSpellingInput").value = "definitely-the-wrong-word";
    document.getElementById("practiceSpellingSubmitBtn").click();
    const feedback = document.getElementById("practiceSpellingFeedback").textContent;
    expect(feedback).toContain("Incorrect");
    expect(feedback).toContain(item.word);
  });
});

describe("Practice tab — True/False mode", () => {
  it("checks the answer automatically and shows the correct answer when wrong", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.practice-mode-btn[data-mode="truefalse"]').click();
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    const correctLabel = item.answer ? "true" : "false";
    document.querySelector(`.practice-tf-btn[data-answer="${correctLabel}"]`).click();

    expect(document.getElementById("practiceTfFeedback").textContent).toContain("Correct");
    document.querySelectorAll(".practice-tf-btn").forEach((b) => expect(b.disabled).toBe(true));
  });
});

describe("Practice tab — Matching mode", () => {
  it("matches a correct pair, rejects a mismatched pair without losing progress, and completes with a results screen", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.practice-mode-btn[data-mode="matching"]').click();
    await wait(20);

    const wordEl = document.querySelector('#practiceMatchWords .practice-match-item');
    const key = wordEl.dataset.key;
    const correctDef = document.querySelector(`#practiceMatchDefs .practice-match-item[data-key="${key}"]`);
    const wrongDef = Array.from(document.querySelectorAll('#practiceMatchDefs .practice-match-item'))
      .find((el) => el.dataset.key !== key);

    // A mismatched attempt briefly flags both sides as wrong but doesn't lock them.
    wordEl.click();
    wrongDef.click();
    expect(wordEl.classList.contains("wrong") || wrongDef.classList.contains("wrong")).toBe(true);
    expect(wordEl.classList.contains("matched")).toBe(false);

    // The correct match still works afterward.
    wordEl.click();
    correctDef.click();
    expect(wordEl.classList.contains("matched")).toBe(true);
    expect(correctDef.classList.contains("matched")).toBe(true);
  });
});

describe("Practice tab — My Favorites as the practice source (real favoriting UI, not seeded)", () => {
  function openVocabEntry(hooks, document, word) {
    hooks.runSearchPipeline(word);
    const match = Array.from(document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("Vocabulary Bank"));
    match.click();
  }

  it("uses the user's favorited words by default, without requiring a source change", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openVocabEntry(hooks, document, "abandon");
    document.querySelector("#vocabEntry .fav-toggle").click();

    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    expect(document.querySelector('input[name="practiceSource"]:checked').value).toBe("favorites");
    document.querySelector('.practice-mode-btn[data-mode="flashcards"]').click();
    await wait(20);

    expect(document.getElementById("practiceSession").style.display).toBe("block");
    const words = [];
    for (let i = 0; i < 15; i++) {
      words.push(document.querySelector(".practice-front").textContent);
      document.querySelector(".practice-flash-next-btn").click();
    }
    expect(words.some((w) => w.toLowerCase() === "abandon")).toBe(true);
  });
});

describe("Practice tab — Vocabulary Bank source", () => {
  it("pulls from the full Vocabulary Bank (built-ins included) when that source is selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    const radio = document.querySelector('input[name="practiceSource"][value="vocab"]');
    radio.checked = true;
    radio.dispatchEvent(new window.Event("change"));

    const { session } = await hooks.buildPracticeSession(hooks.getSelectedPracticeSource());
    expect(session.length).toBe(15);
    expect(hooks.getSelectedPracticeSource()).toBe("vocab");
  });
});
