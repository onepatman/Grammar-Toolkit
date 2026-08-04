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
});
