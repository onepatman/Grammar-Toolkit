// Unit tests for js/spaced-repetition.js — the pure Leitner-style
// scheduling math behind the Favorites "Study mode". No DOM involved;
// this only exercises nextReviewState()/isDue() directly.
import { describe, it, expect } from "vitest";
import SpacedRepetition from "../js/spaced-repetition.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("nextReviewState()", () => {
  it("starts a never-reviewed card at level 0 and schedules it 1 day out on a good answer", () => {
    const now = 1_000_000;
    const next = SpacedRepetition.nextReviewState(null, "good", now);
    expect(next.level).toBe(1);
    expect(next.dueAt).toBe(now + 2 * DAY_MS);
    expect(next.lastReviewedAt).toBe(now);
  });

  it("starts a never-reviewed card at level 0 and schedules it 1 day out on a missed answer too", () => {
    const now = 1_000_000;
    const next = SpacedRepetition.nextReviewState(undefined, "again", now);
    expect(next.level).toBe(0);
    expect(next.dueAt).toBe(now + 1 * DAY_MS);
  });

  it("advances the level and lengthens the interval on repeated good answers", () => {
    const now = 0;
    let state = null;
    const levelsSeen = [];
    for (let i = 0; i < 6; i++) {
      state = SpacedRepetition.nextReviewState(state, "good", now);
      levelsSeen.push(state.level);
    }
    expect(levelsSeen).toEqual([1, 2, 3, 4, 5, 5]); // caps at MAX_LEVEL
    expect(SpacedRepetition.INTERVAL_DAYS[5]).toBe(30);
    expect(state.dueAt).toBe(now + 30 * DAY_MS);
  });

  it("resets a high level straight back to level 0 on a missed answer", () => {
    const now = 0;
    const highLevel = { level: 4, dueAt: 999, lastReviewedAt: 1 };
    const next = SpacedRepetition.nextReviewState(highLevel, "again", now);
    expect(next.level).toBe(0);
    expect(next.dueAt).toBe(now + 1 * DAY_MS);
  });

  it("throws on an unrecognized outcome instead of silently miscomputing a schedule", () => {
    expect(() => SpacedRepetition.nextReviewState(null, "maybe", 0)).toThrow();
  });

  it("defaults `now` to Date.now() when omitted", () => {
    const before = Date.now();
    const next = SpacedRepetition.nextReviewState(null, "good");
    const after = Date.now();
    expect(next.lastReviewedAt).toBeGreaterThanOrEqual(before);
    expect(next.lastReviewedAt).toBeLessThanOrEqual(after);
  });
});

describe("isDue()", () => {
  it("is always due when there's no schedule yet (never reviewed)", () => {
    expect(SpacedRepetition.isDue(null, 0)).toBe(true);
    expect(SpacedRepetition.isDue(undefined, 0)).toBe(true);
  });

  it("is due once dueAt has passed", () => {
    expect(SpacedRepetition.isDue({ dueAt: 100 }, 150)).toBe(true);
    expect(SpacedRepetition.isDue({ dueAt: 100 }, 100)).toBe(true); // inclusive
  });

  it("is not due before dueAt", () => {
    expect(SpacedRepetition.isDue({ dueAt: 200 }, 100)).toBe(false);
  });
});
