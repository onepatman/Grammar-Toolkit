// Integration tests for two Word Bank UX upgrades to the three
// standalone correction-log categories (Sentence Fragments,
// Subject-Verb Agreement, My Correction Log):
//   1. A per-item "reviewed" tickbox (persistent, localStorage-only,
//      never auto-resets) with a progress count and a category-scoped
//      Reset button.
//   2. A "Manage" toggle that hides every personal Edit/Delete button
//      pair by default (decluttering a page that can stack a dozen+ of
//      them) and reveals them all at once when turned on.
// Also covers the Word Bank category chip reorder (Distinctions Words
// moved to right after Tagalog -> English) and confirms both new
// features are scoped ONLY to the three correction-log categories —
// every other rule module (Fixes tab, Distinctions, Language Bank,
// Course tab, etc.) keeps its original always-visible Edit/Delete
// behavior untouched.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openWordBankCategory(document, val) {
  document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
  document.querySelector(`#wordBankCategorySeg button[data-val="${val}"]`).click();
}

describe("Word Bank tab — category chip reorder", () => {
  it("Distinctions Words now sits right after Tagalog -> English, before the correction-log categories", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();

    const chipOrder = Array.from(document.querySelectorAll("#wordBankCategorySeg button")).map((b) => b.dataset.val);
    expect(chipOrder).toEqual(["basicAdvanced", "tagalogEnglish", "distinctions", "sentenceFragment", "subjectVerbAgreement", "correctionLog"]);
    expect(hooks.WORD_BANK_CATEGORIES).toEqual(chipOrder);
  });

  it("Distinctions Words still activates correctly from its new chip position", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, "distinctions");
    expect(document.getElementById("wordbank-distinctions").style.display).toBe("block");
    expect(document.querySelector('#wordBankCategorySeg button[data-val="distinctions"]').classList.contains("active")).toBe(true);
  });
});

const REVIEW_CATEGORIES = [
  { val: "sentenceFragment", scope: "sentenceFragment", entryId: "fragmentEntry" },
  { val: "subjectVerbAgreement", scope: "subjectVerbAgreement", entryId: "subjectVerbAgreementEntry" },
  { val: "correctionLog", scope: "correctionLog", entryId: "correctionLogEntry" }
];

describe.each(REVIEW_CATEGORIES)("Word Bank — reviewed tickbox ($val)", ({ val, scope, entryId }) => {
  it("renders one reviewed checkbox per numbered rule, all unchecked to start, with a 0/N progress count", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, val);

    const entryEl = document.getElementById(entryId);
    const senseCount = entryEl.querySelectorAll(".sense").length;
    const checkboxes = entryEl.querySelectorAll(".wordbank-review-checkbox");
    expect(checkboxes.length).toBe(senseCount);
    expect(Array.from(checkboxes).every((c) => !c.checked)).toBe(true);
    expect(entryEl.querySelector(".wordbank-review-progress").textContent).toBe(`0 / ${senseCount} reviewed`);
  });

  it("checking a box updates the progress count and marks that rule reviewed, and it's not owner-gated (works while locked)", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    openWordBankCategory(document, val);

    const entryEl = document.getElementById(entryId);
    const firstCheckbox = entryEl.querySelector(".wordbank-review-checkbox");
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new window.Event("change", { bubbles: true }));
    await wait();

    const refreshedEntry = document.getElementById(entryId);
    expect(refreshedEntry.querySelector(".wordbank-review-progress").textContent).toContain("1 / ");
    expect(refreshedEntry.querySelector(".sense.reviewed")).not.toBeNull();
  });

  it("persists across a re-render (switching category away and back) and across a full page reload", async () => {
    const first = await loadApp();
    openWordBankCategory(first.window.document, val);
    const firstCheckbox = first.window.document.getElementById(entryId).querySelector(".wordbank-review-checkbox");
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new first.window.Event("change", { bubbles: true }));
    await wait();

    // Switch away and back within the same session.
    openWordBankCategory(first.window.document, "basicAdvanced");
    openWordBankCategory(first.window.document, val);
    expect(first.window.document.getElementById(entryId).querySelector(".wordbank-review-progress").textContent).toContain("1 / ");

    // Reload — localStorage, not IndexedDB, so pass the raw key through.
    const reviewedRaw = first.window.localStorage.getItem("mepf_toolkit_wordbank_reviewed_senses");
    const second = await loadApp({ localStorage: { mepf_toolkit_wordbank_reviewed_senses: reviewedRaw } });
    openWordBankCategory(second.window.document, val);
    expect(second.window.document.getElementById(entryId).querySelector(".wordbank-review-progress").textContent).toContain("1 / ");
  });

  it("Reset clears only this category's own reviewed state", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, val);

    const entryEl = document.getElementById(entryId);
    const checkboxes = Array.from(entryEl.querySelectorAll(".wordbank-review-checkbox"));
    checkboxes.forEach((c) => {
      c.checked = true;
      c.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    await wait();

    // Also mark something reviewed in a DIFFERENT scope directly via the state, to prove Reset is scoped.
    const otherScope = REVIEW_CATEGORIES.find((c) => c.scope !== scope).scope;
    const state = hooks.getWordBankReviewedSet();
    state.add(hooks.buildWordBankReviewKey(otherScope, {}, 0));
    hooks.saveWordBankReviewedSet(state);

    document.getElementById(entryId).querySelector(".wordbank-review-reset-btn").click();
    await wait();

    const refreshedEntry = document.getElementById(entryId);
    expect(refreshedEntry.querySelector(".wordbank-review-progress").textContent).toMatch(/^0 \//);
    expect(hooks.getWordBankReviewedSet().has(hooks.buildWordBankReviewKey(otherScope, {}, 0))).toBe(true);
  });
});

describe("Word Bank — reviewed key stability (buildWordBankReviewKey)", () => {
  it("built-in senses (no id) get a stable positional key within their own scope", async () => {
    const { hooks } = await loadApp();
    const key1 = hooks.buildWordBankReviewKey("sentenceFragment", { use: "a rule" }, 0);
    const key2 = hooks.buildWordBankReviewKey("sentenceFragment", { use: "a different rule text" }, 0);
    expect(key1).toBe(key2); // same scope + same index => same key regardless of content drift
    expect(key1).toBe("sentenceFragment::idx:0");
  });

  it("personal senses (have an id) are keyed by their own id, not position", async () => {
    const { hooks } = await loadApp();
    const key = hooks.buildWordBankReviewKey("correctionLog", { personal: true, id: "pc_123" }, 7);
    expect(key).toBe("correctionLog::id:pc_123");
  });

  it("the same index in different scopes never collides", async () => {
    const { hooks } = await loadApp();
    const a = hooks.buildWordBankReviewKey("sentenceFragment", { use: "x" }, 0);
    const b = hooks.buildWordBankReviewKey("subjectVerbAgreement", { use: "x" }, 0);
    expect(a).not.toBe(b);
  });
});

describe("Word Bank — Manage toggle declutters Edit/Delete buttons", () => {
  function addFragmentCorrection(document) {
    document.getElementById("fragWrongInput").value = "Wrong version.";
    document.getElementById("fragRightInput").value = "Right version.";
    document.getElementById("fragAddBtn").click();
  }

  it("Edit/Delete are hidden by default even for an unlocked device with a personal correction", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, "sentenceFragment");
    addFragmentCorrection(document);
    await wait();

    const entryEl = document.getElementById("fragmentEntry");
    expect(entryEl.querySelector(".edit-correction-btn")).toBeNull();
    expect(entryEl.querySelector(".delete-correction-btn")).toBeNull();
    expect(entryEl.querySelector(".wordbank-manage-toggle-btn")).not.toBeNull();
  });

  it("clicking Manage reveals Edit/Delete for every personal item, and clicking again hides them", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, "sentenceFragment");
    addFragmentCorrection(document);
    await wait();

    document.getElementById("fragmentEntry").querySelector(".wordbank-manage-toggle-btn").click();
    await wait();
    let entryEl = document.getElementById("fragmentEntry");
    expect(entryEl.querySelector(".edit-correction-btn")).not.toBeNull();
    expect(entryEl.querySelector(".delete-correction-btn")).not.toBeNull();
    expect(entryEl.querySelector(".wordbank-manage-toggle-btn").textContent).toContain("Done managing");

    entryEl.querySelector(".wordbank-manage-toggle-btn").click();
    await wait();
    entryEl = document.getElementById("fragmentEntry");
    expect(entryEl.querySelector(".edit-correction-btn")).toBeNull();
  });

  it("Manage is shared across all three correction-log categories at once", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, "sentenceFragment");
    addFragmentCorrection(document);
    await wait();

    document.getElementById("fragmentEntry").querySelector(".wordbank-manage-toggle-btn").click();
    await wait();

    document.getElementById("svaWrongInput").value = "SVA wrong.";
    document.getElementById("svaRightInput").value = "SVA right.";
    openWordBankCategory(document, "subjectVerbAgreement");
    document.getElementById("svaAddBtn").click();
    await wait();

    expect(document.getElementById("subjectVerbAgreementEntry").querySelector(".edit-correction-btn")).not.toBeNull();
  });

  it("does not show a Manage button at all when there's nothing personal to manage yet", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, "sentenceFragment");
    expect(document.getElementById("fragmentEntry").querySelector(".wordbank-manage-toggle-btn")).toBeNull();
  });

  it("does not show a Manage button while the device is locked (nothing manageable either way)", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    openWordBankCategory(document, "sentenceFragment");
    expect(document.getElementById("fragmentEntry").querySelector(".wordbank-manage-toggle-btn")).toBeNull();
  });
});

describe("Word Bank UX upgrades — scoped only to the 3 correction-log categories", () => {
  it("Distinctions Words (a different Word Bank category) never renders reviewed checkboxes", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, "distinctions");
    expect(document.getElementById("wordbank-distinctions").querySelector(".wordbank-review-checkbox")).toBeNull();
  });

  it("the Fixes tab's mistakeData category keeps its original always-visible Edit/Delete (no Manage gate, no reviewed checkboxes)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("mistakeSelect").value = "double negatives";
    document.getElementById("mistakeSelect").dispatchEvent(new window.Event("change"));

    document.getElementById("qaWrongInput").value = "I don't have no time.";
    document.getElementById("qaRightInput").value = "I don't have any time.";
    document.getElementById("qaAddBtn").click();
    await wait();

    const entryEl = document.getElementById("mistakeEntry");
    expect(entryEl.querySelector(".edit-correction-btn")).not.toBeNull();
    expect(entryEl.querySelector(".delete-correction-btn")).not.toBeNull();
    expect(entryEl.querySelector(".wordbank-review-checkbox")).toBeNull();
    expect(entryEl.querySelector(".wordbank-manage-toggle-btn")).toBeNull();
  });
});
