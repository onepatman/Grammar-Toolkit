// Integration tests for the Word Family tab's own direct "Look Up &
// Add" box (#familyAddBox on panel-family) — mirrors verbs-add.test.js
// exactly, since the flow is the same shape: an online lookup only
// confirms the base verb is real, then the Owner always types the
// derived noun/person/adjective forms and example sentences by hand
// (never guessed).
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Word Family tab — direct Look Up & Add box", () => {
  it("renders the add box on panel-family", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("familyAddBox")).not.toBeNull();
    expect(document.getElementById("familyAddInput")).not.toBeNull();
    expect(document.getElementById("familyAddBtn")).not.toBeNull();
  });

  it("shows an error when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("familyAddBtn").click();
    await wait(10);
    expect(document.getElementById("familyAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("familyAddInput").value = "prioritize";
    document.getElementById("familyAddBtn").click();
    await wait(30);
    expect(document.getElementById("familyAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.wordFamilyData.some((f) => f.verb === "prioritize")).toBe(false);
  });

  it("does not duplicate a known word family entry, and never calls the online lookup for it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    // "install" is a built-in word family entry.
    document.getElementById("familyAddInput").value = "install";
    document.getElementById("familyAddBtn").click();
    await wait(30);

    expect(fetchCalled).toBe(false);
    expect(document.getElementById("familyAddStatus").textContent).toContain("already in the database");
    expect(document.getElementById("lookupModal").style.display).toBe("none");
  });

  it("looks up a new verb online, then shows the always-manual form — nothing beyond the base verb is auto-filled", async () => {
    const { window } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "prioritize",
      senses: [{ use: "(verb) To arrange in order of importance.", examples: ["Prioritize the tasks before starting."] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    document.getElementById("familyAddInput").value = "prioritize";
    document.getElementById("familyAddBtn").click();
    await wait(30);

    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("lookupModalBody").textContent).toContain("Found online");
    expect(document.getElementById("familyFormVerb").value).toBe("prioritize");
    expect(document.getElementById("familyFormNoun").value).toBe("");
    expect(document.getElementById("familyFormPerson").value).toBe("");
    expect(document.getElementById("familyFormAdj").value).toBe("");
    expect(document.getElementById("familyFormExNoun").value).toBe("");
    expect(document.getElementById("familyFormExAdj").value).toBe("");
  });

  it("shows the manual entry form even when nothing is found online — never blocks adding a word the dictionary doesn't know", async () => {
    const { window } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;

    document.getElementById("familyAddInput").value = "engineerify";
    document.getElementById("familyAddBtn").click();
    await wait(30);

    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("lookupModalBody").textContent).toContain("Couldn't find");
    expect(document.getElementById("familyFormVerb").value).toBe("engineerify");
  });

  it("requires Verb, Noun, Adjective, and a noun-form example before saving", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("familyAddInput").value = "prioritize";
    document.getElementById("familyAddBtn").click();
    await wait(30);

    document.getElementById("familyFormNoun").value = "prioritization";
    // Adjective and example sentence left blank.
    document.getElementById("familyTabAddSaveBtn").click();
    await wait(10);

    expect(document.getElementById("familyTabAddStatus").textContent).toContain("Please fill in");
    expect(hooks.wordFamilyData.some((f) => f.verb === "prioritize")).toBe(false);
  });

  it("saves a complete word family entry (person left blank becomes —), persists it, and navigates to it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("familyAddInput").value = "prioritize";
    document.getElementById("familyAddBtn").click();
    await wait(30);

    document.getElementById("familyFormNoun").value = "prioritization";
    document.getElementById("familyFormAdj").value = "prioritized";
    document.getElementById("familyFormExNoun").value = "The prioritization took an hour.";
    document.getElementById("familyTabAddSaveBtn").click();
    await wait(30);

    const saved = hooks.wordFamilyData.find((f) => f.verb === "prioritize");
    expect(saved).toBeTruthy();
    expect(saved.noun).toBe("prioritization");
    expect(saved.person).toBe("—");
    expect(saved.adj).toBe("prioritized");
    expect(saved.exNoun).toBe("The prioritization took an hour.");
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("family");
    expect(document.getElementById("familyAddStatus").textContent).toContain("has been added to Word Family");
    expect(document.getElementById("lookupModal").style.display).toBe("none");
  });

  it("saves the optional person form and adjective-form example when provided", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("familyAddInput").value = "prioritize";
    document.getElementById("familyAddBtn").click();
    await wait(30);

    document.getElementById("familyFormNoun").value = "prioritization";
    document.getElementById("familyFormPerson").value = "prioritizer";
    document.getElementById("familyFormAdj").value = "prioritized";
    document.getElementById("familyFormExNoun").value = "The prioritization took an hour.";
    document.getElementById("familyFormExAdj").value = "The list is freshly prioritized.";
    document.getElementById("familyTabAddSaveBtn").click();
    await wait(30);

    const saved = hooks.wordFamilyData.find((f) => f.verb === "prioritize");
    expect(saved.person).toBe("prioritizer");
    expect(saved.exAdj).toBe("The list is freshly prioritized.");
  });

  it("Cancel discards the pending manual entry — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("familyAddInput").value = "prioritize";
    document.getElementById("familyAddBtn").click();
    await wait(30);

    document.getElementById("familyTabAddCancelBtn").click();

    expect(document.getElementById("lookupModal").style.display).toBe("none");
    expect(hooks.wordFamilyData.some((f) => f.verb === "prioritize")).toBe(false);
  });

  it("a saved word family entry is reverse-synced into the Vocabulary Bank, same as the Verbs-tab-triggered flow", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;
    document.getElementById("familyAddInput").value = "prioritize";
    document.getElementById("familyAddBtn").click();
    await wait(30);

    document.getElementById("familyFormNoun").value = "prioritization";
    document.getElementById("familyFormAdj").value = "prioritized";
    document.getElementById("familyFormExNoun").value = "The prioritization took an hour.";
    document.getElementById("familyTabAddSaveBtn").click();
    await wait(30);

    expect(hooks.vocabData.some((v) => v.w === "prioritize")).toBe(true);
  });
});
