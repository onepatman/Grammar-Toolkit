// Tests for the Favorites tab's swipe-to-remove gesture and the Undo
// toast it triggers. jsdom has no native PointerEvent constructor, so a
// swipe is simulated with plain Events carrying manually-set
// clientX/clientY — the app's handlers only ever read those two
// properties off the event, so this is a faithful stand-in for a real
// touch/mouse drag.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 40) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pointerEvent(window, type, x, y) {
  const evt = new window.Event(type, { bubbles: true, cancelable: true });
  evt.clientX = x;
  evt.clientY = y;
  return evt;
}

// fromX -> toX as absolute clientX coordinates (not deltas), matching
// how a real drag reports positions. The first intermediate move always
// exceeds the handler's 10px "is this a horizontal swipe?" threshold.
function swipe(window, row, fromX, toX, y = 100) {
  const dir = toX < fromX ? -15 : 15;
  row.dispatchEvent(pointerEvent(window, "pointerdown", fromX, y));
  row.dispatchEvent(pointerEvent(window, "pointermove", fromX + dir, y));
  row.dispatchEvent(pointerEvent(window, "pointermove", toX, y));
  row.dispatchEvent(pointerEvent(window, "pointerup", toX, y));
}

async function favoriteAbandon(hooks, document) {
  hooks.runSearchPipeline("abandon");
  Array.from(document.querySelectorAll("#searchResults .search-result-item"))
    .find((el) => el.textContent.includes("Vocabulary Bank"))
    .click();
  document.querySelector("#vocabEntry .fav-toggle").click();
}

// Polls instead of a single fixed wait — renderFavoritesTab() reads from
// IndexedDB asynchronously, and a fixed short wait was occasionally too
// short under CPU contention (a cold test-worker's very first async
// render can take longer than a warmed-up one), producing an
// intermittent false failure unrelated to the app itself. Only a real
// row satisfies the wait — landing on the empty state instead means the
// favorite genuinely never got added, which should fail loudly, not
// silently pass through as "done rendering".
async function openFavoritesTab(document, timeoutMs = 2000) {
  document.querySelector('.thumb-tab[data-tab="favorites"]').click();
  const deadline = Date.now() + timeoutMs;
  while (!document.getElementById("favoritesList").querySelector(".search-result-item")) {
    if (Date.now() > deadline) {
      throw new Error(`Favorites tab never rendered a row — favoritesList currently: ${document.getElementById("favoritesList").innerHTML.slice(0, 200)}`);
    }
    await wait(20);
  }
}

describe("Favorites — swipe left to remove, with Undo", () => {
  it("swiping a row past the threshold removes the favorite and shows an Undo toast", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await favoriteAbandon(hooks, document);
    await openFavoritesTab(document);

    const row = document.querySelector("#favoritesList .search-result-item");
    swipe(window, row, 300, 150);
    await wait(250); // the row's own 160ms fade-out before it's actually removed

    expect(hooks.favoriteKeys.has("abandon")).toBe(false);
    expect(document.getElementById("favoritesList").textContent).toContain("No favorites yet");

    const toast = document.getElementById("appToast");
    expect(toast.style.display).toBe("flex");
    expect(document.getElementById("appToastMessage").textContent).toContain("abandon");
  });

  it("clicking Undo on the toast restores the removed favorite", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await favoriteAbandon(hooks, document);
    await openFavoritesTab(document);

    const row = document.querySelector("#favoritesList .search-result-item");
    swipe(window, row, 300, 150);
    await wait(250);
    expect(hooks.favoriteKeys.has("abandon")).toBe(false);

    document.getElementById("appToastUndoBtn").click();
    await wait(50);

    expect(hooks.favoriteKeys.has("abandon")).toBe(true);
    expect(document.getElementById("favoritesList").textContent).toContain("abandon");
    expect(document.getElementById("appToast").style.display).toBe("none");
  });

  it("a short swipe that doesn't cross the threshold snaps back without removing anything", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await favoriteAbandon(hooks, document);
    await openFavoritesTab(document);

    const row = document.querySelector("#favoritesList .search-result-item");
    swipe(window, row, 300, 280); // only 20px, well under the 90px threshold
    await wait(250);

    expect(hooks.favoriteKeys.has("abandon")).toBe(true);
    expect(document.getElementById("favoritesList").textContent).toContain("abandon");
    expect(document.getElementById("appToast").style.display).toBe("none");
  });

  it("a plain click (no drag) is unaffected — still navigates straight to the entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await favoriteAbandon(hooks, document);
    await openFavoritesTab(document);

    const row = document.querySelector("#favoritesList .search-result-item");
    row.click();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("vocab");
  });

  it("the toast auto-hides after its timeout", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await favoriteAbandon(hooks, document);
    await openFavoritesTab(document);

    hooks.showUndoToast("Test message", () => {}, 30);
    expect(document.getElementById("appToast").style.display).toBe("flex");
    await wait(80);
    expect(document.getElementById("appToast").style.display).toBe("none");
  });
});
