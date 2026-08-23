// Tests for the Dashboard's "Word of the Day" card — a small daily hook
// that shows the same word all day (deterministic by calendar date) and
// changes tomorrow, with its own favorite star and a tap-through to the
// full Vocabulary Bank entry.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

describe("wordOfTheDayEntry()", () => {
  it("is deterministic — the same calendar date always picks the same word", async () => {
    const { hooks } = await loadApp();
    const date = new Date(2026, 0, 15);
    const a = hooks.wordOfTheDayEntry(date);
    const b = hooks.wordOfTheDayEntry(date);
    expect(a).toBe(b);
    expect(a.w).toBeTruthy();
  });

  it("changes across different calendar dates, not the same word forever", async () => {
    const { hooks } = await loadApp();
    const words = new Set();
    for (let day = 1; day <= 20; day++) {
      words.add(hooks.wordOfTheDayEntry(new Date(2026, 0, day)).w);
    }
    expect(words.size).toBeGreaterThan(1);
  });
});

describe("Word of the Day card (Dashboard)", () => {
  it("renders today's word, its definition/example, and a working favorite star", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();

    const entry = hooks.wordOfTheDayEntry();
    const card = document.getElementById("wordOfTheDayCard");
    expect(card.textContent).toContain(entry.w);
    if (entry.senses && entry.senses[0]) {
      expect(card.textContent).toContain(entry.senses[0].use);
    }

    const toggle = card.querySelector(".fav-toggle");
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toBe("☆");
    toggle.click();
    expect(toggle.textContent).toBe("★");
    expect(hooks.favoriteKeys.has(entry.w.toLowerCase())).toBe(true);
  });

  it("clicking the card body (not the star) navigates to the word's full entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();

    const entry = hooks.wordOfTheDayEntry();
    document.querySelector("#wordOfTheDayCard .word-of-day-word").click();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
    expect(document.getElementById("vocabEntry").querySelector(".headword").textContent).toBe(entry.w);
  });

  it("clicking the star does NOT also navigate away from the Dashboard", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="dashboard"]').click();

    document.querySelector("#wordOfTheDayCard .fav-toggle").click();
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("dashboard");
  });
});
