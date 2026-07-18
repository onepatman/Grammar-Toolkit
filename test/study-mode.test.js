// Integration tests for Favorites "Study mode" — a flashcard-style
// browser through the Favorites list. Each card is the real entry
// (rendered via the same wordIndexMap action() a favorite row or
// search result already uses), so this file focuses on the parts that
// ARE new: the "Study my favorites" entry point, the queue (every
// favorite, in Favorites-list order, no filtering or scheduling), and
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
    expect(document.getElementById("studyProgressText").textContent).toBe("1 / 1");
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
    expect(window.document.getElementById("studyProgressText").textContent).toBe("1 / 2");

    window.document.getElementById("studyNextBtn").click();

    expect(window.document.getElementById("studyProgressText").textContent).toBe("2 / 2");
    expect(window.document.getElementById("technicalEntry").querySelector(".headword").textContent).toBe("tolerance");
  });

  it("Next wraps from the last card back to the first — never ends the session on its own", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode();

    window.document.getElementById("studyNextBtn").click(); // only 1 card -> wraps to itself
    await wait(10);

    expect(window.document.getElementById("studyBar").style.display).not.toBe("none");
    expect(window.document.getElementById("studyProgressText").textContent).toBe("1 / 1");
  });

  it("Previous wraps from the first card to the last", async () => {
    const { window, hooks } = await loadApp();
    await VocabCache.addFavorite("tolerance", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await wait(5);
    await VocabCache.addFavorite("torque", { cat: "Technical Term" }, { dbPromise: hooks.vocabDbPromise });
    await hooks.startStudyMode(); // starts on card 1 ("torque", newest-favorited)

    window.document.getElementById("studyPrevBtn").click();

    expect(window.document.getElementById("studyProgressText").textContent).toBe("2 / 2");
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
    expect(window.document.getElementById("studyProgressText").textContent).toMatch(/\d \/ 2/);
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
    expect(window.document.getElementById("studyProgressText").textContent).toBe("1 / 1");
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

describe("un-favoriting clears its (legacy) study schedule record", () => {
  it("removes any stale reviewSchedule record when a word is un-favorited", async () => {
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
