// Integration tests for the "+ Add another example" feature on every
// "Add a correction" box in the app — the Fixes tab's shared box (qa*
// ids, files under whatever category is selected in mistakeSelect) and
// each Word Bank standalone category's own fixed-category box (frag*/
// sva*/log* ids). A single submission can now log MULTIPLE wrong->right
// examples at once (one shared "why", one category) instead of forcing
// a whole add-cycle per example — see setupCorrectionBox() in
// index.html, which both flavors of box now share.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BOXES = [
  {
    label: "Fixes tab (qa) — dynamic category via mistakeSelect",
    prep: (document) => {
      document.getElementById("mistakeSelect").value = "double negatives";
      document.getElementById("mistakeSelect").dispatchEvent(new document.defaultView.Event("change"));
    },
    rowsId: "qaExampleRows", addRowBtnId: "qaAddExampleRowBtn", whyId: "qaWhyInput",
    addBtnId: "qaAddBtn", cancelBtnId: "qaCancelEditBtn", statusId: "qaAddStatus",
    entryId: "mistakeEntry", category: "double negatives"
  },
  {
    label: "Word Bank — Sentence Fragments (frag)",
    prep: (document) => {
      document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
      document.querySelector('#wordBankCategorySeg button[data-val="sentenceFragment"]').click();
    },
    rowsId: "fragExampleRows", addRowBtnId: "fragAddExampleRowBtn", whyId: "fragWhyInput",
    addBtnId: "fragAddBtn", cancelBtnId: "fragCancelEditBtn", statusId: "fragAddStatus",
    entryId: "fragmentEntry", category: "sentence fragment"
  }
];

describe.each(BOXES)("$label", ({ prep, rowsId, addRowBtnId, whyId, addBtnId, cancelBtnId, statusId, entryId, category }) => {
  function rows(document) {
    return Array.from(document.querySelectorAll(`#${rowsId} .correction-example-row`));
  }
  function fillRow(row, wrong, right) {
    row.querySelector(".correction-wrong-input").value = wrong;
    row.querySelector(".correction-right-input").value = right;
  }

  it("starts with exactly one example row and no remove button on it", async () => {
    const { window } = await loadApp();
    const document = window.document;
    prep(document);

    expect(rows(document)).toHaveLength(1);
    expect(rows(document)[0].querySelector(".remove-example-row-btn")).toBeNull();
  });

  it("'+ Add another example' appends a new row with its own remove button", async () => {
    const { window } = await loadApp();
    const document = window.document;
    prep(document);

    document.getElementById(addRowBtnId).click();
    document.getElementById(addRowBtnId).click();

    expect(rows(document)).toHaveLength(3);
    expect(rows(document)[1].querySelector(".remove-example-row-btn")).not.toBeNull();
    expect(rows(document)[2].querySelector(".remove-example-row-btn")).not.toBeNull();
  });

  it("the remove button takes just that row out, without submitting anything", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    prep(document);

    document.getElementById(addRowBtnId).click();
    fillRow(rows(document)[1], "Wrong to be removed", "Right to be removed");
    rows(document)[1].querySelector(".remove-example-row-btn").click();

    expect(rows(document)).toHaveLength(1);
    expect(hooks.loadPersonalCorrections()).toHaveLength(0);
  });

  it("filling multiple rows and submitting once creates one independent correction per row, sharing the one Why", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    prep(document);

    fillRow(rows(document)[0], "He go to the site", "He goes to the site");
    document.getElementById(addRowBtnId).click();
    fillRow(rows(document)[1], "She have a car", "She has a car");
    document.getElementById(addRowBtnId).click();
    fillRow(rows(document)[2], "It don't work", "It doesn't work");
    document.getElementById(whyId).value = "subject-verb agreement in the present tense";
    document.getElementById(addBtnId).click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved).toHaveLength(3);
    expect(new Set(saved.map((s) => s.id)).size).toBe(3); // each gets its own unique id
    saved.forEach((s) => {
      expect(s.category).toBe(category);
      expect(s.why).toBe("subject-verb agreement in the present tense");
    });
    expect(saved.map((s) => s.wrong).sort()).toEqual(
      ["He go to the site", "It don't work", "She have a car"].sort()
    );

    expect(document.getElementById(statusId).className).toContain("success");
    expect(document.getElementById(entryId).textContent).toContain("He goes to the site");
    expect(document.getElementById(entryId).textContent).toContain("She has a car");
    expect(document.getElementById(entryId).textContent).toContain("It doesn't work");
  });

  it("resets back to exactly one empty row after a successful submit", async () => {
    const { window } = await loadApp();
    const document = window.document;
    prep(document);

    document.getElementById(addRowBtnId).click();
    fillRow(rows(document)[0], "Wrong one", "Right one");
    fillRow(rows(document)[1], "Wrong two", "Right two");
    document.getElementById(addBtnId).click();
    await wait();

    expect(rows(document)).toHaveLength(1);
    expect(rows(document)[0].querySelector(".correction-wrong-input").value).toBe("");
    expect(document.getElementById(addRowBtnId).style.display).not.toBe("none");
  });

  it("refuses to save anything if any row is only half-filled, leaving every row untouched", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    prep(document);

    fillRow(rows(document)[0], "Wrong one", "Right one");
    document.getElementById(addRowBtnId).click();
    rows(document)[1].querySelector(".correction-wrong-input").value = "Only wrong, no right";
    document.getElementById(addBtnId).click();
    await wait();

    expect(document.getElementById(statusId).className).toContain("error");
    expect(hooks.loadPersonalCorrections()).toHaveLength(0);
    // Nothing was cleared — the half-filled row is still there for the
    // user to finish or remove.
    expect(rows(document)).toHaveLength(2);
  });

  it("still shows the original single-row error when nothing at all is filled in", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    prep(document);

    document.getElementById(addBtnId).click();
    await wait();

    expect(document.getElementById(statusId).textContent).toContain("Please fill in both the wrong and corrected versions.");
    expect(hooks.loadPersonalCorrections()).toHaveLength(0);
  });

  it("Edit mode hides '+ Add another example' and collapses back to a single row, even if extra rows were left over", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    prep(document);

    fillRow(rows(document)[0], "Original wrong", "Original right");
    document.getElementById(addBtnId).click();
    await wait();

    // Leave a stray extra (unsubmitted) row sitting in the form...
    document.getElementById(addRowBtnId).click();
    expect(rows(document)).toHaveLength(2);

    // ...then trigger Edit on the entry that was actually saved.
    document.querySelector(`#${entryId} .edit-correction-btn`).click();

    expect(rows(document)).toHaveLength(1);
    expect(rows(document)[0].querySelector(".correction-wrong-input").value).toBe("Original wrong");
    expect(document.getElementById(addRowBtnId).style.display).toBe("none");
    expect(document.getElementById(cancelBtnId).classList.contains("show")).toBe(true);
  });

  it("Cancel edit brings back the '+ Add another example' button", async () => {
    const { window } = await loadApp();
    const document = window.document;
    prep(document);

    fillRow(rows(document)[0], "Original wrong", "Original right");
    document.getElementById(addBtnId).click();
    await wait();
    document.querySelector(`#${entryId} .edit-correction-btn`).click();
    expect(document.getElementById(addRowBtnId).style.display).toBe("none");

    document.getElementById(cancelBtnId).click();

    expect(document.getElementById(addRowBtnId).style.display).not.toBe("none");
  });

  it("Update in edit mode only ever affects the single existing entry, even with multiple corrections already saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    prep(document);

    fillRow(rows(document)[0], "He go to the site", "He goes to the site");
    document.getElementById(addRowBtnId).click();
    fillRow(rows(document)[1], "She have a car", "She has a car");
    document.getElementById(addBtnId).click();
    await wait();
    expect(hooks.loadPersonalCorrections()).toHaveLength(2);

    document.querySelectorAll(`#${entryId} .edit-correction-btn`)[0].click();
    fillRow(rows(document)[0], rows(document)[0].querySelector(".correction-wrong-input").value, "An updated correction");
    document.getElementById(addBtnId).click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved).toHaveLength(2); // still exactly two, nothing duplicated
    expect(saved.some((s) => s.right === "An updated correction")).toBe(true);
  });
});
