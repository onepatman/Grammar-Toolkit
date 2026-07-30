// Integration tests for the "every tab can add an entry" feature's 6
// newly-addable standalone grammar-rule tabs: Prepositions (online
// lookup — these ARE real dictionary words), and Articles/Modals/
// Capitalization/Word Order/Question Starters (manual-only — these are
// grammar RULES, not lookup-able dictionary words). Both flows funnel
// through the shared LANGUAGE_BANK_CONFIG-driven machinery
// (addLanguageBankEntry, openLanguageBankEditForm, deleteLanguageBankEntry,
// findLanguageBankDuplicate) that Language Bank already uses — see
// addRuleEntryFromInput's dispatch in index.html. Loads the real
// index.html in jsdom and dispatches real DOM interactions, same as
// every other integration test in this repo.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SAMPLE_PREP = {
  w: "notwithstanding",
  senses: [{ use: "(preposition) Despite something.", examples: ["Notwithstanding the delay, the project finished on time."] }],
  syn: [],
  ant: [],
  mistake: null,
  tagalog: null,
  source: "online"
};

describe("Prepositions tab — online-first Look Up & Add", () => {
  it("renders the add box", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("prepAddBox")).not.toBeNull();
    expect(document.getElementById("prepAddInput")).not.toBeNull();
    expect(document.getElementById("prepAddBtn")).not.toBeNull();
  });

  it("shows an error when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("prepAddBtn").click();
    await wait(10);
    expect(document.getElementById("prepAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("prepAddInput").value = "notwithstanding";
    document.getElementById("prepAddBtn").click();
    await wait(30);
    expect(document.getElementById("prepAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.prepData.some((p) => p.w === "notwithstanding")).toBe(false);
  });

  it("does not duplicate a built-in preposition, and never calls the online lookup for it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    document.getElementById("prepAddInput").value = "at";
    document.getElementById("prepAddBtn").click();
    await wait(30);

    expect(fetchCalled).toBe(false);
    expect(document.getElementById("prepAddStatus").textContent).toContain("already in the database");
    expect(hooks.prepData.filter((p) => p.w === "at")).toHaveLength(1);
  });

  it("looks up a new preposition online, previews it, and only adds it once Save is clicked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => SAMPLE_PREP;

    document.getElementById("prepAddInput").value = "notwithstanding";
    document.getElementById("prepAddBtn").click();
    await wait(30);

    const statusEl = document.getElementById("prepAddStatus");
    expect(statusEl.textContent).toContain("ready to be added");
    expect(hooks.prepData.some((p) => p.w === "notwithstanding")).toBe(false);

    statusEl.querySelector(".lb-lookup-save-btn").click();
    await wait(30);

    expect(hooks.prepData.some((p) => p.w === "notwithstanding")).toBe(true);
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("preps");
    expect(document.getElementById("prepEntry").querySelector(".headword").textContent).toBe("notwithstanding");
  });

  it("a saved preposition gets Edit/Delete buttons (owner-gated, source:'online')", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addLanguageBankEntry("preps", SAMPLE_PREP, { persist: false });
    document.getElementById("prepSelect").value = "notwithstanding";
    hooks.renderPrep();

    const entryEl = document.getElementById("prepEntry");
    expect(entryEl.querySelector(".lb-edit-btn")).not.toBeNull();
    expect(entryEl.querySelector(".lb-delete-btn")).not.toBeNull();
  });

  it("a built-in preposition (no source field) never gets Edit/Delete buttons", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("prepSelect").value = "at";
    hooks.renderPrep();
    const entryEl = document.getElementById("prepEntry");
    expect(entryEl.querySelector(".lb-edit-btn")).toBeNull();
  });

  it("editing a saved preposition offers only its own single category, not the Language Bank's 5", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addLanguageBankEntry("preps", SAMPLE_PREP, { persist: false });
    document.getElementById("prepSelect").value = "notwithstanding";
    hooks.renderPrep();

    document.getElementById("prepEntry").querySelector(".lb-edit-btn").click();
    const options = Array.from(document.getElementById("lbEditCategory").options).map((o) => o.value);
    expect(options).toEqual(["preps"]);
  });
});

describe.each([
  {
    key: "articles", label: "Articles", inputId: "articleAddInput", btnId: "articleAddBtn",
    statusId: "articleAddStatus", dataKey: "articleData", entryId: "articleEntry",
    builtIn: "a", manualBoxId: "articleManualBox", manualWordId: "articleManualWord",
    manualUseId: "articleManualUse", manualExampleId: "articleManualExample",
    manualSaveBtnId: "articleManualSaveBtn", manualCancelBtnId: "articleManualCancelBtn"
  },
  {
    key: "modals", label: "Modals", inputId: "modalAddInput", btnId: "modalAddBtn",
    statusId: "modalAddStatus", dataKey: "modalData", entryId: "modalEntry",
    builtIn: "can", manualBoxId: "modalManualBox", manualWordId: "modalManualWord",
    manualUseId: "modalManualUse", manualExampleId: "modalManualExample",
    manualSaveBtnId: "modalManualSaveBtn", manualCancelBtnId: "modalManualCancelBtn"
  },
  {
    key: "capital", label: "Capitalization", inputId: "capitalAddInput", btnId: "capitalAddBtn",
    statusId: "capitalAddStatus", dataKey: "capitalData", entryId: "capitalEntry",
    builtIn: "first word of a sentence", manualBoxId: "capitalManualBox", manualWordId: "capitalManualWord",
    manualUseId: "capitalManualUse", manualExampleId: "capitalManualExample",
    manualSaveBtnId: "capitalManualSaveBtn", manualCancelBtnId: "capitalManualCancelBtn"
  },
  {
    key: "order", label: "Word Order", inputId: "orderAddInput", btnId: "orderAddBtn",
    statusId: "orderAddStatus", dataKey: "orderData", entryId: "orderEntry",
    builtIn: "adverb placement", manualBoxId: "orderManualBox", manualWordId: "orderManualWord",
    manualUseId: "orderManualUse", manualExampleId: "orderManualExample",
    manualSaveBtnId: "orderManualSaveBtn", manualCancelBtnId: "orderManualCancelBtn"
  },
  {
    key: "qa", label: "Question Starters", inputId: "qaRuleAddInput", btnId: "qaRuleAddBtn",
    statusId: "qaRuleAddStatus", dataKey: "qaData", entryId: "qaEntry",
    builtIn: "Have you...?", manualBoxId: "qaRuleManualBox", manualWordId: "qaRuleManualWord",
    manualUseId: "qaRuleManualUse", manualExampleId: "qaRuleManualExample",
    manualSaveBtnId: "qaRuleManualSaveBtn", manualCancelBtnId: "qaRuleManualCancelBtn"
  }
])("$label quick-add (manual-only — no online lookup for grammar rules)", ({
  key, inputId, btnId, statusId, dataKey, entryId, builtIn,
  manualBoxId, manualWordId, manualUseId, manualExampleId, manualSaveBtnId, manualCancelBtnId
}) => {
  it("shows an error and adds nothing when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById(btnId).click();
    await wait(10);
    expect(document.getElementById(statusId).textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById(inputId).value = "my new rule";
    document.getElementById(btnId).click();
    await wait(30);
    expect(document.getElementById(statusId).textContent).toContain("isn't unlocked");
    expect(hooks[dataKey].some((p) => p.w === "my new rule")).toBe(false);
  });

  it("goes straight to the manual box — never calls the online lookup for a grammar rule", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    document.getElementById(inputId).value = "my new rule";
    document.getElementById(btnId).click();
    await wait(30);

    expect(fetchCalled).toBe(false);
    expect(document.getElementById(manualBoxId).style.display).not.toBe("none");
    expect(document.getElementById(manualWordId).textContent).toBe("my new rule");
    expect(hooks.languageBankPendingManual[key]).toBe("my new rule");
    expect(hooks[dataKey].some((p) => p.w === "my new rule")).toBe(false);
  });

  it("does not duplicate a built-in entry — navigates to it instead of opening the manual box", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById(inputId).value = builtIn;
    document.getElementById(btnId).click();
    await wait(30);

    expect(document.getElementById(statusId).textContent).toContain("already in the database");
    expect(document.getElementById(manualBoxId).style.display).toBe("none");
    expect(hooks[dataKey].filter((p) => p.w === builtIn)).toHaveLength(1);
  });

  it("saves the manually-typed rule, persists it, and wires it for Edit/Delete", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById(inputId).value = "my new rule";
    document.getElementById(btnId).click();
    await wait(30);

    document.getElementById(manualUseId).value = "This is my own explanation.";
    if (manualExampleId) document.getElementById(manualExampleId).value = "An example sentence.";
    document.getElementById(manualSaveBtnId).click();
    await wait(30);

    expect(hooks[dataKey].some((p) => p.w === "my new rule")).toBe(true);
    const saved = hooks[dataKey].find((p) => p.w === "my new rule");
    expect(saved.senses[0].use).toBe("This is my own explanation.");
    expect(saved.source).toBe("online");
    expect(document.getElementById(entryId).querySelector(".headword").textContent).toBe("my new rule");
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe(key);
    expect(document.getElementById(entryId).querySelector(".lb-edit-btn")).not.toBeNull();
  });

  it("Cancel discards the pending manual entry — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById(inputId).value = "my new rule";
    document.getElementById(btnId).click();
    await wait(30);

    document.getElementById(manualCancelBtnId).click();
    await wait(10);

    expect(document.getElementById(manualBoxId).style.display).toBe("none");
    expect(hooks[dataKey].some((p) => p.w === "my new rule")).toBe(false);
  });

  it("requires a meaning/explanation before saving", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;

    document.getElementById(inputId).value = "my new rule";
    document.getElementById(btnId).click();
    await wait(30);

    document.getElementById(manualSaveBtnId).click();
    await wait(10);

    expect(document.getElementById(statusId).textContent).toContain("Please enter a meaning or explanation");
    expect(hooks[dataKey].some((p) => p.w === "my new rule")).toBe(false);
  });
});

describe("Restoring cached rule-tab entries from a previous session", () => {
  it("ruleTabsCacheRestorePromise resolves cleanly when nothing is cached", async () => {
    const { hooks } = await loadApp();
    await hooks.ruleTabsCacheRestorePromise;
  });
});
