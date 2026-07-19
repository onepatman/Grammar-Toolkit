// Integration tests for the Distinctions Words tab (renamed from
// "Upgrade") — commonly confused/misused word PAIRS (e.g. Affect vs
// Effect), each entry holding two independent words with their own
// definition/examples/synonyms/antonyms. Mirrors the Language Bank's
// owner-gated Add (via online lookup)/Edit/Delete/sync architecture,
// adapted for the two-word shape. Loads the real index.html in jsdom
// and dispatches real DOM interactions.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import { createFakeFirebase } from "./helpers/fake-firebase.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RESULT_ARISE = {
  w: "Arise",
  senses: [{ use: "(verb) To come into being; to get up.", examples: ["A problem may arise later."] }],
  syn: ["emerge"],
  ant: ["vanish"],
  mistake: null,
  tagalog: null,
  source: "online"
};
const RESULT_QUIBBLET = {
  w: "Quibblet",
  senses: [{ use: "(verb) To move upward.", examples: ["The water level began to rise."] }],
  syn: ["climb"],
  ant: ["fall"],
  mistake: null,
  tagalog: null,
  source: "online"
};

function stubBothLookups(window, result1, result2) {
  window.OnlineLookup.fetchOnlineDefinition = async (word) => {
    const key = word.trim().toLowerCase();
    if (key === RESULT_ARISE.w.toLowerCase()) return result1;
    if (key === RESULT_QUIBBLET.w.toLowerCase()) return result2;
    return null;
  };
}

describe("renamed from Upgrade to Distinctions Words", () => {
  it("the nav tab reads 'Distinctions Words', not 'Upgrade'", async () => {
    const { window } = await loadApp();
    const tab = window.document.querySelector('.thumb-tab[data-tab="distinctions"]');
    expect(tab).toBeTruthy();
    expect(tab.textContent).toContain("Distinctions Words");
    expect(window.document.querySelector('.thumb-tab[data-tab="upgrade"]')).toBeNull();
  });

  it("has no leftover #panel-upgrade/#upgradeSelect/#upgradeEntry elements", async () => {
    const { window } = await loadApp();
    expect(window.document.getElementById("panel-upgrade")).toBeNull();
    expect(window.document.getElementById("upgradeSelect")).toBeNull();
    expect(window.document.getElementById("upgradeEntry")).toBeNull();
    expect(window.document.getElementById("panel-distinctions")).toBeTruthy();
    expect(window.document.getElementById("distinctionsSelect")).toBeTruthy();
    expect(window.document.getElementById("distinctionsEntry")).toBeTruthy();
  });

  it("exposes distinctionsData (not upgradeData) with the migrated Basic→Advanced pairs plus new confusable pairs", async () => {
    const { hooks } = await loadApp();
    expect(hooks.upgradeData).toBeUndefined();
    expect(Array.isArray(hooks.distinctionsData)).toBe(true);
    expect(hooks.distinctionsData.length).toBeGreaterThan(70);
    const achieveAttain = hooks.distinctionsData.find((e) => e.word1.w === "Achieve" && e.word2.w === "Attain");
    expect(achieveAttain).toBeTruthy();
  });

  it("renders the first entry (two headwords in one card) on load", async () => {
    const { window, hooks } = await loadApp();
    window.document.querySelector('.thumb-tab[data-tab="distinctions"]').click();
    const headwords = Array.from(window.document.querySelectorAll("#distinctionsEntry .headword")).map((el) => el.textContent);
    // Dropdown options are alphabetically sorted (case-insensitive), so the
    // entry shown on load is the alphabetically-first pair, not necessarily
    // distinctionsData[0] in its original declaration order.
    const first = hooks.distinctionsData
      .slice()
      .sort((a, b) => a.word1.w.localeCompare(b.word1.w, undefined, { sensitivity: "base" }))[0];
    expect(headwords).toEqual([first.word1.w, first.word2.w]);
  });
});

describe("Distinctions Words quick-add (two words, one Look Up & Add button)", () => {
  it("shows an error and adds nothing when either input is empty", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddBtn").click();
    await wait();
    expect(document.getElementById("distinctionsAddStatus").textContent).toContain("both Word 1 and Word 2");
  });

  it("looks up both words online in parallel and adds one combined entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubBothLookups(window, RESULT_ARISE, RESULT_QUIBBLET);

    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    expect(document.getElementById("distinctionsAddStatus").textContent).toContain("Added");
    const added = hooks.distinctionsData.find((e) => e.w === "Arise vs Quibblet");
    expect(added).toBeTruthy();
    expect(added.word1.senses[0].use).toContain("come into being");
    expect(added.word2.senses[0].use).toContain("move upward");

    // Navigates straight to the new entry.
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("distinctions");
    const headwords = Array.from(document.querySelectorAll("#distinctionsEntry .headword")).map((el) => el.textContent);
    expect(headwords).toEqual(["Arise", "Quibblet"]);
  });

  it("clears both input fields after a successful add", async () => {
    const { window } = await loadApp();
    const document = window.document;
    stubBothLookups(window, RESULT_ARISE, RESULT_QUIBBLET);

    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    expect(document.getElementById("distinctionsAddInput1").value).toBe("");
    expect(document.getElementById("distinctionsAddInput2").value).toBe("");
  });

  it("both words become independently searchable, resolving to the same entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubBothLookups(window, RESULT_ARISE, RESULT_QUIBBLET);

    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    expect(hooks.wordIndexMap.get("arise").cat).toBe("Distinction Word");
    expect(hooks.wordIndexMap.get("quibblet").cat).toBe("Distinction Word");

    hooks.runSearchPipeline("arise");
    expect(document.getElementById("searchResults").textContent).toContain("Distinction Word");
  });

  it("requests both lookups with generateFallbackExamples disabled", async () => {
    const { window } = await loadApp();
    const document = window.document;
    const captured = [];
    window.OnlineLookup.fetchOnlineDefinition = async (word, options) => {
      captured.push(options);
      return word.trim().toLowerCase() === "arise" ? RESULT_ARISE : RESULT_QUIBBLET;
    };

    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    expect(captured.length).toBe(2);
    captured.forEach((opts) => expect(opts.generateFallbackExamples).toBe(false));
  });

  it("does not create a duplicate and instead navigates to the existing pair (in either word order)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return null; };

    // "Achieve" vs "Attain" is a built-in migrated pair — try the reversed order.
    document.getElementById("distinctionsAddInput1").value = "Attain";
    document.getElementById("distinctionsAddInput2").value = "Achieve";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    expect(fetchCalled).toBe(false);
    expect(document.getElementById("distinctionsAddStatus").textContent).toContain("already in the database");
    expect(document.querySelector(".thumb-tab.active").dataset.tab).toBe("distinctions");
    expect(hooks.distinctionsData.filter((e) => e.w === "Achieve vs Attain")).toHaveLength(1);
  });

  it("submits on Enter key from either input", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubBothLookups(window, RESULT_ARISE, RESULT_QUIBBLET);

    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddInput2").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
    await wait(50);

    expect(hooks.distinctionsData.some((e) => e.w === "Arise vs Quibblet")).toBe(true);
  });

  it("is gated behind isDeviceUnlocked() — a locked device gets a clear error, not silence", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    let fetchCalled = false;
    window.OnlineLookup.fetchOnlineDefinition = async () => { fetchCalled = true; return RESULT_ARISE; };

    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddBtn").click();
    await wait(30);

    expect(fetchCalled).toBe(false);
    expect(document.getElementById("distinctionsAddStatus").textContent).toContain("isn't unlocked");
    expect(hooks.distinctionsData.some((e) => e.w === "Arise vs Quibblet")).toBe(false);
  });

  it("the quick-add box itself is hidden while locked (owner-only)", async () => {
    const { window } = await loadApp({ ownerUnlocked: false });
    expect(window.document.getElementById("distinctionsAddBox").style.display).toBe("none");
  });
});

describe("manual completion when online lookup fails for one or both words", () => {
  it("shows only the Word 2 manual box when Word 1 succeeded but Word 2 failed", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubBothLookups(window, RESULT_ARISE, null);

    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "zzznotaword";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    expect(document.getElementById("distinctionsManualBox").style.display).not.toBe("none");
    expect(document.getElementById("distinctionsManualWord1Box").style.display).toBe("none");
    expect(document.getElementById("distinctionsManualWord2Box").style.display).not.toBe("none");
    expect(document.getElementById("distinctionsManualWord2").textContent).toBe("zzznotaword");
    expect(hooks.getDistinctionsPendingManual().result1).toEqual(RESULT_ARISE);
  });

  it("shows both manual boxes when both words fail", async () => {
    const { window } = await loadApp();
    const document = window.document;
    stubBothLookups(window, null, null);

    document.getElementById("distinctionsAddInput1").value = "zzzone";
    document.getElementById("distinctionsAddInput2").value = "zzztwo";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    expect(document.getElementById("distinctionsManualWord1Box").style.display).not.toBe("none");
    expect(document.getElementById("distinctionsManualWord2Box").style.display).not.toBe("none");
  });

  it("saves with the manually-typed meaning for just the failed word, keeping the successful lookup for the other", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubBothLookups(window, RESULT_ARISE, null);

    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "zzznotaword";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    document.getElementById("distinctionsManualUse2").value = "(adjective) A made-up test word.";
    document.getElementById("distinctionsManualExample2").value = "This is a zzznotaword example.";
    document.getElementById("distinctionsManualSaveBtn").click();
    await wait(50);

    expect(document.getElementById("distinctionsAddStatus").className).toContain("success");
    const added = hooks.distinctionsData.find((e) => e.w === "Arise vs zzznotaword");
    expect(added).toBeTruthy();
    expect(added.word1.senses[0].use).toContain("come into being"); // the real lookup result, untouched
    expect(added.word2.senses[0]).toEqual({
      use: "(adjective) A made-up test word.",
      examples: ["This is a zzznotaword example."]
    });
  });

  it("refuses to save a manual word with a blank meaning", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubBothLookups(window, null, null);

    document.getElementById("distinctionsAddInput1").value = "zzzone";
    document.getElementById("distinctionsAddInput2").value = "zzztwo";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    document.getElementById("distinctionsManualUse1").value = "A meaning for word one.";
    // Word 2's meaning left blank.
    document.getElementById("distinctionsManualSaveBtn").click();
    await wait(30);

    expect(document.getElementById("distinctionsAddStatus").className).toContain("error");
    expect(hooks.distinctionsData.some((e) => e.w === "zzzone vs zzztwo")).toBe(false);
  });

  it("Cancel hides the manual box and adds nothing", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    stubBothLookups(window, null, null);

    document.getElementById("distinctionsAddInput1").value = "zzzone";
    document.getElementById("distinctionsAddInput2").value = "zzztwo";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    document.getElementById("distinctionsManualCancelBtn").click();
    await wait(10);

    expect(document.getElementById("distinctionsManualBox").style.display).toBe("none");
    expect(document.getElementById("distinctionsAddStatus").textContent).toContain("Cancelled");
    expect(hooks.distinctionsData.some((e) => e.w === "zzzone vs zzztwo")).toBe(false);
  });
});

describe("Edit — owner-only, both words editable", () => {
  async function addAriseQuibblet(window, hooks) {
    stubBothLookups(window, RESULT_ARISE, RESULT_QUIBBLET);
    const document = window.document;
    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);
  }

  it("shows Edit/Delete only for owner-added entries, never for built-in seed pairs", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);

    // "Arise vs Quibblet" was just added by the owner — Edit/Delete visible.
    expect(document.querySelector("#distinctionsEntry .lb-edit-btn")).toBeTruthy();
    expect(document.querySelector("#distinctionsEntry .lb-delete-btn")).toBeTruthy();

    // A built-in migrated pair has no Edit/Delete.
    document.getElementById("distinctionsSelect").value = "Achieve vs Attain";
    document.getElementById("distinctionsSelect").dispatchEvent(new window.Event("change"));
    expect(document.querySelector("#distinctionsEntry .lb-edit-btn")).toBeNull();
    expect(document.querySelector("#distinctionsEntry .lb-delete-btn")).toBeNull();
  });

  it("opens a pre-filled form with both words' current values", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);

    document.querySelector("#distinctionsEntry .lb-edit-btn").click();

    expect(document.getElementById("distEditWord1").value).toBe("Arise");
    expect(document.getElementById("distEditWord2").value).toBe("Quibblet");
    expect(document.getElementById("distEditUse1").value).toContain("come into being");
    expect(document.getElementById("distEditSyn1").value).toBe("emerge");
    expect(document.getElementById("distEditAnt2").value).toBe("fall");
  });

  it("saves updated word/meaning/example/synonyms/antonyms for both words", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);

    document.querySelector("#distinctionsEntry .lb-edit-btn").click();
    document.getElementById("distEditUse1").value = "(verb) A corrected definition.";
    document.getElementById("distEditSyn1").value = "appear, occur";
    document.getElementById("distEditUse2").value = "(verb) Another corrected definition.";
    document.getElementById("distEditAnt2").value = "sink, drop";
    document.getElementById("distEditSaveBtn").click();
    await wait(30);

    const updated = hooks.distinctionsData.find((e) => e.w === "Arise vs Quibblet");
    expect(updated.word1.senses[0].use).toBe("(verb) A corrected definition.");
    expect(updated.word1.syn).toEqual(["appear", "occur"]);
    expect(updated.word2.senses[0].use).toBe("(verb) Another corrected definition.");
    expect(updated.word2.ant).toEqual(["sink", "drop"]);

    const headwords = Array.from(document.querySelectorAll("#distinctionsEntry .headword")).map((el) => el.textContent);
    expect(headwords).toEqual(["Arise", "Quibblet"]);
  });

  it("Cancel restores the normal read view without changing anything", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);

    document.querySelector("#distinctionsEntry .lb-edit-btn").click();
    document.getElementById("distEditWord1").value = "Something Else";
    document.getElementById("distEditCancelBtn").click();

    const headwords = Array.from(document.querySelectorAll("#distinctionsEntry .headword")).map((el) => el.textContent);
    expect(headwords).toEqual(["Arise", "Quibblet"]);
    expect(hooks.distinctionsData.some((e) => e.word1.w === "Something Else")).toBe(false);
  });

  it("refuses to rename into a pair that's already used by a different entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);

    document.querySelector("#distinctionsEntry .lb-edit-btn").click();
    document.getElementById("distEditWord1").value = "Achieve";
    document.getElementById("distEditWord2").value = "Attain";
    document.getElementById("distEditSaveBtn").click();
    await wait(30);

    expect(document.getElementById("distEditStatus").className).toContain("error");
    expect(document.getElementById("distEditStatus").textContent).toContain("already used");
    // The original "Arise vs Quibblet" survives, untouched.
    expect(hooks.distinctionsData.some((e) => e.w === "Arise vs Quibblet")).toBe(true);
    expect(hooks.distinctionsData.filter((e) => e.w === "Achieve vs Attain")).toHaveLength(1);
  });

  it("is gated behind isDeviceUnlocked(), refusing a save if the device locks mid-edit", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);

    document.querySelector("#distinctionsEntry .lb-edit-btn").click();
    document.getElementById("distEditUse1").value = "changed while locked";

    // Lock WITHOUT going through the Lock button — that click cascades a
    // full refreshDistinctionsUI() that would re-render the entry (now
    // read-only) and wipe the still-open edit form's fields out from
    // under this test. Flipping the flag directly proves
    // saveDistinctionEdit() itself checks isDeviceUnlocked() at save
    // time, with the form still on screen exactly as a real user
    // mid-edit would see it.
    window.localStorage.removeItem("mepf_toolkit_owner_unlocked");

    document.getElementById("distEditSaveBtn").click();
    await wait(20);

    const stillOriginal = hooks.distinctionsData.find((e) => e.w === "Arise vs Quibblet");
    expect(stillOriginal.word1.senses[0].use).not.toBe("changed while locked");
  });
});

describe("Delete — owner-only, with confirmation", () => {
  async function addAriseQuibblet(window, hooks) {
    stubBothLookups(window, RESULT_ARISE, RESULT_QUIBBLET);
    const document = window.document;
    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);
  }

  it("asks for confirmation, and does nothing if declined", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);
    window.confirm = () => false;

    document.querySelector("#distinctionsEntry .lb-delete-btn").click();
    await wait(20);

    expect(hooks.distinctionsData.some((e) => e.w === "Arise vs Quibblet")).toBe(true);
  });

  it("removes the entry from data, the dropdown, and the search index when confirmed", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);
    window.confirm = () => true;

    document.querySelector("#distinctionsEntry .lb-delete-btn").click();
    await wait(20);

    expect(hooks.distinctionsData.some((e) => e.w === "Arise vs Quibblet")).toBe(false);
    expect(Array.from(document.getElementById("distinctionsSelect").options).some((o) => o.value === "Arise vs Quibblet")).toBe(false);
    expect(hooks.wordIndexMap.has("arise")).toBe(false);
    expect(hooks.wordIndexMap.has("quibblet")).toBe(false);
    expect(hooks.searchIndex.some((i) => i.label === "Arise" && i.cat === "Distinction Word")).toBe(false);
  });

  it("falls back to another entry in the panel after deleting the one on screen", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);
    window.confirm = () => true;

    document.querySelector("#distinctionsEntry .lb-delete-btn").click();
    await wait(20);

    expect(document.getElementById("distinctionsEntry").querySelector(".headword")).toBeTruthy();
    expect(document.getElementById("distinctionsSelect").value).not.toBe("");
  });

  it("never clobbers another category's word that happens to share a spelling with a deleted pair's word", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    // "accept" is already a built-in Vocabulary Bank word; adding a
    // distinction pair using it must not have claimed the global index
    // for "accept" in the first place (see indexDistinctionsData), so
    // deleting the pair must not touch the Vocabulary Bank's entry.
    const acceptExcept = hooks.distinctionsData.find((e) => e.w === "Accept vs Except");
    expect(acceptExcept).toBeTruthy();
    const beforeCat = hooks.wordIndexMap.get("accept").cat;
    expect(beforeCat).not.toBe("Distinction Word");

    window.confirm = () => true;
    await hooks.deleteDistinctionEntry("Accept vs Except");

    expect(hooks.wordIndexMap.get("accept").cat).toBe(beforeCat);
  });

  it("the Delete button is not rendered at all while the device is locked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await addAriseQuibblet(window, hooks);

    document.getElementById("ownerLockBtn").click();
    hooks.refreshDistinctionsUI();

    expect(document.querySelector("#distinctionsEntry .lb-delete-btn")).toBeNull();
  });
});

describe("Distinctions Words persistence (real IndexedDB, not mocked)", () => {
  it("a pair added in one session is restored and searchable in the next", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    first.hooks.addDistinctionEntry(
      { w: "Arise vs Quibblet", word1: RESULT_ARISE, word2: RESULT_QUIBBLET, source: "online" },
      { persist: true }
    );
    await wait(50);

    const { window, hooks } = await loadApp({ indexedDBFactory });
    expect(hooks.distinctionsData.some((e) => e.w === "Arise vs Quibblet")).toBe(true);
    expect(Array.from(window.document.getElementById("distinctionsSelect").options).some((o) => o.value === "Arise vs Quibblet")).toBe(true);
  });

  it("is stored in the distinctionsEntries store, independent of vocabEntries", async () => {
    const idb = new IDBFactory();
    const { hooks } = await loadApp({ indexedDBFactory: idb });
    hooks.addDistinctionEntry(
      { w: "Arise vs Quibblet", word1: RESULT_ARISE, word2: RESULT_QUIBBLET, source: "online" },
      { persist: true }
    );
    await wait(50);

    const stored = await VocabCache.getDistinction("Arise vs Quibblet", { indexedDB: idb });
    expect(stored.word1.w).toBe("Arise");
    expect(stored.word2.w).toBe("Quibblet");
    const vocabStored = await VocabCache.get("Arise vs Quibblet", { indexedDB: idb });
    expect(vocabStored).toBeUndefined();
  });
});

describe("Favorites — favoriting either word individually", () => {
  it("shows an independent ☆ star on each word's headword row", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="distinctions"]').click();

    const toggles = document.querySelectorAll("#distinctionsEntry .fav-toggle");
    expect(toggles.length).toBe(2);
  });

  it("favoriting Word 1 only stars Word 1, not Word 2", async () => {
    const { window } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="distinctions"]').click();

    const toggles = document.querySelectorAll("#distinctionsEntry .fav-toggle");
    toggles[0].click();

    expect(toggles[0].classList.contains("active")).toBe(true);
    expect(toggles[1].classList.contains("active")).toBe(false);
  });

  it("resolveFavoriteEntryData() finds the right word within its pair for the Favorites PDF export", async () => {
    const { hooks } = await loadApp();
    const first = hooks.distinctionsData[0];
    const data = hooks.resolveFavoriteEntryData({ word: first.word2.w, cat: "Distinction Word" });
    expect(data.word).toBe(first.word2.w);
    expect(data.meanings[0].use).toBeTruthy();
  });
});

describe("Distinctions Words cross-device sync", () => {
  const OWNER_EMAIL = "owner@example.com";
  const OWNER_PASSWORD = "correct-horse-battery-staple";

  function makeFirebase() {
    return createFakeFirebase({
      ownerEmail: OWNER_EMAIL,
      users: { [OWNER_EMAIL]: OWNER_PASSWORD }
    });
  }

  it("seeds an empty distinctions array alongside languageBank and entries on first connect", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("dw-code-1");

    const doc = firebase._docs.get("syncedLogs/dw-code-1");
    expect(doc).toBeTruthy();
    expect(doc.distinctions).toEqual([]);
    expect(doc.languageBank).toBeTruthy(); // unaffected by adding this new field
  });

  it("a pair added while connected as owner reaches the shared doc's distinctions field, not just local IndexedDB", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    stubBothLookups(window, RESULT_ARISE, RESULT_QUIBBLET);

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("dw-code-2");

    const document = window.document;
    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    const doc = firebase._docs.get("syncedLogs/dw-code-2");
    expect(doc.distinctions.some((e) => e.w === "Arise vs Quibblet")).toBe(true);
    expect(document.getElementById("distinctionsAddStatus").textContent).toContain("Added");
  });

  it("only syncs owner-typed pairs (source:'online'), never the built-in seed content", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    stubBothLookups(window, RESULT_ARISE, RESULT_QUIBBLET);

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("dw-code-3");

    window.document.getElementById("distinctionsAddInput1").value = "Arise";
    window.document.getElementById("distinctionsAddInput2").value = "Quibblet";
    window.document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    const doc = firebase._docs.get("syncedLogs/dw-code-3");
    expect(doc.distinctions).toHaveLength(1);
    expect(doc.distinctions[0].w).toBe("Arise vs Quibblet");
  });

  it("a delete removes the pair from the shared doc's distinctions field", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    stubBothLookups(window, RESULT_ARISE, RESULT_QUIBBLET);

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("dw-code-4");

    window.document.getElementById("distinctionsAddInput1").value = "Arise";
    window.document.getElementById("distinctionsAddInput2").value = "Quibblet";
    window.document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    window.confirm = () => true;
    window.document.querySelector("#distinctionsEntry .lb-delete-btn").click();
    await wait(30);

    const doc = firebase._docs.get("syncedLogs/dw-code-4");
    expect(doc.distinctions).toHaveLength(0);
  });

  it("a device that connects to an already-seeded code pulls in the shared pair, searchable and cached offline", async () => {
    const firebase = makeFirebase();
    const owner = await loadApp({ firebase });
    stubBothLookups(owner.window, RESULT_ARISE, RESULT_QUIBBLET);
    await owner.hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await owner.hooks.connectSync("dw-code-5");
    owner.window.document.getElementById("distinctionsAddInput1").value = "Arise";
    owner.window.document.getElementById("distinctionsAddInput2").value = "Quibblet";
    owner.window.document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    const second = await loadApp({ firebase, ownerUnlocked: false });
    await second.hooks.connectSync("dw-code-5");
    await wait(50);

    expect(second.hooks.distinctionsData.some((e) => e.w === "Arise vs Quibblet")).toBe(true);
    second.hooks.runSearchPipeline("arise");
    expect(second.window.document.getElementById("searchResults").textContent).toContain("Distinction Word");
  });
});
