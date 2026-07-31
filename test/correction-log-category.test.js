// Integration tests for filing a personal correction under an existing
// Fixes-tab category (e.g. "subject-verb agreement") instead of only ever
// landing in the one catch-all "my correction log" entry. Loads the real
// index.html in jsdom. See test/correction-log.test.js for the underlying
// pure groupCorrectionsByCategory() unit tests.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Fixes tab — filing a correction under an existing category", () => {
  it("populates the 'File under' select with the general log pinned first, then every other category alphabetically", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const select = document.getElementById("qaCategorySelect");
    expect(select.options.length).toBe(hooks.mistakeData.length);
    expect(select.options[0].value).toBe(hooks.CORRECTION_LOG_ENTRY.w);
    expect(select.value).toBe(hooks.CORRECTION_LOG_ENTRY.w);
    // Every other option present and sorted.
    const rest = Array.from(select.options).slice(1).map((o) => o.value);
    const sorted = rest.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    expect(rest).toEqual(sorted);
    expect(rest).toContain("subject-verb agreement");
  });

  it("defaults to the general correction log when nothing else is chosen — unchanged prior behavior", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("qaWrongInput").value = "My cousin visit us";
    document.getElementById("qaRightInput").value = "My cousin visits us";
    document.getElementById("qaAddBtn").click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved).toHaveLength(1);
    expect(saved[0].category).toBe(hooks.CORRECTION_LOG_ENTRY.w);

    document.getElementById("mistakeSelect").value = hooks.CORRECTION_LOG_ENTRY.w;
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("mistakeEntry").textContent).toContain("My cousin visit us");
  });

  it("files a correction under a chosen category, and it shows up under THAT category, not the general log", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("qaWrongInput").value = "The engineer and the technician is on-site";
    document.getElementById("qaRightInput").value = "The engineer and the technician are on-site";
    document.getElementById("qaWhyInput").value = "compound subjects take a plural verb";
    document.getElementById("qaCategorySelect").value = "subject-verb agreement";
    document.getElementById("qaAddBtn").click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved[0].category).toBe("subject-verb agreement");

    // Shows up under "subject-verb agreement"...
    document.getElementById("mistakeSelect").value = "subject-verb agreement";
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("mistakeEntry").textContent).toContain("The engineer and the technician is on-site");
    expect(document.querySelectorAll("#mistakeEntry .edit-correction-btn").length).toBeGreaterThan(0);

    // ...and NOT under the general correction log.
    document.getElementById("mistakeSelect").value = hooks.CORRECTION_LOG_ENTRY.w;
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("mistakeEntry").textContent).not.toContain("The engineer and the technician is on-site");
  });

  it("Edit restores the category the entry was filed under, and Save can re-file it into a different category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("qaWrongInput").value = "My cousin visit us";
    document.getElementById("qaRightInput").value = "My cousin visits us";
    document.getElementById("qaCategorySelect").value = "subject-verb agreement";
    document.getElementById("qaAddBtn").click();
    await wait();

    document.getElementById("mistakeSelect").value = "subject-verb agreement";
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    document.querySelector("#mistakeEntry .edit-correction-btn").click();
    expect(document.getElementById("qaCategorySelect").value).toBe("subject-verb agreement");

    // Re-file it into the general log instead.
    document.getElementById("qaCategorySelect").value = hooks.CORRECTION_LOG_ENTRY.w;
    document.getElementById("qaAddBtn").click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved[0].category).toBe(hooks.CORRECTION_LOG_ENTRY.w);

    document.getElementById("mistakeSelect").value = "subject-verb agreement";
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("mistakeEntry").textContent).not.toContain("My cousin visit us");

    document.getElementById("mistakeSelect").value = hooks.CORRECTION_LOG_ENTRY.w;
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("mistakeEntry").textContent).toContain("My cousin visit us");
  });

  it("resets the 'File under' select back to the general log after Cancel or a successful save", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const select = document.getElementById("qaCategorySelect");

    select.value = "subject-verb agreement";
    document.getElementById("qaCancelEditBtn").click();
    expect(select.value).toBe(hooks.CORRECTION_LOG_ENTRY.w);

    document.getElementById("qaWrongInput").value = "My cousin visit us";
    document.getElementById("qaRightInput").value = "My cousin visits us";
    select.value = "subject-verb agreement";
    document.getElementById("qaAddBtn").click();
    await wait();
    expect(select.value).toBe(hooks.CORRECTION_LOG_ENTRY.w);
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

    document.getElementById("mistakeSelect").value = "subject-verb agreement";
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("mistakeEntry").textContent).toContain("My cousin visit us");

    document.getElementById("mistakeSelect").value = hooks.CORRECTION_LOG_ENTRY.w;
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("mistakeEntry").textContent).not.toContain("My cousin visit us");
  });

  it("Delete removes a category-filed correction from that category's rendering", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("qaWrongInput").value = "My cousin visit us";
    document.getElementById("qaRightInput").value = "My cousin visits us";
    document.getElementById("qaCategorySelect").value = "subject-verb agreement";
    document.getElementById("qaAddBtn").click();
    await wait();

    document.getElementById("mistakeSelect").value = "subject-verb agreement";
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("mistakeEntry").textContent).toContain("My cousin visit us");

    window.confirm = () => true;
    document.querySelector("#mistakeEntry .delete-correction-btn").click();
    await wait();

    expect(hooks.loadPersonalCorrections()).toHaveLength(0);
    document.getElementById("mistakeSelect").value = "subject-verb agreement";
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("mistakeEntry").textContent).not.toContain("My cousin visit us");
  });
});
