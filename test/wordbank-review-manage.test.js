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

  it("still shows a Manage button when unlocked even with nothing personal yet, since built-in rules are manageable too", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, "sentenceFragment");
    expect(document.getElementById("fragmentEntry").querySelector(".wordbank-manage-toggle-btn")).not.toBeNull();
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

  it("no rule module outside the 3 correction-log categories ever renders built-in Edit/Delete buttons, regardless of global Manage state", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    // Flip Manage on globally via the hook (as if a correction-log category turned it on).
    hooks.setWordBankManageMode(true);

    openWordBankCategory(document, "distinctions");
    expect(document.getElementById("wordbank-distinctions").querySelector(".wordbank-builtin-edit-btn")).toBeNull();
    expect(document.getElementById("wordbank-distinctions").querySelector(".wordbank-builtin-delete-btn")).toBeNull();

    document.querySelector('.thumb-tab[data-tab="course"]')?.click();
    const courseEntry = document.querySelector('[id^="course"]') || document.body;
    expect(courseEntry.querySelector(".wordbank-builtin-edit-btn")).toBeNull();
  });
});

const BUILTIN_MANAGE_CATEGORIES = [
  { val: "sentenceFragment", scope: "sentenceFragment", entryId: "fragmentEntry" },
  { val: "subjectVerbAgreement", scope: "subjectVerbAgreement", entryId: "subjectVerbAgreementEntry" },
  { val: "correctionLog", scope: "correctionLog", entryId: "correctionLogEntry" }
];

describe.each(BUILTIN_MANAGE_CATEGORIES)("Word Bank — built-in item Edit/Delete under Manage ($val)", ({ val, scope, entryId }) => {
  function firstBuiltinKey() {
    return `${scope}::idx:0`;
  }
  function openAndManage(document) {
    openWordBankCategory(document, val);
    document.getElementById(entryId).querySelector(".wordbank-manage-toggle-btn").click();
  }

  it("built-in items have no Edit/Delete while Manage is off", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, val);

    const entryEl = document.getElementById(entryId);
    expect(entryEl.querySelector(".wordbank-builtin-edit-btn")).toBeNull();
    expect(entryEl.querySelector(".wordbank-builtin-delete-btn")).toBeNull();
  });

  it("built-in items get Edit/Delete once Manage is turned on, one pair per built-in sense", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, val);
    const builtinCount = document.getElementById(entryId).querySelectorAll(".sense").length;
    document.getElementById(entryId).querySelector(".wordbank-manage-toggle-btn").click();

    const entryEl = document.getElementById(entryId);
    expect(entryEl.querySelectorAll(".wordbank-builtin-edit-btn").length).toBe(builtinCount);
    expect(entryEl.querySelectorAll(".wordbank-builtin-delete-btn").length).toBe(builtinCount);
  });

  it("does not show built-in Edit/Delete while the device is locked, even with Manage forced on", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    hooks.setWordBankManageMode(true);
    openWordBankCategory(document, val);

    const entryEl = document.getElementById(entryId);
    expect(entryEl.querySelector(".wordbank-builtin-edit-btn")).toBeNull();
    expect(entryEl.querySelector(".wordbank-manage-toggle-btn")).toBeNull();
  });

  it("clicking built-in Edit opens an inline form pre-filled with the current rule text and examples", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openAndManage(document);

    const entryEl = document.getElementById(entryId);
    const originalUse = entryEl.querySelectorAll(".sense")[0].querySelector(".use").textContent;
    entryEl.querySelector(".wordbank-builtin-edit-btn").click();

    const refreshed = document.getElementById(entryId);
    const form = refreshed.querySelector(`.wb-builtin-edit-form[data-key="${firstBuiltinKey()}"]`);
    expect(form).not.toBeNull();
    expect(form.querySelector(".wb-builtin-use-input").value).toBe(originalUse);
    const exampleInputs = form.querySelectorAll(".wb-builtin-example-input");
    expect(exampleInputs.length).toBeGreaterThan(0);
    expect(exampleInputs[0].value.length).toBeGreaterThan(0);
    // Every example row also gets its own Remove button, same as the
    // Language Bank/Vocab editors' example rows.
    expect(form.querySelectorAll(".wb-builtin-remove-example-btn").length).toBe(exampleInputs.length);
    expect(form.querySelector(".wb-builtin-add-example-btn")).not.toBeNull();
  });

  it("+ Add Example appends a blank row, and Remove takes just that row back out", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openAndManage(document);

    document.getElementById(entryId).querySelector(".wordbank-builtin-edit-btn").click();
    const form = document.getElementById(entryId).querySelector(".wb-builtin-edit-form");
    const countBefore = form.querySelectorAll(".wb-builtin-example-input").length;

    form.querySelector(".wb-builtin-add-example-btn").click();
    expect(form.querySelectorAll(".wb-builtin-example-input").length).toBe(countBefore + 1);
    expect(form.querySelectorAll(".wb-builtin-example-input")[countBefore].value).toBe("");

    form.querySelectorAll(".wb-builtin-remove-example-btn")[countBefore].click();
    expect(form.querySelectorAll(".wb-builtin-example-input").length).toBe(countBefore);
  });

  it("Save persists an override, updates the displayed text, and closes the form", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openAndManage(document);

    document.getElementById(entryId).querySelector(".wordbank-builtin-edit-btn").click();
    let entryEl = document.getElementById(entryId);
    const form = entryEl.querySelector(".wb-builtin-edit-form");
    form.querySelector(".wb-builtin-use-input").value = "An edited built-in rule.";
    // Replace the pre-filled example rows with two of our own.
    form.querySelectorAll(".wb-builtin-example-row").forEach(row=> row.remove());
    form.querySelector(".wb-builtin-add-example-btn").click();
    form.querySelector(".wb-builtin-add-example-btn").click();
    const exampleInputs = form.querySelectorAll(".wb-builtin-example-input");
    exampleInputs[0].value = "Example one.";
    exampleInputs[1].value = "Example two.";
    entryEl.querySelector(".wb-builtin-save-btn").click();

    entryEl = document.getElementById(entryId);
    expect(entryEl.querySelector(".wb-builtin-edit-form")).toBeNull();
    expect(entryEl.textContent).toContain("An edited built-in rule.");
    expect(entryEl.textContent).toContain("Example one.");
    expect(entryEl.textContent).toContain("Example two.");

    const overrides = hooks.getWordBankBuiltinOverrides();
    expect(overrides[firstBuiltinKey()]).toEqual({ use: "An edited built-in rule.", examples: ["Example one.", "Example two."] });
  });

  it("Cancel discards the in-progress edit without saving anything", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openAndManage(document);

    document.getElementById(entryId).querySelector(".wordbank-builtin-edit-btn").click();
    let entryEl = document.getElementById(entryId);
    entryEl.querySelector(".wb-builtin-use-input").value = "Text that should never be saved.";
    entryEl.querySelector(".wb-builtin-cancel-btn").click();

    entryEl = document.getElementById(entryId);
    expect(entryEl.querySelector(".wb-builtin-edit-form")).toBeNull();
    expect(entryEl.textContent).not.toContain("Text that should never be saved.");
    expect(hooks.getWordBankBuiltinOverrides()[firstBuiltinKey()]).toBeUndefined();
  });

  it("editing the same built-in a second time starts from the saved override, not the original text", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openAndManage(document);

    document.getElementById(entryId).querySelector(".wordbank-builtin-edit-btn").click();
    let entryEl = document.getElementById(entryId);
    let form = entryEl.querySelector(".wb-builtin-edit-form");
    form.querySelector(".wb-builtin-use-input").value = "First override text.";
    form.querySelectorAll(".wb-builtin-example-row").forEach(row=> row.remove());
    form.querySelector(".wb-builtin-add-example-btn").click();
    form.querySelector(".wb-builtin-example-input").value = "Override example.";
    entryEl.querySelector(".wb-builtin-save-btn").click();

    entryEl = document.getElementById(entryId);
    entryEl.querySelector(".wordbank-builtin-edit-btn").click();
    entryEl = document.getElementById(entryId);
    form = entryEl.querySelector(".wb-builtin-edit-form");
    expect(form.querySelector(".wb-builtin-use-input").value).toBe("First override text.");
    const exampleInputs = form.querySelectorAll(".wb-builtin-example-input");
    expect(exampleInputs).toHaveLength(1);
    expect(exampleInputs[0].value).toBe("Override example.");
  });

  it("Delete permanently removes a built-in sense after confirmation, dropping the visible total by one", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    openWordBankCategory(document, val);
    const builtinCount = document.getElementById(entryId).querySelectorAll(".sense").length;
    document.getElementById(entryId).querySelector(".wordbank-manage-toggle-btn").click();

    let entryEl = document.getElementById(entryId);
    const progressBefore = entryEl.querySelector(".wordbank-review-progress").textContent;
    expect(progressBefore).toContain(`/ ${builtinCount} reviewed`);

    entryEl.querySelector(".wordbank-builtin-delete-btn").click();

    entryEl = document.getElementById(entryId);
    expect(entryEl.querySelectorAll(".sense").length).toBe(builtinCount - 1);
    expect(entryEl.querySelector(".wordbank-review-progress").textContent).toContain(`/ ${builtinCount - 1} reviewed`);
    expect(hooks.getWordBankBuiltinDeletedSet().has(firstBuiltinKey())).toBe(true);
    window.confirm = originalConfirm;
  });

  it("declining the confirmation leaves the built-in item untouched", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const originalConfirm = window.confirm;
    window.confirm = () => false;
    openWordBankCategory(document, val);
    const builtinCount = document.getElementById(entryId).querySelectorAll(".sense").length;
    document.getElementById(entryId).querySelector(".wordbank-manage-toggle-btn").click();

    document.getElementById(entryId).querySelector(".wordbank-builtin-delete-btn").click();

    const entryEl = document.getElementById(entryId);
    expect(entryEl.querySelectorAll(".sense").length).toBe(builtinCount);
    expect(hooks.getWordBankBuiltinDeletedSet().has(firstBuiltinKey())).toBe(false);
    window.confirm = originalConfirm;
  });

  it("a permanent delete also drops any existing override for that same item", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.confirm = () => true;
    openAndManage(document);

    document.getElementById(entryId).querySelector(".wordbank-builtin-edit-btn").click();
    let entryEl = document.getElementById(entryId);
    entryEl.querySelector(".wb-builtin-use-input").value = "Soon to be deleted anyway.";
    entryEl.querySelector(".wb-builtin-save-btn").click();
    expect(hooks.getWordBankBuiltinOverrides()[firstBuiltinKey()]).toBeDefined();

    entryEl = document.getElementById(entryId);
    entryEl.querySelector(".wordbank-builtin-delete-btn").click();

    expect(hooks.getWordBankBuiltinOverrides()[firstBuiltinKey()]).toBeUndefined();
    expect(hooks.getWordBankBuiltinDeletedSet().has(firstBuiltinKey())).toBe(true);
  });

  it("a permanent delete persists across a full reload and is NOT restorable via the (unrelated) reviewed-Reset button", async () => {
    const first = await loadApp();
    first.window.confirm = () => true;
    openWordBankCategory(first.window.document, val);
    const builtinCount = first.window.document.getElementById(entryId).querySelectorAll(".sense").length;
    first.window.document.getElementById(entryId).querySelector(".wordbank-manage-toggle-btn").click();
    first.window.document.getElementById(entryId).querySelector(".wordbank-builtin-delete-btn").click();

    const deletedRaw = first.window.localStorage.getItem("mepf_toolkit_wordbank_builtin_deleted");
    expect(deletedRaw).toContain(firstBuiltinKey());

    const second = await loadApp({ localStorage: { mepf_toolkit_wordbank_builtin_deleted: deletedRaw } });
    openWordBankCategory(second.window.document, val);
    let entryEl = second.window.document.getElementById(entryId);
    expect(entryEl.querySelectorAll(".sense").length).toBe(builtinCount - 1);

    // Reset only clears reviewed-state, never a built-in tombstone.
    entryEl.querySelector(".wordbank-review-reset-btn").click();
    entryEl = second.window.document.getElementById(entryId);
    expect(entryEl.querySelectorAll(".sense").length).toBe(builtinCount - 1);
  });
});

describe("Word Bank — built-in override/delete sync round-trip", () => {
  it("collectWordBankBuiltinOverridesForSync/applyRemoteWordBankBuiltinOverrides round-trip a full-replace", async () => {
    const { hooks } = await loadApp();
    hooks.saveWordBankBuiltinOverrides({ "sentenceFragment::idx:0": { use: "Local edit.", examples: ["a"] } });
    expect(hooks.collectWordBankBuiltinOverridesForSync()).toEqual({ "sentenceFragment::idx:0": { use: "Local edit.", examples: ["a"] } });

    const remote = { "sentenceFragment::idx:1": { use: "Remote edit.", examples: ["b"] } };
    hooks.applyRemoteWordBankBuiltinOverrides(remote);
    expect(hooks.getWordBankBuiltinOverrides()).toEqual(remote);
  });

  it("applyRemoteWordBankBuiltinOverrides ignores malformed remote payloads", async () => {
    const { hooks } = await loadApp();
    hooks.saveWordBankBuiltinOverrides({ "sentenceFragment::idx:0": { use: "Keep me.", examples: [] } });
    hooks.applyRemoteWordBankBuiltinOverrides(null);
    hooks.applyRemoteWordBankBuiltinOverrides(["not", "an", "object"]);
    expect(hooks.getWordBankBuiltinOverrides()).toEqual({ "sentenceFragment::idx:0": { use: "Keep me.", examples: [] } });
  });

  it("collectWordBankBuiltinDeletedForSync/applyRemoteWordBankBuiltinDeleted merge tombstones without dropping local ones", async () => {
    const { hooks } = await loadApp();
    hooks.saveWordBankBuiltinDeletedSet(new Set(["sentenceFragment::idx:0"]));
    expect(hooks.collectWordBankBuiltinDeletedForSync().sort()).toEqual(["sentenceFragment::idx:0"]);

    hooks.applyRemoteWordBankBuiltinDeleted(["subjectVerbAgreement::idx:2"]);
    const merged = hooks.getWordBankBuiltinDeletedSet();
    expect(merged.has("sentenceFragment::idx:0")).toBe(true);
    expect(merged.has("subjectVerbAgreement::idx:2")).toBe(true);
  });

  it("applyRemoteWordBankBuiltinDeleted ignores a non-array remote payload", async () => {
    const { hooks } = await loadApp();
    hooks.saveWordBankBuiltinDeletedSet(new Set(["sentenceFragment::idx:0"]));
    hooks.applyRemoteWordBankBuiltinDeleted(null);
    hooks.applyRemoteWordBankBuiltinDeleted({ not: "an array" });
    expect(Array.from(hooks.getWordBankBuiltinDeletedSet())).toEqual(["sentenceFragment::idx:0"]);
  });

  it("saving a built-in override while connected as owner pushes it to the shared doc's wordbankBuiltinOverrides field", async () => {
    const { createFakeFirebase } = await import("./helpers/fake-firebase.js");
    const OWNER_EMAIL = "owner@example.com";
    const OWNER_PASSWORD = "correct-horse-battery-staple";
    const firebase = createFakeFirebase({ ownerEmail: OWNER_EMAIL, users: { [OWNER_EMAIL]: OWNER_PASSWORD } });
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("wb-builtin-code-1");
    await wait();

    openWordBankCategory(document, "sentenceFragment");
    document.getElementById("fragmentEntry").querySelector(".wordbank-manage-toggle-btn").click();
    document.getElementById("fragmentEntry").querySelector(".wordbank-builtin-edit-btn").click();
    let entryEl = document.getElementById("fragmentEntry");
    entryEl.querySelector(".wb-builtin-use-input").value = "Synced override.";
    entryEl.querySelector(".wb-builtin-save-btn").click();
    await wait();

    const doc = firebase._docs.get("syncedLogs/wb-builtin-code-1");
    expect(doc && doc.wordbankBuiltinOverrides).toBeTruthy();
    expect(doc.wordbankBuiltinOverrides["sentenceFragment::idx:0"].use).toBe("Synced override.");
  });

  it("a permanent delete while connected as owner pushes the tombstone to the shared doc's wordbankBuiltinDeleted field", async () => {
    const { createFakeFirebase } = await import("./helpers/fake-firebase.js");
    const OWNER_EMAIL = "owner@example.com";
    const OWNER_PASSWORD = "correct-horse-battery-staple";
    const firebase = createFakeFirebase({ ownerEmail: OWNER_EMAIL, users: { [OWNER_EMAIL]: OWNER_PASSWORD } });
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("wb-builtin-code-2");
    await wait();

    window.confirm = () => true;
    openWordBankCategory(document, "sentenceFragment");
    document.getElementById("fragmentEntry").querySelector(".wordbank-manage-toggle-btn").click();
    document.getElementById("fragmentEntry").querySelector(".wordbank-builtin-delete-btn").click();
    await wait();

    const doc = firebase._docs.get("syncedLogs/wb-builtin-code-2");
    expect(doc && doc.wordbankBuiltinDeleted).toContain("sentenceFragment::idx:0");
  });

  it("a device that connects to a code already carrying a remote built-in override/delete applies both locally", async () => {
    const { createFakeFirebase } = await import("./helpers/fake-firebase.js");
    const firebase = createFakeFirebase();
    firebase._docs.set("syncedLogs/wb-builtin-code-3", {
      entries: [], languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [], favorites: [],
      basicAdvanced: [], tagalogEnglish: [],
      wordbankBuiltinOverrides: { "sentenceFragment::idx:1": { use: "Remote-supplied edit.", examples: ["remote ex"] } },
      wordbankBuiltinDeleted: ["sentenceFragment::idx:2"]
    });

    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;
    await hooks.connectSync("wb-builtin-code-3");
    await wait();

    openWordBankCategory(document, "sentenceFragment");
    const entryEl = document.getElementById("fragmentEntry");
    expect(entryEl.textContent).toContain("Remote-supplied edit.");
    expect(entryEl.querySelectorAll(".sense").length).toBe(2); // one of the 3 built-ins tombstoned
  });
});
