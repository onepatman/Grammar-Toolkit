// Integration tests for the Verbs tab's own direct "Look Up & Add" box
// (#verbAddBox on panel-verbs) — previously the only way to add a verb
// was a side-effect of saving a new Vocabulary Bank word that looked
// like a verb (offerVerbFlagIfApplicable, triggered from the Vocab
// panel). This is a separate, self-contained flow reachable from the
// Verbs tab itself; conjugations are still never auto-guessed (all five
// forms are always typed by hand), same design rule as the original flow.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Verbs tab — direct Look Up & Add box", () => {
  it("renders the add box on panel-verbs", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("verbAddBox")).not.toBeNull();
    expect(document.getElementById("verbAddInput")).not.toBeNull();
    expect(document.getElementById("verbAddBtn")).not.toBeNull();
  });

  it("shows an error when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("verbAddBtn").click();
    await wait(10);
    expect(document.getElementById("verbAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("verbAddInput").value = "proceed";
    document.getElementById("verbAddBtn").click();
    await wait(30);
    expect(document.getElementById("verbAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.verbData.regular.some((v) => v.w === "proceed")).toBe(false);
  });

  it("does not duplicate a known verb, and never calls the online lookup for it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    // "work" is a built-in regular verb.
    document.getElementById("verbAddInput").value = "work";
    document.getElementById("verbAddBtn").click();
    await wait(30);

    expect(fetchCalled).toBe(false);
    expect(document.getElementById("verbAddStatus").textContent).toContain("already in the database");
    expect(document.getElementById("lookupModal").style.display).toBe("none");
  });

  it("looks up a new verb online, then shows the always-manual 5-form conjugation entry — nothing is auto-filled beyond the base form", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "proceed",
      senses: [{ use: "(verb) To begin or continue a course of action.", examples: ["Please proceed to the next step."] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    document.getElementById("verbAddInput").value = "proceed";
    document.getElementById("verbAddBtn").click();
    await wait(30);

    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("lookupModalBody").textContent).toContain("Found online");
    expect(document.getElementById("verbTabFormBase").value).toBe("proceed");
    expect(document.getElementById("verbTabFormS").value).toBe("");
    expect(document.getElementById("verbTabFormPast").value).toBe("");
    expect(document.getElementById("verbTabFormPP").value).toBe("");
    expect(document.getElementById("verbTabFormIng").value).toBe("");
  });

  it("shows the manual entry form even when nothing is found online — never blocks adding a verb the dictionary doesn't know", async () => {
    const { window } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;

    document.getElementById("verbAddInput").value = "engineerify";
    document.getElementById("verbAddBtn").click();
    await wait(30);

    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("lookupModalBody").textContent).toContain("Couldn't find");
    expect(document.getElementById("verbTabFormBase").value).toBe("engineerify");
  });

  it("requires all five forms before saving", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("verbAddInput").value = "proceed";
    document.getElementById("verbAddBtn").click();
    await wait(30);

    document.getElementById("verbTabFormS").value = "proceeds";
    // Past/PP/-ing left blank.
    document.getElementById("verbTabAddSaveBtn").click();
    await wait(10);

    expect(document.getElementById("verbTabAddStatus").textContent).toContain("Please fill in all five forms");
    expect(hooks.verbData.regular.some((v) => v.w === "proceed")).toBe(false);
  });

  it("saves a complete regular verb, persists it, and navigates to it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("verbAddInput").value = "proceed";
    document.getElementById("verbAddBtn").click();
    await wait(30);

    document.getElementById("verbTabFormS").value = "proceeds";
    document.getElementById("verbTabFormPast").value = "proceeded";
    document.getElementById("verbTabFormPP").value = "proceeded";
    document.getElementById("verbTabFormIng").value = "proceeding";
    document.getElementById("verbTabAddSaveBtn").click();
    await wait(30);

    const saved = hooks.verbData.regular.find((v) => v.w === "proceed");
    expect(saved).toBeTruthy();
    expect(saved.s).toBe("proceeds");
    expect(saved.past).toBe("proceeded");
    expect(saved.pp).toBe("proceeded");
    expect(saved.ing).toBe("proceeding");
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("verbs");
    expect(document.getElementById("verbAddStatus").textContent).toContain("has been added to Verbs");
    expect(document.getElementById("lookupModal").style.display).toBe("none");
  });

  it("saves an irregular verb under the irregular group when selected", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("verbAddInput").value = "arise";
    document.getElementById("verbAddBtn").click();
    await wait(30);

    document.querySelector('#verbTabAddTypeSeg button[data-val="irregular"]').click();
    document.getElementById("verbTabFormS").value = "arises";
    document.getElementById("verbTabFormPast").value = "arose";
    document.getElementById("verbTabFormPP").value = "arisen";
    document.getElementById("verbTabFormIng").value = "arising";
    document.getElementById("verbTabAddSaveBtn").click();
    await wait(30);

    expect(hooks.verbData.irregular.some((v) => v.w === "arise")).toBe(true);
    expect(hooks.verbData.regular.some((v) => v.w === "arise")).toBe(false);
  });

  it("Cancel discards the pending manual entry — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("verbAddInput").value = "proceed";
    document.getElementById("verbAddBtn").click();
    await wait(30);

    document.getElementById("verbTabAddCancelBtn").click();

    expect(document.getElementById("lookupModal").style.display).toBe("none");
    expect(hooks.verbData.regular.some((v) => v.w === "proceed")).toBe(false);
  });

  it("a saved verb is reverse-synced into the Vocabulary Bank, same as the Vocab-tab-triggered flow", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("verbAddInput").value = "proceed";
    document.getElementById("verbAddBtn").click();
    await wait(30);

    document.getElementById("verbTabFormS").value = "proceeds";
    document.getElementById("verbTabFormPast").value = "proceeded";
    document.getElementById("verbTabFormPP").value = "proceeded";
    document.getElementById("verbTabFormIng").value = "proceeding";
    document.getElementById("verbTabAddSaveBtn").click();
    await wait(30);

    expect(hooks.vocabData.some((v) => v.w === "proceed")).toBe(true);
  });
});
