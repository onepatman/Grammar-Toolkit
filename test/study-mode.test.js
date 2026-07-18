// Integration tests for Favorites "Study mode" — a spaced-repetition
// review flow layered on top of the existing Favorites list. Each card
// is the real entry (rendered via the same wordIndexMap action() a
// favorite row or search result already uses), so this file focuses on
// the parts that ARE new: the "Study my favorites" entry point, the due
// queue (js/spaced-repetition.js + VocabCache.reviewSchedule), the
// floating outcome bar, and persistence across a session.
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
  it("shows 'nothing due' instead of starting when there are no favorites at all", async () => {
    const { window, hooks } = await loadApp();
    await hooks.startStudyMode();
    expect(window.document.getElementById("studyStatus").textContent).toContain("Nothing due");
    expect(window.document.getElementById("studyBar").style.display).toBe("none");
  });

  it("opens the real entry for the first due favorite and shows the floating bar with correct progress", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });

    await hooks.startStudyMode();

    expect(document.getElementById("studyBar").style.display).not.toBe("none");
    expect(document.getElementById("studyProgressText").textContent).toBe("Card 1 of 1");
    // "tolerance" is a built-in Technical Term — landing on its real entry
    // proves this reused the normal wordIndexMap action(), not a stripped copy.
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("langbank");
    expect(document.getElementById("technicalEntry").querySelector(".headword").textContent).toBe("tolerance");
  });

  it("orders the queue most-overdue-first, with never-reviewed cards sorted before ones due later", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await VocabCache.addFavorite("torque", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    // "torque" was already reviewed and is overdue by a lot; "tolerance"
    // has never been reviewed (always due, sorts as maximally overdue).
    await VocabCache.putReviewSchedule(
      { word: "torque", level: 1, dueAt: Date.now() - 1000, lastReviewedAt: Date.now() - 100000 },
      { dbPromise: hooks.vocabDbPromise }
    );

    const queue = await hooks.buildStudyQueue();
    expect(queue.map((f) => f.word)).toEqual(["tolerance", "torque"]);
  });

  it("excludes a favorite that isn't due yet", async () => {
    const { hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await VocabCache.putReviewSchedule(
      { word: "tolerance", level: 3, dueAt: Date.now() + 1000 * 60 * 60 * 24 * 7, lastReviewedAt: Date.now() },
      { dbPromise: hooks.vocabDbPromise }
    );

    const queue = await hooks.buildStudyQueue();
    expect(queue).toEqual([]);
  });
});

describe("advancing through cards", () => {
  it("'Got it' advances the schedule forward and moves to the next card", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await VocabCache.addFavorite("torque", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode();

    const firstWord = hooks.getStudyQueue()[0].word;
    window.document.getElementById("studyGoodBtn").click();
    await wait(30);

    expect(window.document.getElementById("studyProgressText").textContent).toBe("Card 2 of 2");
    const schedule = await VocabCache.getReviewSchedule(firstWord, { dbPromise: hooks.vocabDbPromise });
    expect(schedule.level).toBe(1);
    expect(schedule.dueAt).toBeGreaterThan(Date.now());
  });

  it("'Still learning' resets the level and keeps it due again soon", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode();

    window.document.getElementById("studyAgainBtn").click();
    await wait(30);

    const schedule = await VocabCache.getReviewSchedule("tolerance", { dbPromise: hooks.vocabDbPromise });
    expect(schedule.level).toBe(0);
    expect(schedule.dueAt).toBeGreaterThan(Date.now());
  });

  it("finishing the last card hides the bar, returns to Favorites, and shows a completion message", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode();

    window.document.getElementById("studyGoodBtn").click();
    await wait(30);

    expect(window.document.getElementById("studyBar").style.display).toBe("none");
    expect(window.document.querySelector(".thumb-tab.active").dataset.tab).toBe("favorites");
    expect(window.document.getElementById("studyStatus").textContent).toContain("Reviewed 1 word");
  });

  it("Exit mid-deck hides the bar without losing already-recorded outcomes", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await VocabCache.addFavorite("torque", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode();

    const firstWord = hooks.getStudyQueue()[0].word;
    window.document.getElementById("studyGoodBtn").click();
    await wait(30);
    window.document.getElementById("studyExitBtn").click();
    await wait(30);

    expect(window.document.getElementById("studyBar").style.display).toBe("none");
    expect(window.document.querySelector(".thumb-tab.active").dataset.tab).toBe("favorites");
    const schedule = await VocabCache.getReviewSchedule(firstWord, { dbPromise: hooks.vocabDbPromise });
    expect(schedule).toBeTruthy(); // the one card reviewed before exiting kept its outcome
  });
});

describe("un-favoriting clears its study schedule", () => {
  it("removes the reviewSchedule record when a word is un-favorited", async () => {
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
  it("a schedule recorded in one session is respected by buildStudyQueue in the next", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: first.hooks.vocabDbPromise });
    await first.hooks.startStudyMode();
    first.window.document.getElementById("studyGoodBtn").click();
    await wait(50);

    const second = await loadApp({ indexedDBFactory });
    const queue = await second.hooks.buildStudyQueue();
    // Just reviewed with "Got it" -> due a couple days out, so it should
    // NOT show up as due again immediately in a fresh session.
    expect(queue.some((f) => f.word === "tolerance")).toBe(false);
  });
});
