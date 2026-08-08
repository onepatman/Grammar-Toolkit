// Integration tests for the Progress Dashboard tab — the app's new
// default/landing tab. Loads the real index.html in jsdom and dispatches
// real DOM clicks, same conventions as favorites.test.js / notes.test.js.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Progress Dashboard is the app's default/landing tab", () => {
  it("is the active tab and visible panel on load, with no click needed", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("dashboard");
    expect(document.getElementById("panel-dashboard").style.display).not.toBe("none");
    expect(document.getElementById("panel-vocab").style.display).toBe("none");
  });

  it("paints stat tiles, charts, and calendar without waiting for a click (cache-restore promises awaited on load)", async () => {
    const { window, hooks } = await loadApp();
    await hooks.notesCacheRestorePromise;
    await wait(30);
    const document = window.document;
    expect(document.querySelectorAll("#dashboardStats .dashboard-stat-tile").length).toBe(7);
    expect(document.getElementById("dashboardStreakCalendar").children.length).toBeGreaterThan(0);
  });

  it("switching to another tab and back re-renders the dashboard fresh", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="vocab"]').click();
    expect(document.getElementById("panel-dashboard").style.display).toBe("none");
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);
    expect(document.getElementById("panel-dashboard").style.display).not.toBe("none");
    expect(document.querySelectorAll("#dashboardStats .dashboard-stat-tile").length).toBe(7);
  });
});

describe("Dashboard stat tiles reflect real app data", () => {
  it("shows the full built-in Vocabulary Bank count (built-in seed words have no addedAt, but still count toward the total)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await wait(30);
    const vocabTile = Array.from(document.querySelectorAll("#dashboardStats .dashboard-stat-tile"))
      .find((t) => t.textContent.includes("Vocabulary words"));
    expect(vocabTile.querySelector(".dashboard-stat-value").textContent).toBe(String(hooks.vocabData.length));
  });

  it("counts written notes and favorites", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addNoteEntry({title: "a note", body: "content"}, {persist: true});
    hooks.runSearchPipeline("abandon");
    Array.from(document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("Vocabulary Bank"))
      .click();
    document.querySelector("#vocabEntry .fav-toggle").click();

    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);

    const notesTile = Array.from(document.querySelectorAll("#dashboardStats .dashboard-stat-tile"))
      .find((t) => t.textContent.includes("Notes written"));
    expect(notesTile.querySelector(".dashboard-stat-value").textContent).toBe("1");
    const favTile = Array.from(document.querySelectorAll("#dashboardStats .dashboard-stat-tile"))
      .find((t) => t.textContent.includes("Favorites"));
    expect(favTile.querySelector(".dashboard-stat-value").textContent).toBe("1");
  });

  it("shows an em dash for avg. accuracy when no Practice sessions exist yet", async () => {
    const { window } = await loadApp();
    const document = window.document;
    await wait(30);
    const accTile = Array.from(document.querySelectorAll("#dashboardStats .dashboard-stat-tile"))
      .find((t) => t.textContent.includes("Avg. accuracy"));
    expect(accTile.querySelector(".dashboard-stat-value").textContent).toBe("—");
  });

  it("averages accuracy across recorded Practice sessions", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await window.VocabCache.addPracticeHistory(
      {mode: "mcq", source: "vocab", completedAt: Date.now(), correct: 8, total: 10, percentage: 80, rating: "good"},
      {dbPromise: hooks.vocabDbPromise}
    );
    await window.VocabCache.addPracticeHistory(
      {mode: "spelling", source: "vocab", completedAt: Date.now(), correct: 6, total: 10, percentage: 60, rating: "ok"},
      {dbPromise: hooks.vocabDbPromise}
    );
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);

    const accTile = Array.from(document.querySelectorAll("#dashboardStats .dashboard-stat-tile"))
      .find((t) => t.textContent.includes("Avg. accuracy"));
    expect(accTile.querySelector(".dashboard-stat-value").textContent).toBe("70%");
    const sessionsTile = Array.from(document.querySelectorAll("#dashboardStats .dashboard-stat-tile"))
      .find((t) => t.textContent.includes("Practice sessions"));
    expect(sessionsTile.querySelector(".dashboard-stat-value").textContent).toBe("2");
  });
});

describe("Dashboard weekly-added chart and streak", () => {
  it("shows the empty-state message when nothing has ever been added (built-in seed carries no addedAt)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    await wait(30);
    expect(document.getElementById("dashboardWeeklyChart").textContent).toContain("Nothing here yet");
  });

  it("a note written today shows up in this week's bar and sets the streak to 1", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addNoteEntry({title: "today's note", body: "content"}, {persist: true});
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);

    const bars = document.querySelectorAll("#dashboardWeeklyChart .dashboard-bar-col");
    expect(bars.length).toBe(12);
    const lastBar = bars[bars.length - 1];
    expect(Number(lastBar.dataset.value)).toBeGreaterThanOrEqual(1);

    const streakTile = Array.from(document.querySelectorAll("#dashboardStats .dashboard-stat-tile"))
      .find((t) => t.textContent.includes("Day streak"));
    expect(streakTile.querySelector(".dashboard-stat-value").textContent).toBe("1");
    expect(document.getElementById("dashboardStreakLabel").textContent).toContain("1 day");
  });

  it("today's calendar cell is shaded once there's activity", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addNoteEntry({title: "today's note", body: "content"}, {persist: true});
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);

    const todayKey = hooks.dashboardDateKey(new Date());
    const todayCell = document.querySelector(`.dashboard-cal-cell[data-date="${todayKey}"]`);
    expect(todayCell).toBeTruthy();
    expect(Number(todayCell.dataset.count)).toBeGreaterThanOrEqual(1);
    expect(todayCell.style.background).not.toBe("var(--rule)");
  });
});

describe("Dashboard practice-accuracy chart", () => {
  it("shows the empty-state message when no Practice sessions have been recorded", async () => {
    const { window } = await loadApp();
    const document = window.document;
    await wait(30);
    expect(document.getElementById("dashboardAccuracyChart").textContent).toContain("Nothing here yet");
  });

  it("renders one bar per recorded session, oldest first, and notes that Flashcards isn't included", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const earlier = Date.now() - 60000;
    await window.VocabCache.addPracticeHistory(
      {mode: "mcq", source: "vocab", completedAt: earlier, correct: 5, total: 10, percentage: 50, rating: "ok"},
      {dbPromise: hooks.vocabDbPromise}
    );
    await window.VocabCache.addPracticeHistory(
      {mode: "spelling", source: "vocab", completedAt: Date.now(), correct: 9, total: 10, percentage: 90, rating: "good"},
      {dbPromise: hooks.vocabDbPromise}
    );
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);

    const bars = document.querySelectorAll("#dashboardAccuracyChart .dashboard-bar-col");
    expect(bars.length).toBe(2);
    expect(Number(bars[0].dataset.value)).toBe(50);
    expect(Number(bars[1].dataset.value)).toBe(90);
    expect(document.getElementById("dashboardAccuracyCount").textContent).toBe("2");
    expect(document.getElementById("dashboardAccuracyNote").textContent).toContain("Flashcards");
  });
});

describe("Dashboard error patterns (Personal Error Pattern Tracker)", () => {
  it("shows the empty-state message when nothing has been missed yet", async () => {
    const { window } = await loadApp();
    const document = window.document;
    await wait(30);
    expect(document.getElementById("dashboardErrorPatterns").textContent).toContain("No recurring mistakes yet");
  });

  it("shows the empty-state message when a word was only missed once (not yet a 'pattern')", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await window.VocabCache.addErrorLogEntry(
      { word: "affect", mode: "spelling", source: "vocab", question: "Spell it", userAnswer: "efect", correctAnswer: "affect", timestamp: Date.now() },
      { dbPromise: hooks.vocabDbPromise }
    );
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);
    expect(document.getElementById("dashboardErrorPatterns").textContent).toContain("No recurring mistakes yet");
  });

  it("lists a word missed more than once, with its total miss count, ranked highest first", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const addMiss = (word, ts) => window.VocabCache.addErrorLogEntry(
      { word, mode: "spelling", source: "vocab", question: "Spell it", userAnswer: "x", correctAnswer: word, timestamp: ts },
      { dbPromise: hooks.vocabDbPromise }
    );
    await addMiss("affect", Date.now() - 3000);
    await addMiss("affect", Date.now() - 2000);
    await addMiss("affect", Date.now() - 1000);
    await addMiss("effect", Date.now());

    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);

    const rows = Array.from(document.querySelectorAll("#dashboardErrorPatterns .dashboard-error-row"));
    expect(rows.length).toBe(1);
    expect(rows[0].dataset.word).toBe("affect");
    expect(rows[0].querySelector(".dashboard-error-count").textContent).toContain("3");
  });

  it("treats the same word case-insensitively as one recurring pattern", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const addMiss = (word) => window.VocabCache.addErrorLogEntry(
      { word, mode: "mcq", source: "vocab", question: "q", userAnswer: "x", correctAnswer: word, timestamp: Date.now() },
      { dbPromise: hooks.vocabDbPromise }
    );
    await addMiss("Affect");
    await addMiss("affect");

    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);

    const rows = document.querySelectorAll("#dashboardErrorPatterns .dashboard-error-row");
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector(".dashboard-error-count").textContent).toContain("2");
  });
});

describe("Dashboard pure aggregation helpers", () => {
  it("collectDashboardAddedEntries only counts owner-added content, never built-in seed data", async () => {
    const { hooks } = await loadApp();
    expect(hooks.collectDashboardAddedEntries()).toEqual([]);
    hooks.addNoteEntry({title: "n", body: "b"}, {persist: true});
    expect(hooks.collectDashboardAddedEntries()).toHaveLength(1);
  });

  it("computeDashboardStreak counts consecutive active days, treating a still-open today as not yet broken", async () => {
    const { hooks } = await loadApp();
    const oneDay = 24 * 60 * 60 * 1000;
    const today = new Date();
    const yesterday = new Date(today.getTime() - oneDay);
    const twoDaysAgo = new Date(today.getTime() - 2 * oneDay);
    const counts = new Map([
      [hooks.dashboardDateKey(yesterday), 1],
      [hooks.dashboardDateKey(twoDaysAgo), 1]
    ]);
    // No activity today yet — streak should still count yesterday and the day before.
    expect(hooks.computeDashboardStreak(counts)).toBe(2);

    counts.set(hooks.dashboardDateKey(today), 1);
    expect(hooks.computeDashboardStreak(counts)).toBe(3);

    const gappedCounts = new Map([[hooks.dashboardDateKey(twoDaysAgo), 1]]);
    // Yesterday is missing, so a streak ending today/yesterday is 0.
    expect(hooks.computeDashboardStreak(gappedCounts)).toBe(0);
  });

  it("bucketTimestampsByWeek(timestamps, weeksBack) puts a 'right now' timestamp in the last bucket", async () => {
    const { hooks } = await loadApp();
    const bars = hooks.bucketTimestampsByWeek([Date.now()], 12);
    expect(bars).toHaveLength(12);
    expect(bars[11].value).toBe(1);
    expect(bars.slice(0, 11).every((b) => b.value === 0)).toBe(true);
  });

  it("collectTopErrorPatterns groups by normalized word, counts misses, and sorts by count desc then most-recent", async () => {
    const { hooks } = await loadApp();
    const log = [
      { word: "affect", mode: "spelling", timestamp: 1000 },
      { word: "Affect", mode: "mcq", timestamp: 2000 },
      { word: "effect", mode: "spelling", timestamp: 500 },
      { word: "effect", mode: "spelling", timestamp: 1500 },
      { word: "effect", mode: "spelling", timestamp: 3000 },
    ];
    const patterns = hooks.collectTopErrorPatterns(log, 10, 1);
    expect(patterns[0]).toEqual({ word: "effect", count: 3, lastMissedAt: 3000, modes: ["spelling"] });
    expect(patterns[1].word).toBe("affect");
    expect(patterns[1].count).toBe(2);
    expect(patterns[1].modes.sort()).toEqual(["mcq", "spelling"]);
  });

  it("collectTopErrorPatterns respects the minCount filter (default excludes one-off misses when called with 2)", async () => {
    const { hooks } = await loadApp();
    const log = [
      { word: "once", mode: "mcq", timestamp: 1000 },
      { word: "twice", mode: "mcq", timestamp: 1000 },
      { word: "twice", mode: "mcq", timestamp: 2000 },
    ];
    const patterns = hooks.collectTopErrorPatterns(log, 10, 2);
    expect(patterns.map((p) => p.word)).toEqual(["twice"]);
  });

  it("collectTopErrorPatterns respects the limit cap", async () => {
    const { hooks } = await loadApp();
    const log = Array.from({ length: 5 }, (_, i) => ([
      { word: `word${i}`, mode: "mcq", timestamp: 1000 },
      { word: `word${i}`, mode: "mcq", timestamp: 2000 }
    ])).flat();
    const patterns = hooks.collectTopErrorPatterns(log, 3, 1);
    expect(patterns).toHaveLength(3);
  });
});

// estimateIeltsBand() is a rough, transparent, OFFLINE estimate — it
// never calls any grading API itself, it only combines signals already
// produced elsewhere (Journal's LanguageTool-based clarity score,
// Practice accuracy, recurring error patterns). These tests pin down
// its exact arithmetic so a future change to the formula is deliberate,
// not accidental.
describe("estimateIeltsBand (pure aggregation helper for the IELTS Band-Score estimate)", () => {
  function gradedEntry(id, score, wordCount, checkedAt, bodyWords) {
    return {
      id,
      body: bodyWords,
      grading: { status: "graded", score, wordCount, checkedAt, corrections: [] }
    };
  }

  it("reports insufficientData with zero graded entries", async () => {
    const { hooks } = await loadApp();
    const result = hooks.estimateIeltsBand([], [], []);
    expect(result.insufficientData).toBe(true);
    expect(result.overallBand).toBeNull();
    expect(result.criteria).toBeNull();
    expect(result.basis.gradedEntryCount).toBe(0);
  });

  it("still reports insufficientData with only one graded entry (needs at least 2)", async () => {
    const { hooks } = await loadApp();
    const entries = [gradedEntry("j1", 8, 100, 1000, "one two three")];
    const result = hooks.estimateIeltsBand(entries, [], []);
    expect(result.insufficientData).toBe(true);
    expect(result.basis.gradedEntryCount).toBe(1);
  });

  it("ignores entries that are pending/checking/unavailable when counting graded entries", async () => {
    const { hooks } = await loadApp();
    const entries = [
      gradedEntry("j1", 9, 100, 1000, "one two three"),
      { id: "j2", body: "b", grading: { status: "pending" } },
      { id: "j3", body: "b", grading: { status: "checking" } },
      { id: "j4", body: "b", grading: { status: "unavailable", reason: "offline" } }
    ];
    const result = hooks.estimateIeltsBand(entries, [], []);
    expect(result.insufficientData).toBe(true);
    expect(result.basis.gradedEntryCount).toBe(1);
  });

  it("computes the exact band + 4-criteria breakdown for a known input", async () => {
    const { hooks } = await loadApp();
    // Two graded entries, each score 10/10, wordCount 150 (== the IELTS
    // Task 2 target), pooled vocabulary is 10 unique words repeated
    // once each (diversity 0.5). Practice: two sessions averaging 95%.
    // No recurring error patterns.
    const entries = [
      gradedEntry("j1", 10, 150, 2000, "one two three four five six seven eight nine ten"),
      gradedEntry("j2", 10, 150, 1000, "one two three four five six seven eight nine ten")
    ];
    const practiceHistory = [
      { completedAt: 1000, percentage: 90 },
      { completedAt: 2000, percentage: 100 }
    ];
    const result = hooks.estimateIeltsBand(entries, practiceHistory, []);
    expect(result.insufficientData).toBe(false);
    expect(result.criteria.grammaticalRangeAccuracy).toBe(9);
    expect(result.criteria.taskResponse).toBe(7.5);
    expect(result.criteria.lexicalResource).toBe(8);
    expect(result.criteria.coherenceCohesion).toBe(9);
    expect(result.overallBand).toBe(8.5);
    expect(result.basis.gradedEntryCount).toBe(2);
    expect(result.basis.avgWordCount).toBe(150);
    expect(result.basis.avgClarityScore).toBe(10);
    expect(result.basis.vocabDiversity).toBe(0.5);
    expect(result.basis.avgPracticeAccuracy).toBe(95);
  });

  it("lowers Coherence & Cohesion for recurring error patterns and low practice accuracy", async () => {
    const { hooks } = await loadApp();
    const entries = [
      gradedEntry("j1", 10, 150, 2000, "one two three four five six seven eight nine ten"),
      gradedEntry("j2", 10, 150, 1000, "one two three four five six seven eight nine ten")
    ];
    const practiceHistory = [{ completedAt: 1000, percentage: 50 }];
    const errorPatterns = [{ word: "affect" }, { word: "necessary" }, { word: "receive" }];
    const result = hooks.estimateIeltsBand(entries, practiceHistory, errorPatterns);
    expect(result.criteria.coherenceCohesion).toBe(7);
    expect(result.basis.recurringErrorCount).toBe(3);
    expect(result.basis.avgPracticeAccuracy).toBe(50);
  });

  it("leaves avgPracticeAccuracy null when there's no Practice history yet, without crashing", async () => {
    const { hooks } = await loadApp();
    const entries = [
      gradedEntry("j1", 10, 150, 2000, "one two three four five six seven eight nine ten"),
      gradedEntry("j2", 10, 150, 1000, "one two three four five six seven eight nine ten")
    ];
    const result = hooks.estimateIeltsBand(entries, [], []);
    expect(result.basis.avgPracticeAccuracy).toBeNull();
    expect(result.criteria.coherenceCohesion).toBe(9);
  });

  it("only considers the most recent 10 graded entries (sorted by grading.checkedAt)", async () => {
    const { hooks } = await loadApp();
    const entries = Array.from({ length: 12 }, (_, i) =>
      gradedEntry(`j${i}`, 8, 100, i * 1000, "alpha beta gamma")
    );
    const result = hooks.estimateIeltsBand(entries, [], []);
    expect(result.basis.gradedEntryCount).toBe(10);
  });

  it("never reports a band below 3 or above 9 for any criterion", async () => {
    const { hooks } = await loadApp();
    // Worst-case inputs: near-zero clarity score, tiny word count, no
    // vocabulary variety, many recurring errors, poor practice accuracy.
    const entries = [
      gradedEntry("j1", 0, 5, 2000, "bad bad bad bad bad"),
      gradedEntry("j2", 0, 5, 1000, "bad bad bad bad bad")
    ];
    const practiceHistory = [{ completedAt: 1000, percentage: 0 }];
    const errorPatterns = Array.from({ length: 20 }, (_, i) => ({ word: `w${i}` }));
    const result = hooks.estimateIeltsBand(entries, practiceHistory, errorPatterns);
    Object.values(result.criteria).forEach((band) => {
      expect(band).toBeGreaterThanOrEqual(3);
      expect(band).toBeLessThanOrEqual(9);
    });
    expect(result.overallBand).toBeGreaterThanOrEqual(3);
    expect(result.overallBand).toBeLessThanOrEqual(9);
  });
});

describe("Dashboard IELTS Band-Score section", () => {
  it("shows a locked/insufficient-data message when fewer than 2 Journal entries are graded", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);
    const el = document.getElementById("dashboardIeltsBand");
    expect(el.textContent).toContain("Grade at least 2 Journal entries");
    expect(el.querySelector(".ielts-band-overall")).toBeFalsy();
  });

  it("renders the overall band and all 4 criteria once at least 2 Journal entries are graded", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addJournalEntry(
      { title: "e1", body: "one two three four five six seven eight nine ten", grading: { status: "graded", score: 10, wordCount: 150, checkedAt: 2000, corrections: [] } },
      { persist: true }
    );
    hooks.addJournalEntry(
      { title: "e2", body: "one two three four five six seven eight nine ten", grading: { status: "graded", score: 10, wordCount: 150, checkedAt: 1000, corrections: [] } },
      { persist: true }
    );

    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();
    await wait(30);

    const el = document.getElementById("dashboardIeltsBand");
    expect(el.querySelector(".ielts-band-overall-value").textContent).toBe("8.5");
    const criteriaRows = el.querySelectorAll(".ielts-band-criterion");
    expect(criteriaRows.length).toBe(4);
    expect(el.textContent).toContain("Task Response");
    expect(el.textContent).toContain("Coherence & Cohesion");
    expect(el.textContent).toContain("Lexical Resource");
    expect(el.textContent).toContain("Grammatical Range & Accuracy");
    expect(el.textContent).toContain("2 graded Journal entries");
    expect(el.textContent).toContain("not an official IELTS score");
  });
});
