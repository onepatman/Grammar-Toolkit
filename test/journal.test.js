// Integration tests for the English Journal tab — a free-write practice
// space (separate from Research Notes) that timestamps every saved entry
// (date + 12-hour time) and automatically grades it for grammar via
// js/grammar-check.js, showing a score plus a wrong/why/correct row per
// issue found. Loads the real index.html in jsdom and dispatches real DOM
// clicks, same conventions as notes.test.js.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import { createFakeFirebase } from "./helpers/fake-firebase.js";

function wait(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openJournalTab(document) {
  document.querySelector('.thumb-tab[data-tab="journal"]').click();
  await wait();
}

// Installs a fake GrammarCheck.checkText on the loaded window so a test
// controls exactly what "grading" an entry produces, without any real
// network call — mirrors how markdown-bold.test.js stubs
// window.OnlineLookup.fetchOnlineDefinition for the same reason.
function stubGrading(window, result) {
  window.GrammarCheck.checkText = async () => result;
}

const TWO_ERROR_RESULT = {
  ok: true,
  score: 7.4,
  grade: { label: "Good", tier: "good" },
  wordCount: 6,
  errorCount: 2,
  corrections: [
    { wrong: "he go", right: "he goes", why: "Subject-verb agreement: 'he' needs 'goes', not 'go'." },
    { wrong: "recieve", right: "receive", why: "'i' before 'e' except after 'c'." }
  ]
};

const PERFECT_RESULT = {
  ok: true,
  score: 10,
  grade: { label: "Excellent", tier: "excellent" },
  wordCount: 8,
  errorCount: 0,
  corrections: []
};

describe("English Journal tab — writing and saving a practice entry", () => {
  it("shows an empty state with nothing written yet", async () => {
    const { window } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    expect(document.getElementById("journalList").textContent).toContain("No journal entries yet");
  });

  it("saving an entry with a title and body adds it, timestamped with date and 12-hour time", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    stubGrading(window, PERFECT_RESULT);

    document.getElementById("journalTitleInput").value = "My weekend";
    document.getElementById("journalBodyInput").value = "I go to the market and buy some fruit.";
    document.getElementById("journalSaveBtn").click();
    await wait();

    expect(hooks.journalData).toHaveLength(1);
    expect(hooks.journalData[0].title).toBe("My weekend");
    expect(hooks.journalData[0].createdAt).toBeGreaterThan(0);
    const card = document.querySelector("#journalList .journal-card");
    expect(card.textContent).toContain("My weekend");
    expect(card.textContent).toContain("I go to the market");
    // 12-hour time reference: "AM" or "PM" somewhere in the rendered date.
    expect(card.querySelector(".journal-card-date").textContent).toMatch(/AM|PM/);
    // Inputs are cleared after a successful save.
    expect(document.getElementById("journalTitleInput").value).toBe("");
    expect(document.getElementById("journalBodyInput").value).toBe("");
    expect(document.getElementById("journalWordCount").textContent).toBe("0 words");
  });

  it("saves with a blank title (title is optional) — shown as 'Untitled entry'", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    stubGrading(window, PERFECT_RESULT);

    document.getElementById("journalTitleInput").value = "";
    document.getElementById("journalBodyInput").value = "Just some free writing today.";
    document.getElementById("journalSaveBtn").click();
    await wait();

    expect(hooks.journalData).toHaveLength(1);
    expect(document.querySelector("#journalList .journal-card-title").textContent).toBe("Untitled entry");
  });

  it("refuses to save a blank body, even with a title filled in", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);

    document.getElementById("journalTitleInput").value = "A title";
    document.getElementById("journalBodyInput").value = "   ";
    document.getElementById("journalSaveBtn").click();
    expect(hooks.journalData).toHaveLength(0);
    expect(document.getElementById("journalAddStatus").className).toContain("error");
  });

  it("the word count updates live as the body is typed", async () => {
    const { window } = await loadApp();
    const document = window.document;
    await openJournalTab(document);

    const bodyInput = document.getElementById("journalBodyInput");
    bodyInput.value = "One two three four";
    bodyInput.dispatchEvent(new window.Event("input"));
    expect(document.getElementById("journalWordCount").textContent).toBe("4 words");
  });

  it("supports **bold** markdown in both title and body, but not as literal asterisks", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    stubGrading(window, PERFECT_RESULT);

    document.getElementById("journalTitleInput").value = "A **great** day";
    document.getElementById("journalBodyInput").value = "I felt very **proud** of myself.";
    document.getElementById("journalSaveBtn").click();
    await wait();

    expect(hooks.journalData[0].title).toBe("A <b>great</b> day");
    expect(hooks.journalData[0].body).toBe("I felt very <b>proud</b> of myself.");
    const card = document.querySelector("#journalList .journal-card");
    expect(card.querySelector(".journal-card-body b").textContent).toBe("proud");
  });

  it("lists multiple entries newest first", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    stubGrading(window, PERFECT_RESULT);

    document.getElementById("journalTitleInput").value = "first entry";
    document.getElementById("journalBodyInput").value = "Written first.";
    document.getElementById("journalSaveBtn").click();
    await wait(5);

    document.getElementById("journalTitleInput").value = "second entry";
    document.getElementById("journalBodyInput").value = "Written second.";
    document.getElementById("journalSaveBtn").click();
    await wait();

    const titles = Array.from(document.querySelectorAll("#journalList .journal-card-title")).map((el) => el.textContent);
    expect(titles).toEqual(["second entry", "first entry"]);
  });
});

describe("English Journal tab — automatic grammar grading", () => {
  it("shows a 'checking' state immediately after save, then the score and corrections once grading resolves", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    // A deferred promise (instead of an instantly-resolving stub) so the
    // test can observe the transient "checking" state before choosing
    // when grading actually resolves.
    let resolveGrading;
    window.GrammarCheck.checkText = () => new Promise((resolve) => { resolveGrading = resolve; });

    document.getElementById("journalBodyInput").value = "He go to the market to recieve his order.";
    document.getElementById("journalSaveBtn").click();
    await wait(20);
    // Before the grading promise resolves, the card shows a checking state.
    expect(document.querySelector("#journalList .journal-card").textContent).toContain("Checking your grammar");

    resolveGrading(TWO_ERROR_RESULT);
    await wait(20);
    const card = document.querySelector("#journalList .journal-card");
    expect(card.querySelector(".journal-score-badge").textContent).toBe("7.4/10");
    expect(card.textContent).toContain("Good");
    const rows = card.querySelectorAll(".journal-correction-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".journal-correction-wrong").textContent).toBe("he go");
    expect(rows[0].querySelector(".journal-correction-right").textContent).toBe("he goes");
    expect(rows[0].textContent).toContain("Subject-verb agreement");
  });

  it("shows a celebratory perfect-score row and no corrections when nothing was found", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    stubGrading(window, PERFECT_RESULT);

    document.getElementById("journalBodyInput").value = "This entry has no grammar issues at all today.";
    document.getElementById("journalSaveBtn").click();
    await wait(20);

    const card = document.querySelector("#journalList .journal-card");
    expect(card.querySelector(".journal-score-badge").textContent).toBe("10.0/10");
    expect(card.textContent).toContain("No grammar issues found");
    expect(card.querySelector(".journal-correction-row")).toBeNull();
    expect(card.querySelector(".journal-add-fixes-btn")).toBeNull();
  });

  it("shows an unavailable message with a Retry button when the grammar check fails (e.g. offline), and Retry re-checks", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    stubGrading(window, { ok: false, reason: "offline" });

    document.getElementById("journalBodyInput").value = "Written while offline.";
    document.getElementById("journalSaveBtn").click();
    await wait(20);

    let card = document.querySelector("#journalList .journal-card");
    expect(card.textContent).toContain("Grammar check unavailable");
    expect(card.textContent).toContain("offline");
    expect(hooks.journalData[0].grading.status).toBe("unavailable");

    stubGrading(window, PERFECT_RESULT);
    document.querySelector("#journalList .journal-retry-btn").click();
    await wait(20);

    card = document.querySelector("#journalList .journal-card");
    expect(card.querySelector(".journal-score-badge").textContent).toBe("10.0/10");
    expect(hooks.journalData[0].grading.status).toBe("graded");
  });
});

describe("English Journal tab — connecting corrections to the app's shared correction log", () => {
  it("'Add these to my Correction Log' files each correction into the same personal correction log Word Bank -> My Correction Log uses", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    stubGrading(window, TWO_ERROR_RESULT);

    document.getElementById("journalBodyInput").value = "He go to the market to recieve his order.";
    document.getElementById("journalSaveBtn").click();
    await wait(20);

    expect(hooks.loadPersonalCorrections()).toHaveLength(0);
    document.querySelector("#journalList .journal-add-fixes-btn").click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved).toHaveLength(2);
    expect(saved[0].category).toBe(hooks.CORRECTION_LOG_ENTRY.w);
    expect(saved[0].examples[0]).toEqual({ wrong: "he go", right: "he goes" });
    expect(saved[0].why).toContain("Subject-verb agreement");
    expect(hooks.journalData[0].grading.addedToFixes).toBe(true);

    // The button becomes a disabled "already added" indicator, and the
    // same corrections aren't filed a second time by re-clicking.
    const btn = document.querySelector("#journalList .journal-add-fixes-btn");
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("Added to my Correction Log");

    // The newly filed correction actually shows up in the shared
    // correction log's own rendered senses (rebuildCorrectionLog runs
    // as part of Add to Correction Log itself) — proving the two tabs
    // are really connected, not just that localStorage happens to
    // hold the same array.
    const logText = JSON.stringify(hooks.CORRECTION_LOG_ENTRY.senses);
    expect(logText).toContain("he go");
    expect(logText).toContain("he goes");
  });

  it("addJournalCorrectionsToFixes is gated behind isDeviceUnlocked() even if called directly", async () => {
    const { hooks } = await loadApp({ ownerUnlocked: false });
    hooks.addJournalEntry(
      { title: "t", body: "b", grading: { status: "graded", score: 5, grade: { label: "Fair", tier: "fair" }, wordCount: 1, corrections: [{ wrong: "b", right: "good", why: "reason" }], addedToFixes: false } },
      { persist: true }
    );
    await hooks.addJournalCorrectionsToFixes(hooks.journalData[0].id);
    expect(hooks.loadPersonalCorrections()).toHaveLength(0);
    expect(hooks.journalData[0].grading.addedToFixes).toBe(false);
  });
});

describe("English Journal tab — Edit and Delete (owner-gated)", () => {
  it("Edit and Delete buttons are hidden on a locked device", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    hooks.addJournalEntry({ title: "an entry", body: "some content", grading: { status: "pending" } }, { persist: true });
    await openJournalTab(document);

    expect(document.querySelector("#journalList .journal-edit-btn")).toBeNull();
    expect(document.querySelector("#journalList .journal-delete-btn")).toBeNull();
    expect(document.getElementById("journalAddBox").style.display).toBe("none");
  });

  it("editing without changing the body keeps the existing grading (no re-check)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addJournalEntry({ title: "old title", body: "unchanged body", grading: PERFECT_RESULT }, { persist: true });
    await openJournalTab(document);
    stubGrading(window, TWO_ERROR_RESULT);

    document.querySelector("#journalList .journal-edit-btn").click();
    const editCard = document.querySelector("#journalList .journal-card-editing");
    editCard.querySelector(".journal-edit-title").value = "new title";
    editCard.querySelector(".journal-save-edit-btn").click();
    await wait(20);

    expect(hooks.journalData[0].title).toBe("new title");
    expect(hooks.journalData[0].grading.score).toBe(10);
  });

  it("editing the body resets grading and re-checks it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addJournalEntry({ title: "title", body: "old body", grading: PERFECT_RESULT }, { persist: true });
    await openJournalTab(document);
    stubGrading(window, TWO_ERROR_RESULT);

    document.querySelector("#journalList .journal-edit-btn").click();
    const editCard = document.querySelector("#journalList .journal-card-editing");
    editCard.querySelector(".journal-edit-body").value = "a brand new body with he go recieve";
    editCard.querySelector(".journal-save-edit-btn").click();
    await wait(20);

    expect(hooks.journalData[0].body).toBe("a brand new body with he go recieve");
    expect(hooks.journalData[0].grading.score).toBe(7.4);
    expect(hooks.journalData[0].grading.corrections).toHaveLength(2);
  });

  it("preserves the original createdAt while editing", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addJournalEntry({ title: "t", body: "b", grading: PERFECT_RESULT }, { persist: true });
    const originalCreatedAt = hooks.journalData[0].createdAt;
    await openJournalTab(document);
    stubGrading(window, PERFECT_RESULT);

    await wait(5);
    document.querySelector("#journalList .journal-edit-btn").click();
    const editCard = document.querySelector("#journalList .journal-card-editing");
    editCard.querySelector(".journal-edit-body").value = "edited body";
    editCard.querySelector(".journal-save-edit-btn").click();
    await wait(20);

    expect(hooks.journalData[0].createdAt).toBe(originalCreatedAt);
    expect(hooks.journalData[0].modifiedAt).toBeGreaterThan(originalCreatedAt);
  });

  it("refuses to save an edit with a blank body", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addJournalEntry({ title: "t", body: "b", grading: PERFECT_RESULT }, { persist: true });
    await openJournalTab(document);

    document.querySelector("#journalList .journal-edit-btn").click();
    const editCard = document.querySelector("#journalList .journal-card-editing");
    editCard.querySelector(".journal-edit-body").value = "   ";
    editCard.querySelector(".journal-save-edit-btn").click();
    expect(editCard.querySelector(".add-status").className).toContain("error");
    expect(hooks.journalData[0].body).toBe("b");
  });

  it("Cancel on the edit form discards changes", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addJournalEntry({ title: "keep me", body: "keep this body", grading: PERFECT_RESULT }, { persist: true });
    await openJournalTab(document);

    document.querySelector("#journalList .journal-edit-btn").click();
    const editCard = document.querySelector("#journalList .journal-card-editing");
    editCard.querySelector(".journal-edit-title").value = "should not save";
    editCard.querySelector(".journal-cancel-edit-btn").click();

    expect(hooks.journalData[0].title).toBe("keep me");
    expect(document.querySelector("#journalList .journal-card-title").textContent).toBe("keep me");
  });

  it("Delete asks for confirmation and removes the entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addJournalEntry({ title: "delete me", body: "content", grading: PERFECT_RESULT }, { persist: true });
    await openJournalTab(document);

    window.confirm = () => false;
    document.querySelector("#journalList .journal-delete-btn").click();
    await wait();
    expect(hooks.journalData).toHaveLength(1);

    window.confirm = () => true;
    document.querySelector("#journalList .journal-delete-btn").click();
    await wait();
    expect(hooks.journalData).toHaveLength(0);
    expect(document.getElementById("journalList").textContent).toContain("No journal entries yet");
  });

  it("deleteJournalEntry() is gated behind isDeviceUnlocked() even if called directly", async () => {
    const { hooks } = await loadApp({ ownerUnlocked: false });
    hooks.addJournalEntry({ title: "protected", body: "content", grading: { status: "pending" } }, { persist: true });
    await hooks.deleteJournalEntry(hooks.journalData[0].id);
    expect(hooks.journalData).toHaveLength(1);
  });
});

describe("English Journal tab — search", () => {
  it("search filters by title and body text", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openJournalTab(document);
    hooks.addJournalEntry({ title: "my weekend", body: "I went hiking in the mountains.", grading: PERFECT_RESULT }, { persist: true });
    hooks.addJournalEntry({ title: "a work day", body: "Meetings all morning, then lunch.", grading: PERFECT_RESULT }, { persist: true });
    hooks.renderJournalTab();
    await wait();

    const searchInput = document.getElementById("journalSearchInput");
    searchInput.value = "hiking";
    searchInput.dispatchEvent(new window.Event("input"));
    let titles = Array.from(document.querySelectorAll("#journalList .journal-card-title")).map((el) => el.textContent);
    expect(titles).toEqual(["my weekend"]);

    searchInput.value = "";
    searchInput.dispatchEvent(new window.Event("input"));
    titles = Array.from(document.querySelectorAll("#journalList .journal-card-title")).map((el) => el.textContent);
    expect(titles).toHaveLength(2);
  });
});

describe("English Journal persists across sessions (real IndexedDB, not mocked)", () => {
  it("an entry written in one session, including its grading, is still there when the app reloads", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    first.hooks.addJournalEntry({ title: "survives reload", body: "persisted content", grading: TWO_ERROR_RESULT }, { persist: true });
    await wait(50);

    const { window, hooks } = await loadApp({ indexedDBFactory });
    const document = window.document;
    await hooks.journalCacheRestorePromise;
    await openJournalTab(document);

    expect(hooks.journalData.some((j) => j.title === "survives reload")).toBe(true);
    const restored = hooks.journalData.find((j) => j.title === "survives reload");
    expect(restored.grading.score).toBe(7.4);
    expect(document.getElementById("journalList").textContent).toContain("survives reload");
  });
});

describe("English Journal cross-device sync", () => {
  const OWNER_EMAIL = "owner@example.com";
  const OWNER_PASSWORD = "correct-horse-battery-staple";

  function makeFirebase() {
    return createFakeFirebase({
      ownerEmail: OWNER_EMAIL,
      users: { [OWNER_EMAIL]: OWNER_PASSWORD }
    });
  }

  it("seeds an empty journal array alongside the other fields on first connect", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("journal-code-1");
    await wait();

    const doc = firebase._docs.get("syncedLogs/journal-code-1");
    expect(doc).toBeTruthy();
    expect(doc.journal).toEqual([]);
  });

  it("writing an entry while connected as owner pushes it to the shared doc's journal field", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("journal-code-2");
    await wait();

    hooks.addJournalEntry({ title: "syncs across devices", body: "content", grading: PERFECT_RESULT }, { persist: true });
    await hooks.pushToSync(hooks.loadPersonalCorrections());
    await wait();

    const doc = firebase._docs.get("syncedLogs/journal-code-2");
    expect(doc.journal.some((j) => j.title === "syncs across devices")).toBe(true);
  });

  it("a device connecting to an already-seeded code pulls in the remote entry", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/journal-code-3", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [], favorites: [], notes: [],
      journal: [{ id: "journal_seed_1", title: "from another device", body: "written elsewhere", createdAt: 1000, modifiedAt: 1000, grading: { status: "pending" } }]
    });

    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;
    await hooks.connectSync("journal-code-3");
    await wait();

    expect(hooks.journalData.some((j) => j.title === "from another device")).toBe(true);
    await openJournalTab(document);
    expect(document.getElementById("journalList").textContent).toContain("from another device");
  });

  it("removes a local entry that's no longer in the remote list — remote is fully authoritative, like Notes", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase, ownerUnlocked: false });

    hooks.addJournalEntry({ id: "journal_local_1", title: "locally written, never synced", body: "content", grading: { status: "pending" } }, { persist: true });
    expect(hooks.journalData).toHaveLength(1);

    firebase._docs.set("syncedLogs/journal-code-4", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [], favorites: [], notes: [],
      journal: [{ id: "journal_remote_1", title: "from the shared list", body: "content", createdAt: 2000, modifiedAt: 2000, grading: { status: "pending" } }]
    });
    await hooks.connectSync("journal-code-4");
    await wait();

    expect(hooks.journalData.some((j) => j.id === "journal_local_1")).toBe(false);
    expect(hooks.journalData.some((j) => j.id === "journal_remote_1")).toBe(true);
  });

  it("applyRemoteJournal leaves journalData untouched when the field is missing (older shared doc)", async () => {
    const { hooks } = await loadApp();
    hooks.addJournalEntry({ title: "untouched", body: "content", grading: { status: "pending" } }, { persist: true });
    hooks.applyRemoteJournal(undefined);
    expect(hooks.journalData).toHaveLength(1);
    expect(hooks.journalData[0].title).toBe("untouched");
  });
});
