// Integration tests for the "Sentence Fragments" category inside the
// Word Bank tab — moved here from the Fixes tab at the user's request,
// but keeping the exact same personal-correction-log mechanism (see
// test/correction-log-category.test.js for the underlying pattern this
// mirrors). A single rule entry (not a list of separate words), so
// there's no dropdown/select — just the rule content plus its own
// wrong/right/why quick-add box, fixed to this one category.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openFragmentCategory(document) {
  document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
  document.querySelector('#wordBankCategorySeg button[data-val="sentenceFragment"]').click();
}

describe("Word Bank tab position — moved next to Language Bank in the tab bar", () => {
  it("sits immediately after Language Bank, ahead of Verbs", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const tabs = Array.from(document.querySelectorAll(".thumb-tab")).map((t) => t.dataset.tab);
    const langbankIdx = tabs.indexOf("langbank");
    const wordbankIdx = tabs.indexOf("wordbank");
    const verbsIdx = tabs.indexOf("verbs");
    expect(wordbankIdx).toBe(langbankIdx + 1);
    expect(wordbankIdx).toBeLessThan(verbsIdx);
  });
});

describe("Word Bank tab — Sentence Fragments category", () => {
  it("is one of the 7 segmented options, alongside Basic → Advanced, Tagalog → English, Subject-Verb Agreement, My Correction Log, and Distinctions Words", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    const vals = Array.from(document.querySelectorAll("#wordBankCategorySeg button")).map((b) => b.dataset.val);
    expect(vals).toEqual(["basicAdvanced", "tagalogEnglish", "translations", "distinctions", "sentenceFragment", "subjectVerbAgreement", "correctionLog"]);
  });

  it("scrolls horizontally instead of wrapping, same as Language Bank's own category seg (7 categories is too many pills for a phone screen)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    const seg = document.getElementById("wordBankCategorySeg");
    expect(window.getComputedStyle(seg).overflowX).toBe("auto");
    expect(window.getComputedStyle(seg).flexWrap).toBe("nowrap");
    const lastBtn = document.querySelector('#wordBankCategorySeg button[data-val="correctionLog"]');
    expect(window.getComputedStyle(lastBtn).flexShrink).toBe("0");
    expect(window.getComputedStyle(lastBtn).whiteSpace).toBe("nowrap");
  });

  it("renders the built-in rule content when selected, with no select/prev-next (it's a single entry)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openFragmentCategory(document);

    expect(document.getElementById("wordbank-sentenceFragment").style.display).toBe("block");
    expect(document.getElementById("wordbank-basicAdvanced").style.display).toBe("none");
    expect(document.getElementById("wordbank-tagalogEnglish").style.display).toBe("none");
    expect(document.querySelector('#wordBankCategorySeg button[data-val="sentenceFragment"]').classList.contains("active")).toBe(true);

    const entryText = document.getElementById("fragmentEntry").textContent;
    expect(entryText).toContain("complete subject and verb");
    expect(entryText).toContain("Because the pump failed");
  });

  it("is no longer part of the Fixes tab's mistakeSelect dropdown", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const options = Array.from(document.getElementById("mistakeSelect").options).map((o) => o.value);
    expect(options).not.toContain("sentence fragment");
  });

  it("has its own quick-add box, separate from the Fixes tab's shared one", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openFragmentCategory(document);
    expect(document.getElementById("fragAddBox")).not.toBeNull();
    expect(document.getElementById("fragWrongInput")).not.toBeNull();
    expect(document.getElementById("fragRightInput")).not.toBeNull();
    expect(document.getElementById("fragWhyInput")).not.toBeNull();
    expect(document.getElementById("fragAddBtn")).not.toBeNull();

    // Same label/button wording pattern as the Fixes tab's own box
    // ("Add a correction to '<category>'" / "+ Add to this category").
    expect(document.querySelector("#fragAddBox .section-label").textContent).toBe('Add a correction to "sentence fragment"');
    expect(document.getElementById("fragAddBtn").textContent).toBe("+ Add to this category");
  });

  it("adding a correction appends it and it's visible immediately, permanently (not just for this session)", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openFragmentCategory(document);

    document.getElementById("fragWrongInput").value = "Running the diagnostics twice.";
    document.getElementById("fragRightInput").value = "We ran the diagnostics twice.";
    document.getElementById("fragWhyInput").value = "No subject or main verb.";
    document.getElementById("fragAddBtn").click();
    await wait();

    expect(document.getElementById("fragAddStatus").className).toContain("success");
    const entryText = document.getElementById("fragmentEntry").textContent;
    expect(entryText).toContain("Running the diagnostics twice");
    expect(entryText).toContain("We ran the diagnostics twice");
  });

  it("requires both the wrong and corrected versions before saving", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openFragmentCategory(document);

    document.getElementById("fragWrongInput").value = "Only wrong, no right.";
    document.getElementById("fragAddBtn").click();
    await wait();

    expect(document.getElementById("fragAddStatus").className).toContain("error");
    expect(document.getElementById("fragmentEntry").textContent).not.toContain("Only wrong, no right");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    document.querySelector('#wordBankCategorySeg button[data-val="sentenceFragment"]').click();

    expect(document.getElementById("fragAddBox").style.display).toBe("none");

    document.getElementById("fragWrongInput").value = "Wrong version.";
    document.getElementById("fragRightInput").value = "Corrected version.";
    document.getElementById("fragAddBtn").click();
    await wait();
    expect(document.getElementById("fragAddStatus").textContent).toContain("isn't unlocked");
  });

  it("Edit populates the fragment box (not the Fixes tab's box) and updates the entry in place", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openFragmentCategory(document);

    document.getElementById("fragWrongInput").value = "Wrong original.";
    document.getElementById("fragRightInput").value = "Right original.";
    document.getElementById("fragAddBtn").click();
    await wait();

    // Edit/Delete are hidden by default now — Manage reveals them (see
    // test/wordbank-review-manage.test.js for dedicated coverage).
    document.querySelector("#fragmentEntry .wordbank-manage-toggle-btn").click();
    document.querySelector("#fragmentEntry .edit-correction-btn").click();
    expect(document.getElementById("fragWrongInput").value).toBe("Wrong original.");
    expect(document.getElementById("qaWrongInput").value).not.toBe("Wrong original.");

    document.getElementById("fragRightInput").value = "Right updated.";
    document.getElementById("fragAddBtn").click();
    await wait();

    expect(document.getElementById("fragmentEntry").textContent).toContain("Right updated");
    expect(document.getElementById("fragmentEntry").textContent).not.toContain("Right original");
  });

  it("Delete removes a fragment correction from the entry", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openFragmentCategory(document);

    document.getElementById("fragWrongInput").value = "Delete me wrong.";
    document.getElementById("fragRightInput").value = "Delete me right.";
    document.getElementById("fragAddBtn").click();
    await wait();
    expect(document.getElementById("fragmentEntry").textContent).toContain("Delete me right");

    window.confirm = () => true;
    document.querySelector("#fragmentEntry .wordbank-manage-toggle-btn").click();
    document.querySelector("#fragmentEntry .delete-correction-btn").click();
    await wait();
    expect(document.getElementById("fragmentEntry").textContent).not.toContain("Delete me right");
  });

  it("a correction saved under 'sentence fragment' before this move (legacy local data) still renders here", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.savePersonalCorrections([
      { id: "pc_legacy1", wrong: "Legacy wrong.", right: "Legacy right.", why: "", category: "sentence fragment" }
    ]);
    hooks.rebuildCorrectionLog();
    openFragmentCategory(document);
    expect(document.getElementById("fragmentEntry").textContent).toContain("Legacy right");
  });

  it("is reachable via global search and lands on the Word Bank tab's Sentence Fragments category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.runSearchPipeline("sentence fragment");
    const match = Array.from(document.querySelectorAll("#searchResults .search-result-item")).find((el) =>
      el.textContent.toLowerCase().includes("sentence fragment")
    );
    expect(match).toBeTruthy();
    match.click();

    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("wordbank");
    expect(document.querySelector('#wordBankCategorySeg button[data-val="sentenceFragment"]').classList.contains("active")).toBe(true);
  });
});
