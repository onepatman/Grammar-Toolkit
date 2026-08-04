// Integration tests for the Research Notes tab — a free-form personal
// journal (title + body + tags) separate from every word-based tab, added
// per the user's request: "para hindi lang siya dictionary... pang save ko
// narin ng mga nareresearch ko about English." Loads the real index.html in
// jsdom and dispatches real DOM clicks, same conventions as
// favorites.test.js / favorites-sync.test.js.
import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { loadApp } from "./helpers/load-app.js";
import { createFakeFirebase } from "./helpers/fake-firebase.js";

function wait(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openNotesTab(document) {
  document.querySelector('.thumb-tab[data-tab="notes"]').click();
  await wait();
}

describe("Research Notes tab — writing and reading a personal, free-form note", () => {
  it("shows an empty state with nothing written yet", async () => {
    const { window } = await loadApp();
    const document = window.document;
    await openNotesTab(document);
    expect(document.getElementById("notesList").textContent).toContain("No notes yet");
  });

  it("saving a note with just a title and body (no tags) adds it to the list", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openNotesTab(document);

    document.getElementById("noteTitleInput").value = "less vs fewer";
    document.getElementById("noteBodyInput").value = "'Less' is for uncountable nouns (less water), 'fewer' is for countable nouns (fewer apples).";
    document.getElementById("noteSaveBtn").click();
    await wait();

    expect(hooks.notesData).toHaveLength(1);
    expect(hooks.notesData[0].title).toBe("less vs fewer");
    const card = document.querySelector("#notesList .note-card");
    expect(card.textContent).toContain("less vs fewer");
    expect(card.textContent).toContain("uncountable nouns");
    // Inputs are cleared after a successful save.
    expect(document.getElementById("noteTitleInput").value).toBe("");
    expect(document.getElementById("noteBodyInput").value).toBe("");
  });

  it("refuses to save with a blank title or a blank body", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openNotesTab(document);

    document.getElementById("noteTitleInput").value = "";
    document.getElementById("noteBodyInput").value = "Some content.";
    document.getElementById("noteSaveBtn").click();
    expect(hooks.notesData).toHaveLength(0);
    expect(document.getElementById("noteAddStatus").className).toContain("error");

    document.getElementById("noteTitleInput").value = "A title";
    document.getElementById("noteBodyInput").value = "   ";
    document.getElementById("noteSaveBtn").click();
    expect(hooks.notesData).toHaveLength(0);
  });

  it("saves tags typed into the chip editor alongside the note", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openNotesTab(document);

    document.getElementById("noteTitleInput").value = "subjunctive mood";
    document.getElementById("noteBodyInput").value = "Used for hypotheticals: 'If I were you...'";
    const tagsEl = document.getElementById("noteTagsChips");
    tagsEl.querySelector(".chip-editor-input").value = "grammar";
    hooks.commitChipEditorInput(tagsEl);
    tagsEl.querySelector(".chip-editor-input").value = "advanced";
    hooks.commitChipEditorInput(tagsEl);
    document.getElementById("noteSaveBtn").click();
    await wait();

    expect(hooks.notesData[0].tags).toEqual(["grammar", "advanced"]);
    const card = document.querySelector("#notesList .note-card");
    expect(card.textContent).toContain("grammar");
    expect(card.textContent).toContain("advanced");
  });

  it("lists multiple notes newest first", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await openNotesTab(document);

    document.getElementById("noteTitleInput").value = "first note";
    document.getElementById("noteBodyInput").value = "Written first.";
    document.getElementById("noteSaveBtn").click();
    await wait(5);

    document.getElementById("noteTitleInput").value = "second note";
    document.getElementById("noteBodyInput").value = "Written second.";
    document.getElementById("noteSaveBtn").click();
    await wait();

    const titles = Array.from(document.querySelectorAll("#notesList .note-card-title")).map((el) => el.textContent);
    expect(titles).toEqual(["second note", "first note"]);
  });
});

describe("Research Notes tab — search and tag filtering", () => {
  async function seedThreeNotes(document, hooks) {
    await openNotesTab(document);
    hooks.addNoteEntry({ title: "less vs fewer", body: "Countable vs uncountable.", tags: ["grammar"] }, { persist: true });
    hooks.addNoteEntry({ title: "idiom: break the ice", body: "Used to start a conversation in a social setting.", tags: ["idioms"] }, { persist: true });
    hooks.addNoteEntry({ title: "engineering term: tolerance", body: "The allowed deviation from a target value.", tags: ["engineering", "grammar"] }, { persist: true });
    hooks.renderNotesTab();
    await wait();
  }

  it("search filters by title, body, and tag text", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedThreeNotes(document, hooks);

    const searchInput = document.getElementById("notesSearchInput");
    searchInput.value = "conversation";
    searchInput.dispatchEvent(new window.Event("input"));
    let titles = Array.from(document.querySelectorAll("#notesList .note-card-title")).map((el) => el.textContent);
    expect(titles).toEqual(["idiom: break the ice"]);

    searchInput.value = "engineering";
    searchInput.dispatchEvent(new window.Event("input"));
    titles = Array.from(document.querySelectorAll("#notesList .note-card-title")).map((el) => el.textContent);
    expect(titles).toEqual(["engineering term: tolerance"]);

    searchInput.value = "";
    searchInput.dispatchEvent(new window.Event("input"));
    titles = Array.from(document.querySelectorAll("#notesList .note-card-title")).map((el) => el.textContent);
    expect(titles).toHaveLength(3);
  });

  it("tag filter chips only show tags actually present, and filter the list when clicked", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    await seedThreeNotes(document, hooks);

    const chipLabels = Array.from(document.querySelectorAll("#notesTagSeg button")).map((b) => b.dataset.val);
    expect(chipLabels).toEqual(["All", "engineering", "grammar", "idioms"]);

    document.querySelector('#notesTagSeg button[data-val="idioms"]').click();
    const titles = Array.from(document.querySelectorAll("#notesList .note-card-title")).map((el) => el.textContent);
    expect(titles).toEqual(["idiom: break the ice"]);
  });
});

describe("Research Notes tab — Edit and Delete (owner-gated)", () => {
  it("Edit and Delete buttons are hidden on a locked device", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    hooks.addNoteEntry({ title: "a note", body: "some content" }, { persist: true });
    await openNotesTab(document);

    expect(document.querySelector("#notesList .note-edit-btn")).toBeNull();
    expect(document.querySelector("#notesList .note-delete-btn")).toBeNull();
    expect(document.getElementById("noteAddBox").style.display).toBe("none");
  });

  it("opens a pre-filled edit form and saves updated title/body/tags", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addNoteEntry({ title: "old title", body: "old body", tags: ["one"] }, { persist: true });
    await openNotesTab(document);

    document.querySelector("#notesList .note-edit-btn").click();
    const editCard = document.querySelector("#notesList .note-card-editing");
    expect(editCard.querySelector(".note-edit-title").value).toBe("old title");
    expect(editCard.querySelector(".note-edit-body").value).toBe("old body");
    expect(editCard.querySelector(".note-edit-tags").textContent).toContain("one");

    editCard.querySelector(".note-edit-title").value = "new title";
    editCard.querySelector(".note-edit-body").value = "new body";
    const tagsEl = editCard.querySelector(".note-edit-tags");
    tagsEl.querySelector(".chip-editor-input").value = "two";
    hooks.commitChipEditorInput(tagsEl);
    editCard.querySelector(".note-save-edit-btn").click();
    await wait();

    expect(hooks.notesData).toHaveLength(1);
    expect(hooks.notesData[0].title).toBe("new title");
    expect(hooks.notesData[0].body).toBe("new body");
    expect(hooks.notesData[0].tags).toEqual(["one", "two"]);
  });

  it("Cancel on the edit form discards changes and restores the original", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addNoteEntry({ title: "keep me", body: "keep this body" }, { persist: true });
    await openNotesTab(document);

    document.querySelector("#notesList .note-edit-btn").click();
    const editCard = document.querySelector("#notesList .note-card-editing");
    editCard.querySelector(".note-edit-title").value = "should not save";
    editCard.querySelector(".note-cancel-edit-btn").click();

    expect(hooks.notesData[0].title).toBe("keep me");
    expect(document.querySelector("#notesList .note-card-title").textContent).toBe("keep me");
  });

  it("editing a note stamps a new modifiedAt while preserving the original createdAt", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addNoteEntry({ title: "timestamps", body: "original" }, { persist: true });
    const originalCreatedAt = hooks.notesData[0].createdAt;
    await openNotesTab(document);

    await wait(5);
    document.querySelector("#notesList .note-edit-btn").click();
    const editCard = document.querySelector("#notesList .note-card-editing");
    editCard.querySelector(".note-edit-body").value = "edited";
    editCard.querySelector(".note-save-edit-btn").click();
    await wait();

    expect(hooks.notesData[0].createdAt).toBe(originalCreatedAt);
    expect(hooks.notesData[0].modifiedAt).toBeGreaterThan(originalCreatedAt);
  });

  it("Delete asks for confirmation and removes the note", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addNoteEntry({ title: "delete me", body: "content" }, { persist: true });
    await openNotesTab(document);

    window.confirm = () => false;
    document.querySelector("#notesList .note-delete-btn").click();
    await wait();
    expect(hooks.notesData).toHaveLength(1);

    window.confirm = () => true;
    document.querySelector("#notesList .note-delete-btn").click();
    await wait();
    expect(hooks.notesData).toHaveLength(0);
    expect(document.getElementById("notesList").textContent).toContain("No notes yet");
  });

  it("deleteNoteEntry() is gated behind isDeviceUnlocked() even if called directly", async () => {
    const { hooks } = await loadApp({ ownerUnlocked: false });
    hooks.addNoteEntry({ title: "protected", body: "content" }, { persist: true });
    await hooks.deleteNoteEntry(hooks.notesData[0].id);
    expect(hooks.notesData).toHaveLength(1);
  });
});

describe("Research Notes persist across sessions (real IndexedDB, not mocked)", () => {
  it("a note written in one session is still there when the app reloads", async () => {
    const indexedDBFactory = new IDBFactory();
    const first = await loadApp({ indexedDBFactory });
    first.hooks.addNoteEntry({ title: "survives reload", body: "persisted content", tags: ["x"] }, { persist: true });
    await wait(50);

    const { window, hooks } = await loadApp({ indexedDBFactory });
    const document = window.document;
    await hooks.notesCacheRestorePromise;
    await openNotesTab(document);

    expect(hooks.notesData.some((n) => n.title === "survives reload")).toBe(true);
    expect(document.getElementById("notesList").textContent).toContain("survives reload");
  });
});

describe("Research Notes cross-device sync", () => {
  const OWNER_EMAIL = "owner@example.com";
  const OWNER_PASSWORD = "correct-horse-battery-staple";

  function makeFirebase() {
    return createFakeFirebase({
      ownerEmail: OWNER_EMAIL,
      users: { [OWNER_EMAIL]: OWNER_PASSWORD }
    });
  }

  it("seeds an empty notes array alongside the other fields on first connect", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("notes-code-1");
    await wait();

    const doc = firebase._docs.get("syncedLogs/notes-code-1");
    expect(doc).toBeTruthy();
    expect(doc.notes).toEqual([]);
  });

  it("writing a note while connected as owner pushes it to the shared doc's notes field", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("notes-code-2");
    await wait();

    hooks.addNoteEntry({ title: "syncs across devices", body: "content" }, { persist: true });
    await hooks.pushToSync(hooks.loadPersonalCorrections());
    await wait();

    const doc = firebase._docs.get("syncedLogs/notes-code-2");
    expect(doc.notes.some((n) => n.title === "syncs across devices")).toBe(true);
  });

  it("a device connecting to an already-seeded code pulls in the remote note", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/notes-code-3", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [], favorites: [],
      notes: [{ id: "note_seed_1", title: "from another device", body: "written elsewhere", tags: [], createdAt: 1000, modifiedAt: 1000 }]
    });

    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    const document = window.document;
    await hooks.connectSync("notes-code-3");
    await wait();

    expect(hooks.notesData.some((n) => n.title === "from another device")).toBe(true);
    await openNotesTab(document);
    expect(document.getElementById("notesList").textContent).toContain("from another device");
  });

  it("removes a local note that's no longer in the remote list — remote is fully authoritative, like favorites", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase, ownerUnlocked: false });

    hooks.addNoteEntry({ id: "note_local_1", title: "locally written, never synced", body: "content" }, { persist: true });
    expect(hooks.notesData).toHaveLength(1);

    firebase._docs.set("syncedLogs/notes-code-4", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [], technical: [] },
      distinctions: [], vocab: [], verbs: [], favorites: [],
      // The local note is deliberately absent — the shared list says it
      // doesn't exist anywhere anymore.
      notes: [{ id: "note_remote_1", title: "from the shared list", body: "content", tags: [], createdAt: 2000, modifiedAt: 2000 }]
    });
    await hooks.connectSync("notes-code-4");
    await wait();

    expect(hooks.notesData.some((n) => n.id === "note_local_1")).toBe(false);
    expect(hooks.notesData.some((n) => n.id === "note_remote_1")).toBe(true);
  });

  it("applyRemoteNotes leaves notesData untouched when the field is missing (older shared doc)", async () => {
    const { hooks } = await loadApp();
    hooks.addNoteEntry({ title: "untouched", body: "content" }, { persist: true });
    hooks.applyRemoteNotes(undefined);
    expect(hooks.notesData).toHaveLength(1);
    expect(hooks.notesData[0].title).toBe("untouched");
  });
});

describe("Research Notes tab — layout consistency (search box and Edit form match the Add box, not a tiny default)", () => {
  it("the search input and the Edit form's title/body fields are full-width like every other input in the app, not the browser's tiny default", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addNoteEntry({ title: "t", body: "b" }, { persist: true });
    await openNotesTab(document);

    expect(window.getComputedStyle(document.getElementById("notesSearchInput")).width).toBe("100%");

    document.querySelector("#notesList .note-edit-btn").click();
    const editCard = document.querySelector("#notesList .note-card-editing");
    expect(window.getComputedStyle(editCard.querySelector(".note-edit-title")).width).toBe("100%");
    expect(window.getComputedStyle(editCard.querySelector(".note-edit-body")).width).toBe("100%");
  });
});
