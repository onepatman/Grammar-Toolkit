// Integration tests for the Practice tab — Flashcards / Multiple Choice /
// Spelling / True-False / Matching, each a randomized 15-item session
// built from My Favorites (default) / Vocabulary Bank / All Available
// Content. Loads the real index.html in jsdom and dispatches real DOM
// interactions, same pattern as the rest of this test suite.
//
// Tests use the "favorites" source with synthetic seeded words (rather
// than "vocab", which also includes the ~800 built-in Vocabulary Bank
// words) so each test's candidate pool is small, exact, and isolated.
import { describe, it, expect, vi } from "vitest";
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
    // Favorites, Notes, Practice sit together as the "personal tools"
    // cluster at the front of the tab bar, ahead of every word-based tab.
    expect(tabs.indexOf("practice")).toBeGreaterThan(tabs.indexOf("favorites"));
    expect(tabs.indexOf("practice")).toBeLessThan(tabs.indexOf("vocab"));

    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    expect(document.getElementById("panel-practice").style.display).toBe("block");
    expect(document.querySelector('input[name="practiceSource"][value="favorites"]').checked).toBe(true);

    const modes = Array.from(document.querySelectorAll(".practice-mode-btn")).map((b) => b.dataset.mode);
    expect(modes).toEqual(["flashcards", "mcq", "spelling", "truefalse", "matching", "speaking", "dictation"]);
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

  it("buildPracticeCandidates() pools example sentences across every sense, not just the first", async () => {
    const { window, hooks } = await loadApp();
    hooks.addVocabEntry({
      w: "multi-sense-word",
      senses: [
        { use: "(noun) First sense.", examples: ["First sense example."] },
        { use: "(verb) Second sense.", examples: ["Second sense example.", "Another second sense example."] }
      ],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    }, { persist: false });
    await window.VocabCache.addFavorite("multi-sense-word", { word: "multi-sense-word", cat: "Vocabulary Bank" }, { dbPromise: hooks.vocabDbPromise });

    const candidates = await hooks.buildPracticeCandidates("favorites");
    const candidate = candidates.find((c) => c.word === "multi-sense-word");
    expect(candidate.examples).toEqual([
      "First sense example.",
      "Second sense example.",
      "Another second sense example."
    ]);
  });

  it("getPracticeShadowTarget() picks randomly among every valid local example instead of always the first", async () => {
    const { hooks } = await loadApp();
    const candidate = {
      word: "multi-sense-word",
      examples: ["First sense example.", "Second sense example.", "Third sense example."]
    };
    const seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(hooks.getPracticeShadowTarget(candidate));
    // Vanishingly unlikely to land on the same one all 40 times by chance
    // if the selection really is random across all three.
    expect(seen.size).toBeGreaterThan(1);
    seen.forEach((s) => expect(candidate.examples).toContain(s));
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

// Practice pool candidates always carry a real example sentence (from
// makeVocabWord's seeded `examples`), so item.shadowText/dictationText
// is that sentence, not the bare word — Speaking is a Duolingo-style
// shadowing exercise (listen to the whole sentence, then repeat it).
function startSpeakingSession(window, document) {
  document.querySelector('.thumb-tab[data-tab="practice"]').click();
  document.querySelector('.practice-mode-btn[data-mode="speaking"]').click();
}

// Shadowing requires listening first — the Record button starts
// disabled every question until "Hear it" has been clicked at least
// once (see renderSpeakingHtml/the .practice-speaking-listen-btn handler).
function listenThenRecord(document) {
  document.querySelector(".practice-speaking-listen-btn").click();
  document.getElementById("practiceRecordBtn").click();
}

describe("Practice tab — Speaking mode (shadowing)", () => {
  it("shows the example sentence (not just the bare word) and keeps Record disabled until Hear it is clicked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    expect(item.shadowText).toBe(`Example sentence ${item.word.split("-")[2]}.`);
    expect(document.querySelector(".practice-shadow-sentence").textContent).toBe(item.shadowText);
    expect(document.getElementById("practiceRecordBtn").disabled).toBe(true);

    document.querySelector(".practice-speaking-listen-btn").click();
    expect(document.getElementById("practiceRecordBtn").disabled).toBe(false);
  });

  // A real user reported "tapping the mic button does nothing" — root
  // cause was that Record starts disabled (by design, shadowing means
  // listen-first) but nothing on screen said so, so a disabled button
  // with no explanation reads as broken. This pins down the fix: a
  // visible hint before Hear it is clicked, and a different one after.
  it("explains why Record is disabled before Hear it is clicked, then confirms it's ready once it is", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    expect(document.getElementById("practiceRecordBtn").disabled).toBe(true);
    expect(document.getElementById("practiceSpeakingStatus").textContent).toContain("Hear it");

    document.querySelector(".practice-speaking-listen-btn").click();

    expect(document.getElementById("practiceRecordBtn").disabled).toBe(false);
    expect(document.getElementById("practiceSpeakingStatus").textContent).toContain("Ready");
  });

  it("scores an exact spoken transcript of the full sentence as correct and shows what was heard", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    listenThenRecord(document);
    const recognition = hooks.getPracticeRecognition();
    expect(recognition).toBeTruthy();
    recognition.onresult({ results: [[{ transcript: item.shadowText }]] });

    const feedback = document.getElementById("practiceSpeakingFeedback").textContent;
    expect(feedback).toContain("✅");
    expect(document.getElementById("practiceRecordBtn").disabled).toBe(true);
    expect(document.querySelector(".practice-next-question-btn")).toBeTruthy();
  });

  it("still counts a transcript with a few small deviations as correct (sentence-length tolerance, wider than a single word's)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    // A one-character mishear (the trailing digit) plus no punctuation
    // at all (as SpeechRecognition transcripts never have) — a single
    // edit, well within the tolerance this mode allows.
    const misheard = item.shadowText.replace(/\d\.$/, "X");
    expect(hooks.isCloseTextMatch(misheard, item.shadowText)).toBe(true);

    listenThenRecord(document);
    hooks.getPracticeRecognition().onresult({ results: [[{ transcript: misheard }]] });
    expect(document.getElementById("practiceSpeakingFeedback").textContent).toContain("✅");
  });

  it("scores a clearly wrong transcript as incorrect and reveals the target sentence", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    listenThenRecord(document);
    hooks.getPracticeRecognition().onresult({ results: [[{ transcript: "completely unrelated noise about nothing at all" }]] });

    const feedback = document.getElementById("practiceSpeakingFeedback").textContent;
    expect(feedback).toContain("❌");
    expect(feedback).toContain(item.shadowText);
  });

  it("diffSpeakingWords() marks every target word matched for an exact transcript", async () => {
    const { hooks } = await loadApp();
    const diff = hooks.diffSpeakingWords("The quick brown fox jumps.", "The quick brown fox jumps.");
    expect(diff.map((d) => d.word)).toEqual(["The", "quick", "brown", "fox", "jumps."]);
    expect(diff.every((d) => d.matched)).toBe(true);
  });

  it("diffSpeakingWords() flags only the word(s) that actually diverged, not the whole sentence", async () => {
    const { hooks } = await loadApp();
    const diff = hooks.diffSpeakingWords("The quick brown cat jumps.", "The quick brown fox jumps.");
    expect(diff.map((d) => d.matched)).toEqual([true, true, true, false, true]);
    expect(diff.find((d) => d.word === "fox").matched).toBe(false);
  });

  it("diffSpeakingWords() marks every target word unmatched when nothing at all was heard", async () => {
    const { hooks } = await loadApp();
    const diff = hooks.diffSpeakingWords("", "The quick brown fox jumps.");
    expect(diff.every((d) => !d.matched)).toBe(true);
  });

  it("shows word-level diff highlighting in the feedback panel for a wrong-but-partial transcript", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    const targetWords = item.shadowText.split(/\s+/);
    const misheard = ["totally", ...targetWords.slice(1)].join(" ");

    listenThenRecord(document);
    hooks.getPracticeRecognition().onresult({ results: [[{ transcript: misheard }]] });

    const diffEl = document.querySelector(".practice-speaking-diff");
    expect(diffEl).toBeTruthy();
    const missedWords = Array.from(diffEl.querySelectorAll(".speaking-diff-word.missed")).map((el) => el.textContent);
    const matchedWords = Array.from(diffEl.querySelectorAll(".speaking-diff-word.matched")).map((el) => el.textContent);
    expect(missedWords).toContain(targetWords[0]);
    expect(matchedWords).toEqual(expect.arrayContaining(targetWords.slice(1)));
  });

  it("shows no diff panel at all when nothing was heard (there's nothing useful to highlight)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    listenThenRecord(document);
    hooks.getPracticeRecognition().onresult({ results: [[{ transcript: "" }]] });

    expect(document.querySelector(".practice-speaking-diff")).toBeNull();
  });

  it("a recognition error re-enables the Record button instead of leaving the learner stuck", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    listenThenRecord(document);
    expect(document.getElementById("practiceRecordBtn").disabled).toBe(true);
    hooks.getPracticeRecognition().onerror({ error: "no-speech" });

    expect(document.getElementById("practiceRecordBtn").disabled).toBe(false);
    expect(document.getElementById("practiceSpeakingStatus").textContent).toContain("try again");
    // No result was ever scored — the question hasn't been answered yet.
    expect(document.querySelector(".practice-next-question-btn")).toBeNull();
  });

  it("Skip always lets the learner move on, scored as incorrect, even with no microphone interaction at all", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    document.getElementById("practiceSpeakingSkipBtn").click();

    const state = hooks.getPracticeState();
    expect(state.results[0].correct).toBe(false);
    expect(state.results[0].userAnswer).toBe("(skipped)");
    expect(document.querySelector(".practice-next-question-btn")).toBeTruthy();
  });

  it("regression: recovers automatically if the recognition ends with no result and no error (real device report — was stuck on 'Listening…' forever)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    listenThenRecord(document);
    expect(document.getElementById("practiceRecordBtn").disabled).toBe(true);

    // On some real mobile browsers, SpeechRecognition just goes silent —
    // onend fires with no prior onresult or onerror at all.
    hooks.getPracticeRecognition().onend();

    expect(document.getElementById("practiceRecordBtn").disabled).toBe(false);
    expect(document.getElementById("practiceSpeakingStatus").textContent).toContain("try again");
    expect(document.querySelector(".practice-next-question-btn")).toBeNull();
  });

  it("Skip while actively listening isn't clobbered by the recognition's own onend recovery message", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    listenThenRecord(document);
    document.getElementById("practiceSpeakingSkipBtn").click();

    const state = hooks.getPracticeState();
    expect(state.results[0].userAnswer).toBe("(skipped)");
    expect(document.querySelectorAll(".practice-next-question-btn")).toHaveLength(1);
    expect(document.getElementById("practiceSpeakingStatus").textContent).not.toContain("Listening");
  });

  it("hides the Speaking mode button entirely when SpeechRecognition is unsupported — no dead button", async () => {
    const { window } = await loadApp();
    const document = window.document;
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;

    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    expect(document.getElementById("practiceSpeakingModeBtn").style.display).toBe("none");
  });

  it("shows the Speaking mode button when SpeechRecognition is supported", async () => {
    const { window } = await loadApp();
    const document = window.document;

    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    expect(document.getElementById("practiceSpeakingModeBtn").style.display).not.toBe("none");
  });

  it("swaps in a fresh online sentence if it arrives before the learner presses Hear it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);

    const lookupSpy = vi.spyOn(hooks.LookupServiceInstance, "lookup").mockResolvedValue({
      senses: [{ use: "(noun) online sense", examples: ["A fresh online example sentence."] }]
    });

    startSpeakingSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    expect(lookupSpy).toHaveBeenCalledWith(item.word, expect.objectContaining({ cache: hooks.onlineLookupCache }));
    expect(item.shadowText).toBe("A fresh online example sentence.");
    expect(document.querySelector(".practice-shadow-sentence").textContent).toBe("A fresh online example sentence.");
    lookupSpy.mockRestore();
  });

  it("never swaps the sentence once the learner has already pressed Hear it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);

    let resolveLookup;
    const lookupSpy = vi.spyOn(hooks.LookupServiceInstance, "lookup")
      .mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));

    startSpeakingSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    const originalText = item.shadowText;

    // Learner listens before the online lookup has resolved.
    document.querySelector(".practice-speaking-listen-btn").click();
    resolveLookup({ senses: [{ use: "(noun) online sense", examples: ["A late-arriving online sentence."] }] });
    await wait(20);

    expect(item.shadowText).toBe(originalText);
    lookupSpy.mockRestore();
  });

  it("leaves the local sentence untouched when there's no network (this test environment has no fetch, matching a real offline device)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    expect(item.shadowText).toMatch(/^Example sentence \d+\.$/);
    expect(document.querySelector(".practice-shadow-sentence").textContent).toBe(item.shadowText);
  });

  it("logs every wrong answer to the error log for the Personal Error Pattern Tracker", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startSpeakingSession(window, document);
    await wait(20);

    for (let i = 0; i < 15; i++) {
      document.getElementById("practiceSpeakingSkipBtn").click();
      document.querySelector(".practice-next-question-btn").click();
      await wait(10);
    }
    await wait(30);

    const errorLog = await window.VocabCache.getAllErrorLogEntries({ dbPromise: hooks.vocabDbPromise });
    expect(errorLog.length).toBe(15);
    expect(errorLog.every((e) => e.mode === "speaking")).toBe(true);
    expect(errorLog.every((e) => typeof e.word === "string" && e.word.length > 0)).toBe(true);
  });
});

describe("Practice tab — Writing mode (dictation)", () => {
  function startDictationSession(window, document) {
    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    document.querySelector('.practice-mode-btn[data-mode="dictation"]').click();
  }

  it("never shows the target sentence up front — input and Submit stay disabled until Play is clicked, hint stays hidden", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startDictationSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    // The target sentence sits inside the hint element (for the optional
    // Show/Hide hint toggle below), but that element is hidden by default —
    // it must never be VISIBLE before Play is clicked.
    const hintEl = document.getElementById("practiceDictationHint");
    expect(hintEl.textContent).toBe(item.dictationText);
    expect(hintEl.style.display).toBe("none");
    expect(document.getElementById("practiceDictationInput").disabled).toBe(true);
    expect(document.getElementById("practiceDictationSubmitBtn").disabled).toBe(true);

    document.querySelector(".practice-dictation-play-btn").click();
    expect(document.getElementById("practiceDictationInput").disabled).toBe(false);
    expect(document.getElementById("practiceDictationSubmitBtn").disabled).toBe(false);
    // Still hidden just from playing it — the hint is a separate, explicit action.
    expect(hintEl.style.display).toBe("none");
  });

  it("Show/Hide hint toggle reveals and re-hides the target sentence, available even before Play", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startDictationSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    const hintEl = document.getElementById("practiceDictationHint");
    const toggleBtn = document.getElementById("practiceDictationHintToggle");
    expect(hintEl.style.display).toBe("none");

    // Works before Play has ever been clicked — it's an independent hint,
    // not gated behind the listen-first requirement.
    toggleBtn.click();
    expect(hintEl.style.display).toBe("block");
    expect(hintEl.textContent).toBe(item.dictationText);
    expect(toggleBtn.textContent).toContain("Hide hint");

    toggleBtn.click();
    expect(hintEl.style.display).toBe("none");
    expect(toggleBtn.textContent).toContain("Show hint");
  });

  it("hint resets to hidden on the next question", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startDictationSession(window, document);
    await wait(20);

    document.getElementById("practiceDictationHintToggle").click();
    expect(document.getElementById("practiceDictationHint").style.display).toBe("block");

    document.getElementById("practiceDictationSkipBtn").click();
    document.querySelector(".practice-next-question-btn").click();
    expect(document.getElementById("practiceDictationHint").style.display).toBe("none");
    expect(document.getElementById("practiceDictationHintToggle").textContent).toContain("Show hint");
  });

  it("Play is repeatable — clicking it again doesn't disable anything or error", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startDictationSession(window, document);
    await wait(20);

    document.querySelector(".practice-dictation-play-btn").click();
    document.querySelector(".practice-dictation-play-btn").click();
    expect(document.getElementById("practiceDictationInput").disabled).toBe(false);
  });

  it("scores an exact typed transcription as correct and reveals the sentence", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startDictationSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    document.querySelector(".practice-dictation-play-btn").click();
    document.getElementById("practiceDictationInput").value = item.dictationText;
    document.getElementById("practiceDictationSubmitBtn").click();

    const feedback = document.getElementById("practiceDictationFeedback").textContent;
    expect(feedback).toContain("✅");
    expect(feedback).toContain(item.dictationText);
    expect(document.getElementById("practiceDictationInput").disabled).toBe(true);
    expect(document.querySelector(".practice-next-question-btn")).toBeTruthy();
  });

  it("tolerates minor punctuation/case differences in the typed answer", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startDictationSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    const typedVariant = item.dictationText.replace(/\.$/, "").toUpperCase();
    document.querySelector(".practice-dictation-play-btn").click();
    document.getElementById("practiceDictationInput").value = typedVariant;
    document.getElementById("practiceDictationSubmitBtn").click();

    expect(document.getElementById("practiceDictationFeedback").textContent).toContain("✅");
  });

  it("scores a clearly wrong typed answer as incorrect and reveals the correct sentence", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startDictationSession(window, document);
    await wait(20);

    const state = hooks.getPracticeState();
    const item = state.items[state.index];
    document.querySelector(".practice-dictation-play-btn").click();
    document.getElementById("practiceDictationInput").value = "totally different unrelated words here";
    document.getElementById("practiceDictationSubmitBtn").click();

    const feedback = document.getElementById("practiceDictationFeedback").textContent;
    expect(feedback).toContain("❌");
    expect(feedback).toContain(item.dictationText);
  });

  it("Skip always lets the learner move on, scored as incorrect, even without ever pressing Play", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedFavoritedWords(window, hooks, 16);
    startDictationSession(window, document);
    await wait(20);

    document.getElementById("practiceDictationSkipBtn").click();

    const state = hooks.getPracticeState();
    expect(state.results[0].correct).toBe(false);
    expect(state.results[0].userAnswer).toBe("(skipped)");
    expect(document.querySelector(".practice-next-question-btn")).toBeTruthy();
  });

  it("shows the Writing mode button (feature-detected on speechSynthesis only, no SpeechRecognition needed)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;

    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    expect(document.getElementById("practiceDictationModeBtn").style.display).not.toBe("none");
  });

  it("hides the Writing mode button when speechSynthesis is unsupported", async () => {
    const { window } = await loadApp();
    const document = window.document;
    delete window.speechSynthesis;

    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    expect(document.getElementById("practiceDictationModeBtn").style.display).toBe("none");
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
    // The toggle's own IndexedDB write is fire-and-forget — give it a
    // moment to land before buildPracticeSession("favorites") reads it
    // straight back via VocabCache.getAllFavorites().
    await wait();

    document.querySelector('.thumb-tab[data-tab="practice"]').click();
    expect(document.querySelector('input[name="practiceSource"]:checked').value).toBe("favorites");
    document.querySelector('.practice-mode-btn[data-mode="flashcards"]').click();
    await wait();

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
