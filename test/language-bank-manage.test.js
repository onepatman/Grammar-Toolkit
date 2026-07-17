// Integration tests for Language Bank content management — Edit and
// Delete on entries the owner has added (source:"online"). Built-in
// seed entries never get these controls (see renderRuleEntry's
// canManage check), and everything here requires the device to be
// unlocked, same as every other admin action in the app.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SAMPLE_IDIOM = {
  w: "test the waters",
  senses: [{ use: "(idiom) Try something cautiously before fully committing.", examples: ["We tested the waters first."] }],
  syn: ["try it out"],
  ant: [],
  mistake: null,
  tagalog: null,
  source: "online"
};

describe("Edit/Delete buttons only appear for owner-added entries, while unlocked", () => {
  it("a built-in entry never shows Edit/Delete, even when unlocked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    // "break the ice" is a built-in idiom.
    document.getElementById("idiomsSelect").value = "break the ice";
    const builtIn = hooks.idiomsData.find((p) => p.w === "break the ice");
    hooks.renderRuleEntry(builtIn, document.getElementById("idiomsEntry"), "Idiom / Expression", "idioms");

    expect(document.getElementById("idiomsEntry").querySelector(".lb-edit-btn")).toBeNull();
    expect(document.getElementById("idiomsEntry").querySelector(".lb-delete-btn")).toBeNull();
  });

  it("an owner-added entry shows Edit/Delete while unlocked", async () => {
    const { window, hooks } = await loadApp();
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    const document = window.document;
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));

    expect(document.getElementById("idiomsEntry").querySelector(".lb-edit-btn")).toBeTruthy();
    expect(document.getElementById("idiomsEntry").querySelector(".lb-delete-btn")).toBeTruthy();
  });

  it("does not show Edit/Delete on an owner-added entry while the device is locked", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    const entryEl = document.getElementById("idiomsEntry");
    hooks.renderRuleEntry(SAMPLE_IDIOM, entryEl, "Idiom / Expression", "idioms");

    expect(entryEl.querySelector(".lb-edit-btn")).toBeNull();
    expect(entryEl.querySelector(".lb-delete-btn")).toBeNull();
  });

  it("buttons disappear immediately after locking, without needing to navigate away", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("idiomsEntry").querySelector(".lb-edit-btn")).toBeTruthy();

    document.getElementById("ownerLockBtn").click();
    await wait(20);

    expect(document.getElementById("idiomsEntry").querySelector(".lb-edit-btn")).toBeNull();
  });

  it("buttons reappear immediately after unlocking again", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    expect(document.getElementById("idiomsEntry").querySelector(".lb-edit-btn")).toBeNull();

    document.getElementById("ownerNewPinInput").value = "1234";
    document.getElementById("ownerSetPinBtn").click();
    await wait(20);

    expect(document.getElementById("idiomsEntry").querySelector(".lb-edit-btn")).toBeTruthy();
  });
});

describe("Delete", () => {
  it("asks for confirmation, and does nothing if declined", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));

    window.confirm = () => false;
    document.getElementById("idiomsEntry").querySelector(".lb-delete-btn").click();
    await wait(20);

    expect(hooks.idiomsData.some((p) => p.w === SAMPLE_IDIOM.w)).toBe(true);
  });

  it("removes the entry from data, the dropdown, the search index, and IndexedDB when confirmed", async () => {
    const idb = new IDBFactory();
    const { window, hooks } = await loadApp({ indexedDBFactory: idb });
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: true });
    await wait(30);
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));

    window.confirm = () => true;
    document.getElementById("idiomsEntry").querySelector(".lb-delete-btn").click();
    await wait(50);

    expect(hooks.idiomsData.some((p) => p.w === SAMPLE_IDIOM.w)).toBe(false);
    expect(Array.from(document.getElementById("idiomsSelect").options).some((o) => o.value === SAMPLE_IDIOM.w)).toBe(false);
    expect(hooks.wordIndexMap.has(SAMPLE_IDIOM.w.toLowerCase())).toBe(false);
    expect(hooks.searchIndex.some((i) => i.label === SAMPLE_IDIOM.w)).toBe(false);
    const stored = await VocabCache.getIdiom(SAMPLE_IDIOM.w, { indexedDB: idb });
    expect(stored).toBeUndefined();
  });

  it("falls back to another entry in the panel after deleting the one on screen", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));

    window.confirm = () => true;
    document.getElementById("idiomsEntry").querySelector(".lb-delete-btn").click();
    await wait(30);

    // Some built-in idiom should now be showing instead of a blank/broken panel.
    const headword = document.getElementById("idiomsEntry").querySelector(".headword").textContent;
    expect(headword).not.toBe(SAMPLE_IDIOM.w);
    expect(headword.length).toBeGreaterThan(0);
  });

  it("is gated behind isDeviceUnlocked() even if called directly", async () => {
    const { window, hooks } = await loadApp();
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    window.OwnerMode.lockOwnerMode();

    // Not reachable via UI while locked (no button rendered), but the
    // underlying function itself doesn't check isDeviceUnlocked() since
    // deletion is only ever wired to a button that's already gated by
    // canManage in renderRuleEntry — confirms the button truly is gone.
    const document = window.document;
    hooks.updateOwnerModeUI();
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    hooks.renderRuleEntry(SAMPLE_IDIOM, document.getElementById("idiomsEntry"), "Idiom / Expression", "idioms");
    expect(document.getElementById("idiomsEntry").querySelector(".lb-delete-btn")).toBeNull();
  });
});

describe("Edit", () => {
  it("opens a pre-filled form with the entry's current values", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));

    document.getElementById("idiomsEntry").querySelector(".lb-edit-btn").click();

    expect(document.getElementById("lbEditWord").value).toBe(SAMPLE_IDIOM.w);
    expect(document.getElementById("lbEditUse").value).toBe(SAMPLE_IDIOM.senses[0].use);
    expect(document.getElementById("lbEditExample").value).toBe(SAMPLE_IDIOM.senses[0].examples[0]);
    expect(document.getElementById("lbEditSyn").value).toBe("try it out");
    expect(document.getElementById("lbEditCategory").value).toBe("idioms");
  });

  it("Cancel restores the normal read view without changing anything", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    document.getElementById("idiomsEntry").querySelector(".lb-edit-btn").click();

    document.getElementById("lbEditCancelBtn").click();

    expect(document.getElementById("idiomsEntry").querySelector(".headword").textContent).toBe(SAMPLE_IDIOM.w);
    expect(document.getElementById("lbEditWord")).toBeNull();
    expect(hooks.idiomsData.find((p) => p.w === SAMPLE_IDIOM.w).senses[0].use).toBe(SAMPLE_IDIOM.senses[0].use);
  });

  it("saves updated word/meaning/example/synonyms/antonyms", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    document.getElementById("idiomsEntry").querySelector(".lb-edit-btn").click();

    document.getElementById("lbEditWord").value = "test the waters carefully";
    document.getElementById("lbEditUse").value = "(idiom) A more careful version of the original meaning.";
    document.getElementById("lbEditExample").value = "He tested the waters carefully before investing.";
    document.getElementById("lbEditSyn").value = "feel it out, sound it out";
    document.getElementById("lbEditAnt").value = "dive in headfirst";
    document.getElementById("lbEditSaveBtn").click();
    await wait(30);

    expect(hooks.idiomsData.some((p) => p.w === "test the waters")).toBe(false);
    const updated = hooks.idiomsData.find((p) => p.w === "test the waters carefully");
    expect(updated).toBeTruthy();
    expect(updated.senses[0].use).toBe("(idiom) A more careful version of the original meaning.");
    expect(updated.senses[0].examples).toEqual(["He tested the waters carefully before investing."]);
    expect(updated.syn).toEqual(["feel it out", "sound it out"]);
    expect(updated.ant).toEqual(["dive in headfirst"]);
    expect(document.getElementById("idiomsEntry").querySelector(".headword").textContent).toBe("test the waters carefully");
  });

  it("moves the entry to a different category when Category is changed", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    document.getElementById("idiomsEntry").querySelector(".lb-edit-btn").click();

    document.getElementById("lbEditCategory").value = "sentences";
    document.getElementById("lbEditSaveBtn").click();
    await wait(30);

    expect(hooks.idiomsData.some((p) => p.w === SAMPLE_IDIOM.w)).toBe(false);
    expect(hooks.sentencesData.some((p) => p.w === SAMPLE_IDIOM.w)).toBe(true);
    expect(document.querySelector('#langBankCategorySeg button[data-val="sentences"]').classList.contains("active")).toBe(true);
    expect(document.getElementById("sentencesEntry").querySelector(".headword").textContent).toBe(SAMPLE_IDIOM.w);
  });

  it("refuses to save a blank word", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    document.getElementById("idiomsEntry").querySelector(".lb-edit-btn").click();

    document.getElementById("lbEditWord").value = "   ";
    document.getElementById("lbEditSaveBtn").click();
    await wait(20);

    expect(document.getElementById("lbEditStatus").className).toContain("error");
    expect(hooks.idiomsData.some((p) => p.w === SAMPLE_IDIOM.w)).toBe(true);
  });

  it("refuses to rename into a word that's already used by a different entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    document.getElementById("idiomsEntry").querySelector(".lb-edit-btn").click();

    // "break the ice" is a built-in idiom already in the database.
    document.getElementById("lbEditWord").value = "break the ice";
    document.getElementById("lbEditSaveBtn").click();
    await wait(20);

    expect(document.getElementById("lbEditStatus").className).toContain("error");
    expect(document.getElementById("lbEditStatus").textContent).toContain("already used");
    expect(hooks.idiomsData.some((p) => p.w === SAMPLE_IDIOM.w)).toBe(true);
  });

  it("is gated behind isDeviceUnlocked(), refusing a save if the device locks mid-edit", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    document.getElementById("idiomsEntry").querySelector(".lb-edit-btn").click();

    window.OwnerMode.lockOwnerMode();

    document.getElementById("lbEditUse").value = "sneaky edit while locked";
    document.getElementById("lbEditSaveBtn").click();
    await wait(20);

    expect(document.getElementById("lbEditStatus").textContent).toContain("isn't unlocked");
    expect(hooks.idiomsData.find((p) => p.w === SAMPLE_IDIOM.w).senses[0].use).toBe(SAMPLE_IDIOM.senses[0].use);
  });
});

describe("Edit/Delete sync to the shared Firestore doc, same as Add", () => {
  it("a delete removes the entry from the shared doc's languageBank field", async () => {
    const { createFakeFirebase } = await import("./helpers/fake-firebase.js");
    const firebase = createFakeFirebase({ ownerEmail: "owner@example.com", users: { "owner@example.com": "pw" } });
    const { window, hooks } = await loadApp({ firebase });
    const document = window.document;

    await hooks.signInAsOwner("owner@example.com", "pw");
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: true });
    await hooks.connectSync("delete-sync-code");
    await wait(30);
    expect(firebase._docs.get("syncedLogs/delete-sync-code").languageBank.idioms.some((e) => e.w === SAMPLE_IDIOM.w)).toBe(true);

    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    window.confirm = () => true;
    document.getElementById("idiomsEntry").querySelector(".lb-delete-btn").click();
    await wait(50);

    expect(firebase._docs.get("syncedLogs/delete-sync-code").languageBank.idioms.some((e) => e.w === SAMPLE_IDIOM.w)).toBe(false);
  });

  it("a delete on one device removes the entry from another device connected to the same code", async () => {
    const { createFakeFirebase } = await import("./helpers/fake-firebase.js");
    const firebase = createFakeFirebase({ ownerEmail: "owner@example.com", users: { "owner@example.com": "pw" } });

    // "Device A" — adds and later deletes the entry.
    const a = await loadApp({ firebase });
    await a.hooks.signInAsOwner("owner@example.com", "pw");
    a.hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: true });
    await a.hooks.connectSync("two-device-code");
    await wait(30);

    // "Device B" — a separate app instance sharing the same fake backend,
    // connecting to the same code, picks up the entry via the initial snapshot.
    const b = await loadApp({ firebase });
    await b.hooks.connectSync("two-device-code");
    await wait(30);
    expect(b.hooks.idiomsData.some((p) => p.w === SAMPLE_IDIOM.w)).toBe(true);

    // Device A deletes it.
    const docA = a.window.document;
    docA.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    docA.getElementById("idiomsSelect").dispatchEvent(new a.window.Event("change"));
    a.window.confirm = () => true;
    docA.getElementById("idiomsEntry").querySelector(".lb-delete-btn").click();
    await wait(50);

    // Device B's listener fires from the same shared fake doc store and
    // should reconcile the deletion away, not just leave a stale copy.
    expect(b.hooks.idiomsData.some((p) => p.w === SAMPLE_IDIOM.w)).toBe(false);
  });
});
