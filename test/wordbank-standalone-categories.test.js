// Integration tests for "Subject-Verb Agreement" and "My Correction Log"
// inside the Word Bank tab — moved here from the Fixes tab at the user's
// request, same as Sentence Fragments before them (see
// test/wordbank-sentence-fragment.test.js for that category's own
// coverage). Each is a single rule entry (not a list of separate words),
// so there's no dropdown/select — just the rule content plus its own
// wrong/right/why quick-add box, fixed to that one category.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openWordBankCategory(document, val) {
  document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
  document.querySelector(`#wordBankCategorySeg button[data-val="${val}"]`).click();
}

const CATEGORIES = [
  {
    val: "subjectVerbAgreement",
    label: "subject-verb agreement",
    entryElId: "subjectVerbAgreementEntry",
    ids: { wrongId: "svaWrongInput", rightId: "svaRightInput", whyId: "svaWhyInput", addBtnId: "svaAddBtn", cancelBtnId: "svaCancelEditBtn", statusId: "svaAddStatus" },
    builtinSnippet: "the -s/-es verb form"
  },
  {
    val: "correctionLog",
    label: "my correction log (personal history)",
    entryElId: "correctionLogEntry",
    ids: { wrongId: "logWrongInput", rightId: "logRightInput", whyId: "logWhyInput", addBtnId: "logAddBtn", cancelBtnId: "logCancelEditBtn", statusId: "logAddStatus" },
    builtinSnippet: "Tagalog sentence structure carried over"
  }
];

describe.each(CATEGORIES)("Word Bank tab — $label category", ({ val, label, entryElId, ids, builtinSnippet }) => {
  it("renders the built-in rule content when selected, with no select/prev-next (it's a single entry)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, val);

    expect(document.getElementById(`wordbank-${val}`).style.display).toBe("block");
    expect(document.querySelector(`#wordBankCategorySeg button[data-val="${val}"]`).classList.contains("active")).toBe(true);
    expect(document.getElementById(entryElId).textContent).toContain(builtinSnippet);
  });

  it(`is no longer part of the Fixes tab's mistakeSelect dropdown`, async () => {
    const { window } = await loadApp();
    const document = window.document;
    const options = Array.from(document.getElementById("mistakeSelect").options).map((o) => o.value);
    expect(options).not.toContain(label);
  });

  it("has its own quick-add box, with the same label/button wording as the Fixes tab's own box", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, val);
    expect(document.getElementById(ids.wrongId)).not.toBeNull();
    expect(document.getElementById(ids.rightId)).not.toBeNull();
    expect(document.getElementById(ids.whyId)).not.toBeNull();
    const addBtn = document.getElementById(ids.addBtnId);
    expect(addBtn.textContent).toBe("+ Add to this category");
    const box = addBtn.closest(".quick-add-box");
    expect(box.querySelector(".section-label").textContent).toBe(`Add a correction to "${label}"`);
  });

  it("adding a correction appends it and it's visible immediately, permanently", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, val);

    document.getElementById(ids.wrongId).value = "Wrong version text.";
    document.getElementById(ids.rightId).value = "Corrected version text.";
    document.getElementById(ids.addBtnId).click();
    await wait();

    expect(document.getElementById(ids.statusId).className).toContain("success");
    expect(document.getElementById(entryElId).textContent).toContain("Corrected version text");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    openWordBankCategory(document, val);

    expect(document.getElementById(ids.addBtnId).closest(".quick-add-box").style.display).toBe("none");

    document.getElementById(ids.wrongId).value = "Wrong.";
    document.getElementById(ids.rightId).value = "Right.";
    document.getElementById(ids.addBtnId).click();
    await wait();
    expect(document.getElementById(ids.statusId).textContent).toContain("isn't unlocked");
  });

  it("Edit populates this category's own box (not another category's) and updates the entry in place", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, val);

    document.getElementById(ids.wrongId).value = "Wrong original.";
    document.getElementById(ids.rightId).value = "Right original.";
    document.getElementById(ids.addBtnId).click();
    await wait();

    document.querySelector(`#${entryElId} .edit-correction-btn`).click();
    expect(document.getElementById(ids.wrongId).value).toBe("Wrong original.");
    expect(document.getElementById("qaWrongInput").value).not.toBe("Wrong original.");

    document.getElementById(ids.rightId).value = "Right updated.";
    document.getElementById(ids.addBtnId).click();
    await wait();

    expect(document.getElementById(entryElId).textContent).toContain("Right updated");
    expect(document.getElementById(entryElId).textContent).not.toContain("Right original");
  });

  it("Delete removes a correction from the entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, val);

    document.getElementById(ids.wrongId).value = "Delete me wrong.";
    document.getElementById(ids.rightId).value = "Delete me right.";
    document.getElementById(ids.addBtnId).click();
    await wait();
    expect(document.getElementById(entryElId).textContent).toContain("Delete me right");

    window.confirm = () => true;
    document.querySelector(`#${entryElId} .delete-correction-btn`).click();
    await wait();
    expect(document.getElementById(entryElId).textContent).not.toContain("Delete me right");
  });

  it(`a correction saved under "${label}" before this move (legacy local data) still renders here`, async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.savePersonalCorrections([
      { id: "pc_legacy1", wrong: "Legacy wrong.", right: "Legacy right.", why: "", category: label }
    ]);
    hooks.rebuildCorrectionLog();
    openWordBankCategory(document, val);
    expect(document.getElementById(entryElId).textContent).toContain("Legacy right");
  });

  it("is reachable via global search and lands on its own Word Bank category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.runSearchPipeline(label);
    const match = Array.from(document.querySelectorAll("#searchResults .search-result-item")).find((el) =>
      el.textContent.toLowerCase().includes(label.toLowerCase())
    );
    expect(match).toBeTruthy();
    match.click();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("wordbank");
    expect(document.querySelector(`#wordBankCategorySeg button[data-val="${val}"]`).classList.contains("active")).toBe(true);
  });
});

describe("Word Bank standalone categories — cross-category isolation", () => {
  it("editing a correction filed under one category never touches another category's box or content", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    openWordBankCategory(document, "subjectVerbAgreement");
    document.getElementById("svaWrongInput").value = "SVA wrong.";
    document.getElementById("svaRightInput").value = "SVA right.";
    document.getElementById("svaAddBtn").click();
    await wait();

    openWordBankCategory(document, "correctionLog");
    document.getElementById("logWrongInput").value = "Log wrong.";
    document.getElementById("logRightInput").value = "Log right.";
    document.getElementById("logAddBtn").click();
    await wait();

    openWordBankCategory(document, "sentenceFragment");
    document.getElementById("fragWrongInput").value = "Frag wrong.";
    document.getElementById("fragRightInput").value = "Frag right.";
    document.getElementById("fragAddBtn").click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved).toHaveLength(3);
    expect(saved.map((s) => s.category).sort()).toEqual(
      ["my correction log (personal history)", "sentence fragment", "subject-verb agreement"].sort()
    );

    openWordBankCategory(document, "subjectVerbAgreement");
    const svaText = document.getElementById("subjectVerbAgreementEntry").textContent;
    expect(svaText).toContain("SVA right");
    expect(svaText).not.toContain("Log right");
    expect(svaText).not.toContain("Frag right");
  });
});
