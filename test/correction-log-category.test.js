// Integration tests for filing a personal correction under whichever
// Fixes-tab category is currently selected in the mistakeSelect dropdown
// (e.g. "subject-verb agreement") instead of only ever landing in the one
// catch-all "my correction log" entry. There is no separate category
// picker in the Add box — the category comes straight from mistakeSelect,
// the same way each Language Bank category's own quick-add box operates
// on whichever category is currently active. Loads the real index.html
// in jsdom. See test/correction-log.test.js for the underlying pure
// groupCorrectionsByCategory() unit tests.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectMistakeCategory(window, category) {
  const select = window.document.getElementById("mistakeSelect");
  select.value = category;
  select.dispatchEvent(new window.Event("change"));
}

describe("Fixes tab — Add box has no separate category picker", () => {
  it("no qaCategorySelect element exists anymore — redundant with mistakeSelect above", async () => {
    const { window } = await loadApp();
    expect(window.document.getElementById("qaCategorySelect")).toBeNull();
  });

  it("the Add label reflects whichever category is currently selected above, and updates when it changes", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    selectMistakeCategory(window, hooks.CORRECTION_LOG_ENTRY.w);
    expect(document.getElementById("correctionAddLabel").textContent).toContain(hooks.CORRECTION_LOG_ENTRY.w);

    selectMistakeCategory(window, "subject-verb agreement");
    expect(document.getElementById("correctionAddLabel").textContent).toContain("subject-verb agreement");
  });
});

describe("Fixes tab — filing a correction under whichever category is selected", () => {
  it("adds to the general correction log when that's the category currently selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    selectMistakeCategory(window, hooks.CORRECTION_LOG_ENTRY.w);

    document.getElementById("qaWrongInput").value = "My cousin visit us";
    document.getElementById("qaRightInput").value = "My cousin visits us";
    document.getElementById("qaAddBtn").click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved).toHaveLength(1);
    expect(saved[0].category).toBe(hooks.CORRECTION_LOG_ENTRY.w);
    expect(document.getElementById("mistakeEntry").textContent).toContain("My cousin visit us");
  });

  it("adds to whichever OTHER category is currently selected, and it shows up there — not the general log", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    selectMistakeCategory(window, "subject-verb agreement");

    document.getElementById("qaWrongInput").value = "The engineer and the technician is on-site";
    document.getElementById("qaRightInput").value = "The engineer and the technician are on-site";
    document.getElementById("qaWhyInput").value = "compound subjects take a plural verb";
    document.getElementById("qaAddBtn").click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved[0].category).toBe("subject-verb agreement");

    // Shows up under "subject-verb agreement"...
    expect(document.getElementById("mistakeEntry").textContent).toContain("The engineer and the technician is on-site");
    expect(document.querySelectorAll("#mistakeEntry .edit-correction-btn").length).toBeGreaterThan(0);

    // ...and NOT under the general correction log.
    selectMistakeCategory(window, hooks.CORRECTION_LOG_ENTRY.w);
    expect(document.getElementById("mistakeEntry").textContent).not.toContain("The engineer and the technician is on-site");
  });

  it("Edit keeps updating the SAME category the entry was already filed under", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    selectMistakeCategory(window, "subject-verb agreement");
    document.getElementById("qaWrongInput").value = "My cousin visit us";
    document.getElementById("qaRightInput").value = "My cousin visits us";
    document.getElementById("qaAddBtn").click();
    await wait();

    // Edit is only reachable from within the category it's already
    // rendered under, so mistakeSelect is already on "subject-verb
    // agreement" here — no separate category input to worry about.
    document.querySelector("#mistakeEntry .edit-correction-btn").click();
    document.getElementById("qaRightInput").value = "My cousin always visits us";
    document.getElementById("qaAddBtn").click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved[0].category).toBe("subject-verb agreement");
    expect(saved[0].right).toBe("My cousin always visits us");
    expect(document.getElementById("mistakeEntry").textContent).toContain("My cousin always visits us");
  });

  it("re-derives category-filed senses correctly from storage on a fresh rebuild — what happens on every real page load", async () => {
    // The correction log is localStorage-backed (see js/correction-log.js),
    // and localStorage isn't shared across two separate loadApp() jsdom
    // instances the way the passed-in IDBFactory is — so a real "close and
    // reopen" can't be simulated the same way IndexedDB-backed features'
    // tests do it. Instead this exercises the exact function a real page
    // load calls (rebuildCorrectionLog(), reading straight from storage)
    // after writing storage directly, which is a faithful stand-in.
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.savePersonalCorrections([
      { id: "pc_1", wrong: "My cousin visit us", right: "My cousin visits us", why: "", category: "subject-verb agreement" }
    ]);
    hooks.rebuildCorrectionLog();

    selectMistakeCategory(window, "subject-verb agreement");
    expect(document.getElementById("mistakeEntry").textContent).toContain("My cousin visit us");

    selectMistakeCategory(window, hooks.CORRECTION_LOG_ENTRY.w);
    expect(document.getElementById("mistakeEntry").textContent).not.toContain("My cousin visit us");
  });

  it("Delete removes a category-filed correction from that category's rendering", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    selectMistakeCategory(window, "subject-verb agreement");
    document.getElementById("qaWrongInput").value = "My cousin visit us";
    document.getElementById("qaRightInput").value = "My cousin visits us";
    document.getElementById("qaAddBtn").click();
    await wait();

    expect(document.getElementById("mistakeEntry").textContent).toContain("My cousin visit us");

    window.confirm = () => true;
    document.querySelector("#mistakeEntry .delete-correction-btn").click();
    await wait();

    expect(hooks.loadPersonalCorrections()).toHaveLength(0);
    expect(document.getElementById("mistakeEntry").textContent).not.toContain("My cousin visit us");
  });
});
