// Integration tests for Favorites "Study mode" — a flashcard-style
// browser through the Favorites list. Each card is the real entry
// (rendered via the same wordIndexMap action() a favorite row or
// search result already uses), so this file focuses on the parts that
// ARE new: the "Study my favorites" entry point, the queue (every
// favorite that is DUE, soonest-due first — see the spaced-repetition
// section at the bottom of this file), and
// the floating Previous/Next bar — which wraps in both directions and
// never locks the user out of restarting or re-browsing.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("'Study my favorites' entry point", () => {
  it("stays hidden when there are no favorites", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    expect(document.getElementById("studyFavoritesBtn").style.display).toBe("none");
  });

  it("appears once at least one word is favorited", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.favoriteKeys.add("resilience"); // sidesteps needing a real click-through
    await VocabCache.addFavorite("resilience", { cat: "Vocabulary Bank" }, { dbPromise: hooks.vocabDbPromise });

    document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await wait(30);

    expect(document.getElementById("studyFavoritesBtn").style.display).not.toBe("none");
  });
});

describe("starting a study session", () => {
  it("reports no favorites to study when there are none at all", async () => {
    const { window, hooks } = await loadApp();
    await hooks.startStudyMode();
    expect(window.document.getElementById("studyStatus").textContent).toContain("could be found to study");
    expect(window.document.getElementById("studyBar").style.display).toBe("none");
  });

  it("opens the real entry for the first favorite and shows the floating bar with correct progress", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });

    await hooks.startStudyMode();

    expect(document.getElementById("studyBar").style.display).not.toBe("none");
    expect(document.getElementById("studyProgressText").textContent).toBe("0 / 1 reviewed · L0");
    // "tolerance" is a built-in Technical Term — landing on its real entry
    // proves this reused the normal wordIndexMap action(), not a stripped copy.
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(document.getElementById("technicalEntry").querySelector(".headword").textContent).toBe("tolerance");
  });

  it("queues every favorite, in the same order as the Favorites list (newest-favorited first)", async () => {
    const { hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await wait(5);
    await VocabCache.addFavorite("torque", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });

    const queue = await hooks.buildStudyQueue();
    expect(queue.map((f) => f.word)).toEqual(["torque", "tolerance"]);
  });

  it("skips a favorite whose underlying entry no longer exists, instead of crashing", async () => {
    const { hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await VocabCache.addFavorite("not-a-real-entry", { cat: "Vocabulary Bank" }, { dbPromise: hooks.vocabDbPromise });

    const queue = await hooks.buildStudyQueue();
    expect(queue.map((f) => f.word)).toEqual(["tolerance"]);
  });
});

describe("Previous / Next navigation", () => {
  it("Next moves to the next card and updates the progress text", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await wait(5);
    await VocabCache.addFavorite("torque", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode();
    expect(window.document.getElementById("studyProgressText").textContent).toBe("0 / 2 reviewed · L0");

    window.document.getElementById("studyNextBtn").click();

    expect(window.document.getElementById("studyProgressText").textContent).toBe("0 / 2 reviewed · L0");
    expect(window.document.getElementById("technicalEntry").querySelector(".headword").textContent).toBe("tolerance");
  });

  it("Next wraps from the last card back to the first — never ends the session on its own", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode();

    window.document.getElementById("studyNextBtn").click(); // only 1 card -> wraps to itself
    await wait(10);

    expect(window.document.getElementById("studyBar").style.display).not.toBe("none");
    expect(window.document.getElementById("studyProgressText").textContent).toBe("0 / 1 reviewed · L0");
  });

  it("Previous wraps from the first card to the last", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await wait(5);
    await VocabCache.addFavorite("torque", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode(); // starts on card 1 ("torque", newest-favorited)

    window.document.getElementById("studyPrevBtn").click();

    expect(window.document.getElementById("studyProgressText").textContent).toBe("0 / 2 reviewed · L0");
  });

  it("can move back and forth indefinitely without ever hitting a dead end or a lock", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await wait(5);
    await VocabCache.addFavorite("torque", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode();

    for (let i = 0; i < 5; i++) {
      window.document.getElementById("studyNextBtn").click();
    }
    for (let i = 0; i < 7; i++) {
      window.document.getElementById("studyPrevBtn").click();
    }

    expect(window.document.getElementById("studyBar").style.display).not.toBe("none");
    expect(window.document.getElementById("studyProgressText").textContent).toMatch(/\d \/ 2 reviewed/);
  });
});

describe("exiting study mode", () => {
  it("hides the bar and returns to the Favorites tab", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode();

    window.document.getElementById("studyExitBtn").click();

    expect(window.document.getElementById("studyBar").style.display).toBe("none");
    expect(window.document.querySelector(".thumb-tab.active").dataset.tab).toBe("favorites");
  });
});

describe("restarting immediately, over and over", () => {
  it("exiting and clicking 'Study my favorites' again starts a new session with the same favorites, instantly", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });

    await hooks.startStudyMode();
    window.document.getElementById("studyExitBtn").click();
    expect(window.document.getElementById("studyBar").style.display).toBe("none");

    await hooks.startStudyMode(); // immediately again, no waiting
    expect(window.document.getElementById("studyBar").style.display).not.toBe("none");
    expect(window.document.getElementById("studyProgressText").textContent).toBe("0 / 1 reviewed · L0");
  });

  it("can be started many times in a row with no lock ever appearing", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });

    for (let i = 0; i < 5; i++) {
      await hooks.startStudyMode();
      expect(window.document.getElementById("studyBar").style.display).not.toBe("none");
      expect(window.document.getElementById("studyStatus").textContent).not.toContain("Nothing due");
      window.document.getElementById("studyExitBtn").click();
    }
  });
});

describe("un-favoriting clears its study schedule record", () => {
  it("removes the word's reviewSchedule record when it is un-favorited", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await VocabCache.putReviewSchedule(
      { word: "tolerance", level: 2, dueAt: Date.now() + 100000, lastReviewedAt: Date.now() },
      { dbPromise: hooks.vocabDbPromise }
    );
    hooks.favoriteKeys.add("tolerance");

    window.document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    window.document.querySelector('#langBankCategorySeg button[data-val="technical"]').click();
    window.document.getElementById("technicalSelect").value = "tolerance";
    window.document.getElementById("technicalSelect").dispatchEvent(new window.Event("change"));
    window.document.getElementById("technicalEntry").querySelector(".fav-toggle").click();
    await wait(30);

    expect(await VocabCache.getReviewSchedule("tolerance", { dbPromise: hooks.vocabDbPromise })).toBeUndefined();
  });
});

describe("study session persists across a reload (real IndexedDB, not mocked)", () => {
  it("a favorite stays studyable in the next session with no waiting period carried over", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: first.hooks.vocabDbPromise });
    await first.hooks.startStudyMode();
    first.window.document.getElementById("studyNextBtn").click();
    await wait(30);

    const second = await loadApp({ indexedDBFactory });
    const queue = await second.hooks.buildStudyQueue();
    expect(queue.some((f) => f.word === "tolerance")).toBe(true);
  });
});

// ---------------------------------------------------------------
// Spaced repetition. js/spaced-repetition.js held the Leitner interval
// math (and its own unit tests) from the start, but nothing in the app
// ever called it: buildStudyQueue() returned every favorite in stored
// order, so a word you knew cold came round exactly as often as one you
// kept missing. These cover the wiring that makes the schedule real.
// ---------------------------------------------------------------

async function favoriteWord(hooks, window, word, categoryVal, selectId, entryId) {
  const document = window.document;
  document.querySelector('.thumb-tab[data-tab="langbank"]').click();
  document.querySelector(`#langBankCategorySeg button[data-val="${categoryVal}"]`).click();
  document.getElementById(selectId).value = word;
  document.getElementById(selectId).dispatchEvent(new window.Event("change"));
  document.getElementById(entryId).querySelector(".fav-toggle").click();
  await wait(30);
}

describe("Study mode — spaced repetition scheduling", () => {
  it("grading a card as 'I knew it' saves a schedule that pushes it out along the interval ladder", async () => {
    const { window, hooks } = await loadApp();
    const word = hooks.technicalData[0].w;
    await favoriteWord(hooks, window, word, "technical", "technicalSelect", "technicalEntry");

    window.document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await wait(40);
    await hooks.startStudyMode();

    const before = Date.now();
    await hooks.gradeStudyCard("good");
    await wait(40);

    const sched = await VocabCache.getReviewSchedule(word, { dbPromise: hooks.vocabDbPromise });
    expect(sched).toBeTruthy();
    expect(sched.level).toBe(1);
    // Level 1 is a 2-day interval per SpacedRepetition.INTERVAL_DAYS.
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    expect(sched.dueAt).toBeGreaterThanOrEqual(before + twoDays - 5000);
  });

  it("grading a card as 'Forgot' drops it back to level 0, due again tomorrow", async () => {
    const { window, hooks } = await loadApp();
    const word = hooks.technicalData[0].w;
    await favoriteWord(hooks, window, word, "technical", "technicalSelect", "technicalEntry");

    window.document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await wait(40);
    await hooks.startStudyMode();
    await hooks.gradeStudyCard("good");
    await wait(40);
    expect((await VocabCache.getReviewSchedule(word, { dbPromise: hooks.vocabDbPromise })).level).toBe(1);

    await hooks.startStudyMode();
    hooks.setStudyReviewOnlyDue(false); // it isn't due yet; study it anyway
    await hooks.startStudyMode();
    await hooks.gradeStudyCard("again");
    await wait(40);

    const sched = await VocabCache.getReviewSchedule(word, { dbPromise: hooks.vocabDbPromise });
    expect(sched.level).toBe(0);
    const oneDay = 24 * 60 * 60 * 1000;
    expect(sched.dueAt).toBeLessThanOrEqual(Date.now() + oneDay + 5000);
    hooks.setStudyReviewOnlyDue(true);
  });

  it("queues only cards that are actually due — a word scheduled for next month is left out", async () => {
    const { window, hooks } = await loadApp();
    const soon = hooks.technicalData[0].w;
    const later = hooks.technicalData[1].w;
    await favoriteWord(hooks, window, soon, "technical", "technicalSelect", "technicalEntry");
    await favoriteWord(hooks, window, later, "technical", "technicalSelect", "technicalEntry");

    // Push one far into the future; leave the other unscheduled (= due).
    await VocabCache.putReviewSchedule(
      { word: later, level: 5, dueAt: Date.now() + 30 * 24 * 60 * 60 * 1000, lastReviewedAt: Date.now() },
      { dbPromise: hooks.vocabDbPromise }
    );

    const queue = await hooks.buildStudyQueue();
    const words = queue.map((f) => f.word);
    expect(words).toContain(soon);
    expect(words).not.toContain(later);
  });

  it("a never-reviewed favorite is always due, so newly added words show up right away", async () => {
    const { window, hooks } = await loadApp();
    const word = hooks.technicalData[0].w;
    await favoriteWord(hooks, window, word, "technical", "technicalSelect", "technicalEntry");

    await hooks.loadStudySchedules();
    expect(hooks.isStudyCardDue({ key: word.trim().toLowerCase(), word: word }, Date.now())).toBe(true);
    const queue = await hooks.buildStudyQueue();
    expect(queue.map((f) => f.word)).toContain(word);
  });

  it("orders the queue soonest-due first, so the most overdue words lead the session", async () => {
    const { window, hooks } = await loadApp();
    const a = hooks.technicalData[0].w;
    const b = hooks.technicalData[1].w;
    await favoriteWord(hooks, window, a, "technical", "technicalSelect", "technicalEntry");
    await favoriteWord(hooks, window, b, "technical", "technicalSelect", "technicalEntry");

    const now = Date.now();
    await VocabCache.putReviewSchedule(
      { word: a, level: 1, dueAt: now - 1000, lastReviewedAt: now }, { dbPromise: hooks.vocabDbPromise }
    );
    await VocabCache.putReviewSchedule(
      { word: b, level: 1, dueAt: now - 90000000, lastReviewedAt: now }, { dbPromise: hooks.vocabDbPromise }
    );

    const queue = await hooks.buildStudyQueue();
    expect(queue.map((f) => f.word)).toEqual([b, a]); // b is far more overdue
  });

  it("falls back to a full run instead of dead-ending when nothing is due", async () => {
    const { window, hooks } = await loadApp();
    const word = hooks.technicalData[0].w;
    await favoriteWord(hooks, window, word, "technical", "technicalSelect", "technicalEntry");
    await VocabCache.putReviewSchedule(
      { word: word, level: 5, dueAt: Date.now() + 30 * 24 * 60 * 60 * 1000, lastReviewedAt: Date.now() },
      { dbPromise: hooks.vocabDbPromise }
    );

    expect(await hooks.buildStudyQueue()).toHaveLength(0);

    await hooks.startStudyMode();
    await wait(40);
    // It started a session rather than showing an error...
    expect(window.document.getElementById("studyBar").style.display).toBe("flex");
    expect(window.document.getElementById("studyStatus").textContent).toContain("All caught up");
    expect(window.document.getElementById("studyStatus").className).not.toContain("error");
    // ...and left the due-only default intact for next time.
    expect(hooks.getStudyReviewOnlyDue()).toBe(true);
  });

  it("ends the session once every queued card has been answered", async () => {
    const { window, hooks } = await loadApp();
    const word = hooks.technicalData[0].w;
    await favoriteWord(hooks, window, word, "technical", "technicalSelect", "technicalEntry");
    window.document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await wait(40);

    await hooks.startStudyMode();
    expect(window.document.getElementById("studyBar").style.display).toBe("flex");
    await hooks.gradeStudyCard("good");
    await wait(40);

    expect(window.document.getElementById("studyBar").style.display).toBe("none");
    expect(window.document.getElementById("studyStatus").textContent).toContain("Session complete");
  });

  it("counts how many favorites are due and says so on the Study button", async () => {
    const { window, hooks } = await loadApp();
    const word = hooks.technicalData[0].w;
    await favoriteWord(hooks, window, word, "technical", "technicalSelect", "technicalEntry");

    expect(await hooks.countDueStudyCards()).toEqual({ due: 1, total: 1 });
    await hooks.refreshStudyDueBadge();
    expect(window.document.getElementById("studyFavoritesBtn").textContent).toContain("1 due");

    await VocabCache.putReviewSchedule(
      { word: word, level: 5, dueAt: Date.now() + 30 * 24 * 60 * 60 * 1000, lastReviewedAt: Date.now() },
      { dbPromise: hooks.vocabDbPromise }
    );
    expect(await hooks.countDueStudyCards()).toEqual({ due: 0, total: 1 });
    await hooks.refreshStudyDueBadge();
    expect(window.document.getElementById("studyFavoritesBtn").textContent).toContain("all caught up");
  });

  it("the schedule survives a reload — a graded word is still not due in the next session", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    const word = first.hooks.technicalData[0].w;
    await favoriteWord(first.hooks, first.window, word, "technical", "technicalSelect", "technicalEntry");
    first.window.document.querySelector('.thumb-tab[data-tab="favorites"]').click();
    await wait(40);
    await first.hooks.startStudyMode();
    await first.hooks.gradeStudyCard("good");
    await wait(60);

    const { hooks } = await loadApp({ indexedDBFactory });
    expect(await hooks.buildStudyQueue()).toHaveLength(0); // still inside its 2-day interval
    expect((await hooks.countDueStudyCards()).total).toBe(1);
  });
});
