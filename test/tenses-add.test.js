// Integration tests for the Tenses category's own "Add my own
// construction" box (#tenseAddBox, now inside the Course tab's
// course-tenses category rather than a standalone panel-tenses).
// Unlike Verbs/Family, this flow has
// NO online-lookup step — the 12 core English tenses are already a
// complete, closed set, so there's nothing to look up online the way a
// dictionary word would resolve. This box is only for closely related
// constructions that aren't one of the 12 (e.g. "Going to" Future), and
// every field is always typed by hand.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Tenses tab — Add my own construction box", () => {
  it("renders the add box inside the Course tab's Tenses category", async () => {
    const { window } = await loadApp();
    const document = window.document;
    expect(document.getElementById("tenseAddBox")).not.toBeNull();
    expect(document.getElementById("tenseAddInput")).not.toBeNull();
    expect(document.getElementById("tenseAddBtn")).not.toBeNull();
  });

  it("shows an error when the input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("tenseAddBtn").click();
    await wait(10);
    expect(document.getElementById("tenseAddStatus").textContent).toContain("Please enter");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.getElementById("tenseAddInput").value = "Going to Future";
    document.getElementById("tenseAddBtn").click();
    await wait(30);
    expect(document.getElementById("tenseAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.tenseData.some((t) => t.name === "Going to Future")).toBe(false);
  });

  it("does not duplicate a known tense, and opens the existing one instead", async () => {
    const { window } = await loadApp();
    const document = window.document;

    // "Simple Present" is one of the 12 built-in tenses.
    document.getElementById("tenseAddInput").value = "Simple Present";
    document.getElementById("tenseAddBtn").click();
    await wait(30);

    expect(document.getElementById("tenseAddStatus").textContent).toContain("already in the database");
    expect(document.getElementById("lookupModal").style.display).toBe("none");
  });

  it("shows the manual form immediately for a new name — no online lookup step at all", async () => {
    const { window } = await loadApp();
    const document = window.document;

    document.getElementById("tenseAddInput").value = "Going to Future";
    document.getElementById("tenseAddBtn").click();
    await wait(30);

    expect(document.getElementById("lookupModal").style.display).toBe("flex");
    expect(document.getElementById("tenseFormName").value).toBe("Going to Future");
    expect(document.getElementById("tenseFormFormula").value).toBe("");
    expect(document.querySelector("#tenseFormGroupSeg button.active").dataset.val).toBe("Present");
  });

  it("requires Name, Formula, at least one use, and all three examples before saving", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("tenseAddInput").value = "Going to Future";
    document.getElementById("tenseAddBtn").click();
    await wait(30);

    document.getElementById("tenseFormFormula").value = "Subject + am/is/are + going to + base verb";
    // Uses and examples left blank.
    document.getElementById("tenseAddSaveBtn").click();
    await wait(10);

    expect(document.getElementById("tenseAddFormStatus").textContent).toContain("Please fill in");
    expect(hooks.tenseData.some((t) => t.name === "Going to Future")).toBe(false);
  });

  it("saves a complete tense construction, persists it, adds it to the right optgroup, and navigates to it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("tenseAddInput").value = "Going to Future";
    document.getElementById("tenseAddBtn").click();
    await wait(30);

    document.querySelector('#tenseFormGroupSeg button[data-val="Future"]').click();
    document.getElementById("tenseFormFormula").value = "Subject + am/is/are + going to + base verb";
    document.getElementById("tenseFormUses").value = "A plan or intention decided before speaking.\nSomething about to happen (visible evidence now).";
    document.getElementById("tenseFormSignals").value = "tomorrow, next week";
    document.getElementById("tenseFormExPos").value = "We are going to install the new panel tomorrow.";
    document.getElementById("tenseFormExNeg").value = "They are not going to finish today.";
    document.getElementById("tenseFormExQ").value = "Are you going to review the drawings?";
    document.getElementById("tenseAddSaveBtn").click();
    await wait(30);

    const saved = hooks.tenseData.find((t) => t.name === "Going to Future");
    expect(saved).toBeTruthy();
    expect(saved.group).toBe("Future");
    expect(saved.formula).toBe("Subject + am/is/are + going to + base verb");
    expect(saved.uses).toEqual([
      "A plan or intention decided before speaking.",
      "Something about to happen (visible evidence now)."
    ]);
    expect(saved.signals).toEqual(["tomorrow", "next week"]);
    expect(saved.examples).toEqual({
      pos: "We are going to install the new panel tomorrow.",
      neg: "They are not going to finish today.",
      q: "Are you going to review the drawings?"
    });
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("course");
    expect(document.querySelector('#courseCategorySeg button[data-val="tenses"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("tenseAddStatus").textContent).toContain("has been added to Tenses");
    expect(document.getElementById("lookupModal").style.display).toBe("none");

    const futureOptgroup = Array.from(document.querySelectorAll("#tenseSelect optgroup")).find((og) => og.label === "Future");
    expect(Array.from(futureOptgroup.querySelectorAll("option")).some((o) => o.value === "Going to Future")).toBe(true);
  });

  it("Cancel discards the pending manual entry — nothing is saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("tenseAddInput").value = "Going to Future";
    document.getElementById("tenseAddBtn").click();
    await wait(30);

    document.getElementById("tenseAddCancelBtn").click();

    expect(document.getElementById("lookupModal").style.display).toBe("none");
    expect(hooks.tenseData.some((t) => t.name === "Going to Future")).toBe(false);
  });
});
