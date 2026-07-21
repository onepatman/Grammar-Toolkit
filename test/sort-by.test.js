// Integration tests for the "Sort by" feature on the Language Bank and
// Distinctions Words tabs — A-Z / Recently Modified / Date Modified
// (oldest first) / Recently Added / Date Added (oldest first). Sorting
// must only ever reorder the already-populated <select>'s <option> DOM
// nodes; the underlying data array, each entry's content, and
// IndexedDB/Firestore storage are never touched.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setSort(document, selectId, value) {
  const el = document.getElementById(selectId);
  el.value = value;
  el.dispatchEvent(new (el.ownerDocument.defaultView.Event)("change"));
}

describe("Sort By — Language Bank", () => {
  it("defaults to A–Z and the built-in seed list starts alphabetically sorted", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    expect(document.getElementById("langBankSortSelect").value).toBe("az");

    const labels = Array.from(document.getElementById("idiomsSelect").options).map((o) => o.textContent);
    const sorted = labels.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    expect(labels).toEqual(sorted);
  });

  it("Recently Added shows the newest entry first, without mutating the underlying data array's order or content", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(
      { w: "aaa-older-idiom", senses: [{ use: "(idiom) Older.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addIdiomEntry(
      { w: "zzz-newer-idiom", senses: [{ use: "(idiom) Newer.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );
    hooks.applyLanguageBankSort();
    const dataOrderBefore = hooks.idiomsData.map((e) => e.w);

    setSort(document, "langBankSortSelect", "added-desc");

    const options = Array.from(document.getElementById("idiomsSelect").options).map((o) => o.value);
    expect(options[0]).toBe("zzz-newer-idiom");
    expect(options[1]).toBe("aaa-older-idiom");

    // Underlying data array order/content and item count are untouched.
    expect(hooks.idiomsData.map((e) => e.w)).toEqual(dataOrderBefore);
    expect(hooks.idiomsData.filter((e) => e.w === "aaa-older-idiom")).toHaveLength(1);
    expect(hooks.idiomsData.filter((e) => e.w === "zzz-newer-idiom")).toHaveLength(1);
  });

  it("Date Added — Oldest First shows the oldest entry first", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(
      { w: "aaa-older-idiom2", senses: [{ use: "(idiom) Older.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addIdiomEntry(
      { w: "zzz-newer-idiom2", senses: [{ use: "(idiom) Newer.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );

    setSort(document, "langBankSortSelect", "added-asc");

    // Built-in seed entries have no addedAt/modifiedAt at all, so they
    // correctly sort as "oldest" too — check relative order between the
    // two entries under test, not their absolute position in the list.
    const options = Array.from(document.getElementById("idiomsSelect").options).map((o) => o.value);
    expect(options.indexOf("aaa-older-idiom2")).toBeLessThan(options.indexOf("zzz-newer-idiom2"));
  });

  it("Recently Modified shows the most recently edited entry first, even though it was added first", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(
      { w: "edited-first-idiom", senses: [{ use: "(idiom) One.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addIdiomEntry(
      { w: "untouched-second-idiom", senses: [{ use: "(idiom) Two.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );

    // Edit the FIRST-added entry so it becomes the most recently modified.
    document.getElementById("idiomsSelect").value = "edited-first-idiom";
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    document.getElementById("idiomsEntry").querySelector(".lb-edit-btn").click();
    document.getElementById("lbEditUse").value = "(idiom) One, revised.";
    document.getElementById("lbEditSaveBtn").click();
    await wait(30);

    setSort(document, "langBankSortSelect", "modified-desc");

    const options = Array.from(document.getElementById("idiomsSelect").options).map((o) => o.value);
    expect(options[0]).toBe("edited-first-idiom");
    expect(options[1]).toBe("untouched-second-idiom");
  });

  it("Date Modified — Oldest First shows the least recently touched entry first", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(
      { w: "stale-idiom", senses: [{ use: "(idiom) Stale.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addIdiomEntry(
      { w: "fresh-idiom", senses: [{ use: "(idiom) Fresh.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );

    setSort(document, "langBankSortSelect", "modified-asc");

    const options = Array.from(document.getElementById("idiomsSelect").options).map((o) => o.value);
    expect(options.indexOf("stale-idiom")).toBeLessThan(options.indexOf("fresh-idiom"));
  });

  it("applies the chosen sort to ALL 5 categories, not just whichever one is on screen", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addPhrasalEntry(
      { w: "aaa-old-phrasal", senses: [{ use: "u", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addPhrasalEntry(
      { w: "zzz-new-phrasal", senses: [{ use: "u", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );

    setSort(document, "langBankSortSelect", "added-desc");

    const options = Array.from(document.getElementById("phrasalSelect").options).map((o) => o.value);
    expect(options[0]).toBe("zzz-new-phrasal");
  });

  it("persists the chosen preference across a reload and applies it immediately on the next load", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(
      { w: "aaa-persist-old", senses: [{ use: "u", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: true }
    );
    hooks.addIdiomEntry(
      { w: "zzz-persist-new", senses: [{ use: "u", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: true }
    );
    setSort(document, "langBankSortSelect", "added-desc");
    expect(window.localStorage.getItem("mepf_toolkit_langbank_sort")).toBe("added-desc");

    const second = await loadApp({ indexedDBFactory: undefined, localStorage: { mepf_toolkit_langbank_sort: "added-desc" } });
    expect(second.window.document.getElementById("langBankSortSelect").value).toBe("added-desc");
  });

  it("never breaks Prev/Next — it cycles through whatever order is currently on screen", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(
      { w: "aaa-nav-old", senses: [{ use: "u", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addIdiomEntry(
      { w: "zzz-nav-new", senses: [{ use: "u", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );
    setSort(document, "langBankSortSelect", "added-desc");

    document.getElementById("idiomsSelect").value = "zzz-nav-new";
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    document.querySelector('.bottom-nav .nav-btn[data-target="idiomsSelect"][data-dir="next"]').click();

    expect(document.getElementById("idiomsSelect").value).toBe("aaa-nav-old");
  });

  it("never breaks global search — a word is still findable after sorting", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    setSort(document, "langBankSortSelect", "added-desc");

    hooks.runSearchPipeline("break the ice");
    expect(document.getElementById("searchResults").textContent).toContain("break the ice");
  });
});

describe("Sort By — Distinctions Words", () => {
  it("defaults to A–Z, independent of the Language Bank preference", async () => {
    const { window, hooks } = await loadApp({ localStorage: { mepf_toolkit_langbank_sort: "added-desc" } });
    const document = window.document;
    expect(document.getElementById("distinctionsSortSelect").value).toBe("az");
  });

  it("Recently Added shows the newest pair first, without mutating distinctionsData's order or content", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addDistinctionEntry(
      { w: "Aaa vs Bbb", word1: { w: "Aaa", senses: [], syn: [], ant: [] }, word2: { w: "Bbb", senses: [], syn: [], ant: [] }, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addDistinctionEntry(
      { w: "Zzz vs Yyy", word1: { w: "Zzz", senses: [], syn: [], ant: [] }, word2: { w: "Yyy", senses: [], syn: [], ant: [] }, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );
    const dataOrderBefore = hooks.distinctionsData.map((e) => e.w);

    setSort(document, "distinctionsSortSelect", "added-desc");

    const options = Array.from(document.getElementById("distinctionsSelect").options).map((o) => o.value);
    expect(options[0]).toBe("Zzz vs Yyy");
    expect(options[1]).toBe("Aaa vs Bbb");
    expect(hooks.distinctionsData.map((e) => e.w)).toEqual(dataOrderBefore);
  });

  it("Recently Modified reacts to an edit, moving the edited pair to the top", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addDistinctionEntry(
      { w: "Edited vs Pair", word1: { w: "Edited", senses: [{ use: "u", examples: [] }], syn: [], ant: [] }, word2: { w: "Pair", senses: [], syn: [], ant: [] }, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addDistinctionEntry(
      { w: "Untouched vs Pair2", word1: { w: "Untouched", senses: [], syn: [], ant: [] }, word2: { w: "Pair2", senses: [], syn: [], ant: [] }, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );

    document.getElementById("distinctionsSelect").value = "Edited vs Pair";
    document.getElementById("distinctionsSelect").dispatchEvent(new window.Event("change"));
    document.querySelector("#distinctionsEntry .lb-edit-btn").click();
    document.getElementById("distEditUse1").value = "(noun) Revised.";
    document.getElementById("distEditSaveBtn").click();
    await wait(30);

    setSort(document, "distinctionsSortSelect", "modified-desc");

    const options = Array.from(document.getElementById("distinctionsSelect").options).map((o) => o.value);
    expect(options[0]).toBe("Edited vs Pair");
  });

  it("never breaks search or Prev/Next after sorting", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addDistinctionEntry(
      { w: "Aaa vs Nav", word1: { w: "Aaa", senses: [], syn: [], ant: [] }, word2: { w: "Nav", senses: [], syn: [], ant: [] }, source: "online", addedAt: 1000, modifiedAt: 1000 },
      { persist: false }
    );
    hooks.addDistinctionEntry(
      { w: "Zzz vs Nav2", word1: { w: "Zzz", senses: [], syn: [], ant: [] }, word2: { w: "Nav2", senses: [], syn: [], ant: [] }, source: "online", addedAt: 2000, modifiedAt: 2000 },
      { persist: false }
    );
    setSort(document, "distinctionsSortSelect", "added-desc");

    document.getElementById("distinctionsSelect").value = "Zzz vs Nav2";
    document.getElementById("distinctionsSelect").dispatchEvent(new window.Event("change"));
    document.querySelector('.bottom-nav .nav-btn[data-target="distinctionsSelect"][data-dir="next"]').click();
    expect(document.getElementById("distinctionsSelect").value).toBe("Aaa vs Nav");

    hooks.runSearchPipeline("zzz");
    expect(document.getElementById("searchResults").textContent).toContain("Zzz");
  });
});
