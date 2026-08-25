// Every bank category browses one entry at a time through a dropdown.
// That answers "show me this entry" but never "what have I actually
// collected in here" — which is the whole point of a bank you fill in
// yourself. These cover the Browse/List toggle that lists everything a
// category holds, for the Language Bank categories and the Word Bank
// pair categories.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openWordBankCategory(document, val) {
  document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
  document.querySelector(`#wordBankCategorySeg button[data-val="${val}"]`).click();
}

function listRows(document, key) {
  return Array.from(document.querySelectorAll(`#entryList-${key} .summary-row`));
}

function showList(document, key) {
  const container = document.getElementById(
    key.startsWith("basic") || key.startsWith("tagalog") || key === "distinctions"
      ? "wordbank-" + key
      : "langbank-" + key
  );
  container.querySelector('.entry-view-toggle button[data-val="list"]').click();
}

describe("Entry List view — shell", () => {
  it("adds a Browse/List toggle to every configured category, defaulting to Browse", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    Object.keys(hooks.ENTRY_LIST_CONFIG).forEach((key) => {
      const container = document.getElementById(hooks.ENTRY_LIST_CONFIG[key].containerId);
      expect(container, `no container for ${key}`).not.toBeNull();
      const toggle = container.querySelector(".entry-view-toggle");
      expect(toggle, `no toggle for ${key}`).not.toBeNull();
      expect(toggle.querySelector("button.active").dataset.val).toBe("browse");
      expect(container.querySelector(".entry-list-view").style.display).toBe("none");
    });
  });

  it("covers the Word Chunks, Basic → Advanced and Tagalog → English categories", async () => {
    const { hooks } = await loadApp();
    ["sentences", "basicAdvanced", "tagalogEnglish"].forEach((key) => {
      expect(Object.keys(hooks.ENTRY_LIST_CONFIG)).toContain(key);
    });
  });

  it("moving the category's existing markup into a browse wrapper leaves every element id reachable", async () => {
    const { window } = await loadApp();
    const document = window.document;
    // These are the ids the rest of the app drives the category through.
    ["sentencesSelect", "sentencesEntry", "basicAdvancedSelect", "basicAdvancedEntry",
     "tagalogEnglishSelect", "tagalogEnglishEntry"].forEach((id) => {
      expect(document.getElementById(id), `${id} went missing`).not.toBeNull();
    });
  });

  it("switching to List hides the browse view and shows the list, and back again", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const container = document.getElementById("langbank-sentences");
    showList(document, "sentences");
    expect(container.querySelector(".entry-browse-view").style.display).toBe("none");
    expect(container.querySelector(".entry-list-view").style.display).not.toBe("none");

    container.querySelector('.entry-view-toggle button[data-val="browse"]').click();
    expect(container.querySelector(".entry-browse-view").style.display).not.toBe("none");
    expect(container.querySelector(".entry-list-view").style.display).toBe("none");
  });

  it("remembers the chosen mode across a re-render, per category", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    showList(document, "sentences");
    expect(hooks.getEntryListMode("sentences")).toBe("list");
    // A different category is unaffected — the mode is per category.
    expect(hooks.getEntryListMode("patterns")).toBe("browse");

    hooks.applyEntryListMode("sentences");
    expect(document.getElementById("langbank-sentences").querySelector(".entry-list-view").style.display).not.toBe("none");
  });
});

describe("Entry List view — contents", () => {
  it("lists one row per entry, numbered, in the same order as the dropdown", async () => {
    const { window } = await loadApp();
    const document = window.document;
    showList(document, "sentences");

    const optionValues = Array.from(document.getElementById("sentencesSelect").options).map((o) => o.value);
    const rows = listRows(document, "sentences");
    expect(rows.length).toBe(optionValues.length);
    expect(rows.map((r) => r.dataset.value)).toEqual(optionValues);
    expect(rows[0].querySelector(".row-num").textContent).toBe("1");
    expect(rows[rows.length - 1].querySelector(".row-num").textContent).toBe(String(rows.length));
  });

  it("shows the entry's definition and example under its headword", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const first = hooks.sentencesData[0];
    showList(document, "sentences");

    const row = listRows(document, "sentences").find((r) => r.dataset.value === first.w);
    expect(row).toBeTruthy();
    expect(row.querySelector(".row-word").textContent).toBe(first.w);
    const sense = (first.senses || [])[0];
    if (sense && sense.use) {
      expect(row.querySelector(".row-def").textContent).toBe(sense.use);
    }
  });

  it("reports how many entries the category holds", async () => {
    const { window } = await loadApp();
    const document = window.document;
    showList(document, "sentences");
    const total = document.getElementById("sentencesSelect").options.length;
    expect(document.getElementById("entryListCount-sentences").textContent).toContain(String(total));
  });

  it("clicking a row selects that entry and drops back to Browse", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    showList(document, "sentences");

    const rows = listRows(document, "sentences");
    const target = rows[rows.length - 1];
    const value = target.dataset.value;
    target.click();
    await wait();

    expect(document.getElementById("sentencesSelect").value).toBe(value);
    expect(hooks.getEntryListMode("sentences")).toBe("browse");
    expect(document.getElementById("langbank-sentences").querySelector(".entry-list-view").style.display).toBe("none");
  });

  it("filters the list as you type, and says so in the count", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    showList(document, "sentences");
    const total = listRows(document, "sentences").length;
    const target = hooks.sentencesData[0].w;

    const search = document.getElementById("entryListSearch-sentences");
    search.value = target;
    search.dispatchEvent(new window.Event("input", { bubbles: true }));

    const rows = listRows(document, "sentences");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(total);
    expect(rows.some((r) => r.dataset.value === target)).toBe(true);
    expect(document.getElementById("entryListCount-sentences").textContent).toContain("of");
  });

  it("says so plainly when a search matches nothing", async () => {
    const { window } = await loadApp();
    const document = window.document;
    showList(document, "sentences");
    const search = document.getElementById("entryListSearch-sentences");
    search.value = "zzzz-no-such-entry-zzzz";
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(document.getElementById("entryList-sentences").textContent).toContain("No entry here matches");
  });
});

describe("Entry List view — Word Bank pairs (manual-entry only categories)", () => {
  it("shows an empty-state for a category with nothing added yet", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openWordBankCategory(document, "basicAdvanced");
    showList(document, "basicAdvanced");
    expect(document.getElementById("entryList-basicAdvanced").textContent).toContain("Nothing here yet");
  });

  it("lists a Basic → Advanced pair with both sides", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addBasicAdvancedEntry(
      {
        basic: "happy", advanced: "elated",
        basicDef: "Feeling pleased.", basicExamples: ["I am happy."],
        advancedDef: "Extremely joyful.", advancedExamples: ["She was elated."],
        addedAt: Date.now()
      },
      { persist: false }
    );
    openWordBankCategory(document, "basicAdvanced");
    showList(document, "basicAdvanced");

    const rows = listRows(document, "basicAdvanced");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".row-word").textContent).toBe("happy → elated");
    const defs = Array.from(rows[0].querySelectorAll(".row-def")).map((d) => d.textContent);
    expect(defs).toContain("happy: Feeling pleased.");
    expect(defs).toContain("elated: Extremely joyful.");
  });

  it("lists a Tagalog → English pair the same way", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addTagalogEnglishEntry(
      {
        tagalog: "tiyaga", english: "perseverance",
        tagalogDef: null, tagalogExamples: [], englishDef: null, englishExamples: [],
        addedAt: Date.now()
      },
      { persist: false }
    );
    openWordBankCategory(document, "tagalogEnglish");
    showList(document, "tagalogEnglish");

    const rows = listRows(document, "tagalogEnglish");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".row-word").textContent).toBe("tiyaga → perseverance");
  });

  // The list used to tag owner-typed entries with a "Yours" badge. In the
  // Word Bank pair categories every single entry is owner-typed, so it
  // marked all of them and distinguished nothing — just noise on every
  // row. Dropped entirely.
  it("shows no per-row ownership badge anywhere", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addBasicAdvancedEntry(
      { basic: "happy", advanced: "elated", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [], addedAt: Date.now() },
      { persist: false }
    );
    showList(document, "sentences");
    openWordBankCategory(document, "basicAdvanced");
    showList(document, "basicAdvanced");
    expect(document.querySelectorAll(".entry-list-mine")).toHaveLength(0);
    expect(listRows(document, "sentences").length).toBeGreaterThan(0);
  });
});

// The list reads its rows off the category's <select>. Reordering that
// via Sort by is only half the job — an on-screen list has to be rebuilt
// too, or it keeps the previous order and the control looks inert.
describe("Entry List view — reacts to the Sort by control", () => {
  async function addPairs(hooks) {
    const base = Date.now();
    hooks.addBasicAdvancedEntry(
      { basic: "zebra", advanced: "z-adv", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [], addedAt: base },
      { persist: false }
    );
    hooks.addBasicAdvancedEntry(
      { basic: "alpha", advanced: "a-adv", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [], addedAt: base + 1000 },
      { persist: false }
    );
  }

  it("re-renders an already-visible list when the sort order changes", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addPairs(hooks);

    window.localStorage.setItem("mepf_toolkit_wordbank_sort", "az");
    hooks.applyWordBankSort();
    openWordBankCategory(document, "basicAdvanced");
    showList(document, "basicAdvanced");
    expect(listRows(document, "basicAdvanced").map((r) => r.dataset.value)).toEqual(["alpha", "zebra"]);

    // Change the sort WITHOUT leaving the list — this is the case that
    // used to leave the old order on screen.
    window.localStorage.setItem("mepf_toolkit_wordbank_sort", "added-desc");
    hooks.applyWordBankSort();

    // Newest-added first: alpha was added last.
    expect(listRows(document, "basicAdvanced")[0].dataset.value).toBe("alpha");
    expect(document.getElementById("basicAdvancedSelect").options[0].value).toBe("alpha");
    // The list matches the dropdown exactly, whatever the order is.
    expect(listRows(document, "basicAdvanced").map((r) => r.dataset.value))
      .toEqual(Array.from(document.getElementById("basicAdvancedSelect").options).map((o) => o.value));
  });

  it("leaves a list that isn't on screen alone", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addPairs(hooks);
    // basicAdvanced stays in Browse mode; changing sort must not throw.
    expect(() => hooks.applyWordBankSort()).not.toThrow();
    expect(hooks.getEntryListMode("basicAdvanced")).toBe("browse");
  });
});

describe("Entry List view — picking up where you left off", () => {
  it("stores and clears a scroll position per category", async () => {
    const { hooks } = await loadApp();
    hooks.saveEntryListScroll("sentences", 900);
    expect(hooks.getEntryListScroll("sentences")).toBe(900);
    // A different category keeps its own position.
    expect(hooks.getEntryListScroll("patterns")).toBe(0);
    hooks.clearEntryListScroll("sentences");
    expect(hooks.getEntryListScroll("sentences")).toBe(0);
  });

  it("does not treat being at the top as a position worth restoring", async () => {
    const { hooks } = await loadApp();
    hooks.saveEntryListScroll("sentences", 5);
    expect(hooks.getEntryListScroll("sentences")).toBe(0);
  });

  it("shows the resume note only when there is a saved position", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    showList(document, "sentences");
    expect(document.getElementById("entryListResume-sentences").style.display).toBe("none");

    hooks.saveEntryListScroll("sentences", 800);
    hooks.restoreEntryListScroll("sentences");
    expect(document.getElementById("entryListResume-sentences").style.display).not.toBe("none");
  });

  it("'Back to top' clears the saved position and hides the note", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    showList(document, "sentences");
    hooks.saveEntryListScroll("sentences", 800);
    hooks.restoreEntryListScroll("sentences");

    document.querySelector("#entryListResume-sentences .entry-list-top-btn").click();

    expect(hooks.getEntryListScroll("sentences")).toBe(0);
    expect(document.getElementById("entryListResume-sentences").style.display).toBe("none");
  });

  it("the position survives leaving the list and coming back", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    showList(document, "sentences");
    hooks.saveEntryListScroll("sentences", 1200);

    const container = document.getElementById("langbank-sentences");
    container.querySelector('.entry-view-toggle button[data-val="browse"]').click();
    container.querySelector('.entry-view-toggle button[data-val="list"]').click();

    expect(hooks.getEntryListScroll("sentences")).toBe(1200);
    expect(document.getElementById("entryListResume-sentences").style.display).not.toBe("none");
  });
});
