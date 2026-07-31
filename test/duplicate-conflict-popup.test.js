// Tests for the shared duplicate-conflict popup (formatDuplicateDate/
// renderDuplicateConflictPopup/hideDuplicateConflictPopup in index.html)
// — replaces the old silent auto-navigate whenever a Look Up & Add flow
// finds the typed word/phrase already exists. Exercised here as a
// standalone component (rendering/View/Edit/Cancel/date formatting);
// its wiring into each of the seven add flows (Language Bank x2, the
// 6 standalone rule tabs share the same function, Distinctions, Vocab,
// Verbs, Family, Tenses) is covered by each of those tabs' own test
// files via the "does not create a duplicate" tests.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("shared duplicate-conflict popup component", () => {
  it("formatDuplicateDate formats a timestamp as a short human-readable date, and returns null for a falsy value", async () => {
    const { hooks } = await loadApp();
    expect(hooks.formatDuplicateDate(new Date("2026-07-15T12:00:00Z").getTime())).toBe("Jul 15, 2026");
    expect(hooks.formatDuplicateDate(null)).toBeNull();
    expect(hooks.formatDuplicateDate(undefined)).toBeNull();
    expect(hooks.formatDuplicateDate(0)).toBeNull();
  });

  it("renders the word, category, and both dates when addedAt and a later modifiedAt are both provided", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);

    hooks.renderDuplicateConflictPopup(container, {
      word: "conundrum",
      category: "Vocabulary Bank",
      addedAt: new Date("2026-01-01T00:00:00Z").getTime(),
      modifiedAt: new Date("2026-02-01T00:00:00Z").getTime(),
      onView: () => {}
    });

    expect(container.textContent).toContain("conundrum");
    expect(container.textContent).toContain("Vocabulary Bank");
    expect(container.textContent).toContain("Date added: Jan 1, 2026");
    expect(container.textContent).toContain("Last updated: Feb 1, 2026");
  });

  it("omits the Last Updated line when addedAt and modifiedAt are the same date", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ts = new Date("2026-03-05T00:00:00Z").getTime();

    hooks.renderDuplicateConflictPopup(container, {
      word: "test", category: "Test", addedAt: ts, modifiedAt: ts, onView: () => {}
    });

    expect(container.textContent).toContain("Date added:");
    expect(container.textContent).not.toContain("Last updated:");
  });

  it("shows a plain 'not tracked' note instead of fabricating a date when addedAt is missing", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);

    hooks.renderDuplicateConflictPopup(container, { word: "work", category: "Verb (regular)", onView: () => {} });

    expect(container.textContent).toContain("not tracked for this entry");
  });

  it("only renders View Existing and Cancel when onEdit is not provided", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);

    hooks.renderDuplicateConflictPopup(container, { word: "work", category: "Verb (regular)", onView: () => {} });

    expect(container.querySelector("#dupConflictViewBtn")).not.toBeNull();
    expect(container.querySelector("#dupConflictEditBtn")).toBeNull();
    expect(container.querySelector("#dupConflictCancelBtn")).not.toBeNull();
  });

  it("renders Edit Existing too when onEdit is provided", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);

    hooks.renderDuplicateConflictPopup(container, {
      word: "conundrum", category: "Vocabulary Bank", onView: () => {}, onEdit: () => {}
    });

    expect(container.querySelector("#dupConflictEditBtn")).not.toBeNull();
  });

  it("clicking View Existing calls onView and hides the popup", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    let viewed = false;

    hooks.renderDuplicateConflictPopup(container, { word: "work", category: "Verb", onView: () => { viewed = true; } });
    container.querySelector("#dupConflictViewBtn").click();

    expect(viewed).toBe(true);
    expect(container.innerHTML).toBe("");
    expect(container.style.display).toBe("none");
  });

  it("clicking Edit Existing calls onEdit and hides the popup", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    let edited = false;

    hooks.renderDuplicateConflictPopup(container, {
      word: "conundrum", category: "Vocabulary Bank", onView: () => {}, onEdit: () => { edited = true; }
    });
    container.querySelector("#dupConflictEditBtn").click();

    expect(edited).toBe(true);
    expect(container.innerHTML).toBe("");
  });

  it("clicking Cancel calls onCancel (if provided) and hides the popup without calling onView", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    let viewed = false;
    let cancelled = false;

    hooks.renderDuplicateConflictPopup(container, {
      word: "work", category: "Verb", onView: () => { viewed = true; }, onCancel: () => { cancelled = true; }
    });
    container.querySelector("#dupConflictCancelBtn").click();

    expect(cancelled).toBe(true);
    expect(viewed).toBe(false);
    expect(container.innerHTML).toBe("");
  });

  it("hideDuplicateConflictPopup clears content, hides the element, and resets its class", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);

    hooks.renderDuplicateConflictPopup(container, { word: "work", category: "Verb", onView: () => {} });
    hooks.hideDuplicateConflictPopup(container);

    expect(container.innerHTML).toBe("");
    expect(container.style.display).toBe("none");
    expect(container.className).toBe("add-status");
  });
});

describe("duplicate-conflict popup — Edit Existing wiring end to end", () => {
  it("Vocabulary tab: clicking Edit Existing opens the Vocab edit form for the existing entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("vocabAddInput").value = "abandon"; // a built-in Vocabulary Bank word
    document.getElementById("vocabAddBtn").click();
    await wait(30);

    const statusEl = document.getElementById("vocabAddStatus");
    // "abandon" is built-in (no source:"online"), so it has no addedAt
    // and Edit Existing isn't offered — confirms the popup gracefully
    // omits Edit for entries with no edit-eligible record, rather than
    // showing a button that would silently do nothing.
    expect(statusEl.querySelector("#dupConflictEditBtn")).toBeNull();
  });

  it("Vocabulary tab: an owner-added (source:'online') duplicate DOES offer Edit Existing, and clicking it opens the edit form", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "verify dup vocab", senses: [{ use: "(noun) A test word.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, addedAt: Date.now(), modifiedAt: Date.now(), source: "online" },
      { persist: false }
    );

    document.getElementById("vocabAddInput").value = "verify dup vocab";
    document.getElementById("vocabAddBtn").click();
    await wait(30);

    const statusEl = document.getElementById("vocabAddStatus");
    expect(statusEl.textContent).toContain("Date added:");
    const editBtn = statusEl.querySelector("#dupConflictEditBtn");
    expect(editBtn).not.toBeNull();
    editBtn.click();

    expect(document.getElementById("vocabEditWord")).not.toBeNull();
    expect(document.getElementById("vocabEditWord").value).toBe("verify dup vocab");
  });

  it("Language Bank (Idioms): an owner-added duplicate offers Edit Existing, and clicking it opens the Language Bank edit form", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(
      { w: "verify dup idiom", senses: [{ use: "(idiom) A test idiom.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, addedAt: Date.now(), modifiedAt: Date.now(), source: "online" },
      { persist: false }
    );

    document.getElementById("idiomsAddInput").value = "verify dup idiom";
    document.getElementById("idiomsAddBtn").click();
    await wait(30);

    const statusEl = document.getElementById("idiomsAddStatus");
    const editBtn = statusEl.querySelector("#dupConflictEditBtn");
    expect(editBtn).not.toBeNull();
    editBtn.click();

    expect(document.getElementById("lbEditWord")).not.toBeNull();
    expect(document.getElementById("lbEditWord").value).toBe("verify dup idiom");
  });

  it("Distinctions Words: an owner-added duplicate pair offers Edit Existing, and clicking it opens the Distinctions edit form", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addDistinctionEntry(
      {
        w: "Verify vs Dupcheck",
        word1: { w: "Verify", senses: [{ use: "(verb) To confirm.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, phonetic: null, source: "online" },
        word2: { w: "Dupcheck", senses: [{ use: "(verb) To check for duplicates.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, phonetic: null, source: "online" },
        source: "online", addedAt: Date.now(), modifiedAt: Date.now()
      },
      { persist: false }
    );

    document.getElementById("distinctionsAddInput1").value = "Verify";
    document.getElementById("distinctionsAddInput2").value = "Dupcheck";
    document.getElementById("distinctionsAddBtn").click();
    await wait(30);

    const statusEl = document.getElementById("distinctionsAddStatus");
    const editBtn = statusEl.querySelector("#dupConflictEditBtn");
    expect(editBtn).not.toBeNull();
    editBtn.click();

    expect(document.getElementById("distEditWord1")).not.toBeNull();
    expect(document.getElementById("distEditWord1").value).toBe("Verify");
  });

  it("Verbs tab: a duplicate never offers Edit Existing (no edit form for Verbs yet)", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("verbAddInput").value = "work"; // a built-in verb
    document.getElementById("verbAddBtn").click();
    await wait(30);

    const statusEl = document.getElementById("verbAddStatus");
    expect(statusEl.querySelector("#dupConflictEditBtn")).toBeNull();
    expect(statusEl.querySelector("#dupConflictViewBtn")).not.toBeNull();
  });

  it("a cross-category duplicate (word known elsewhere, not yet in THIS category) reports the category it actually lives in, and offers no Edit", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    // "abandon" is a built-in Vocabulary Bank word but not a phrasal verb.
    document.getElementById("phrasalAddInput").value = "abandon";
    document.getElementById("phrasalAddBtn").click();
    await wait(30);

    const statusEl = document.getElementById("phrasalAddStatus");
    expect(statusEl.textContent).toContain("Vocabulary Bank");
    expect(statusEl.querySelector("#dupConflictEditBtn")).toBeNull();
  });
});
