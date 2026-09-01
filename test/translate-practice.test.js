// Translate Practice — the Word Bank category for working Tagalog into
// English: write the Tagalog, attempt the English yourself, then log the
// corrected version once you have it. The pair (what you wrote next to
// what it should have been) is the actual lesson, so the two English
// versions are diffed word by word, and the attempt is run through the
// same free LanguageTool check the Journal already uses.
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/load-app.js";
import VocabCache from "../js/vocab-cache.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openTranslations(document) {
  document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
  document.querySelector('#wordBankCategorySeg button[data-val="translations"]').click();
}

function fillForm(document, { tagalog, myEnglish, corrected, note }) {
  document.getElementById("translationsTagalogInput").value = tagalog ?? "";
  document.getElementById("translationsMyEnglishInput").value = myEnglish ?? "";
  document.getElementById("translationsCorrectedInput").value = corrected ?? "";
  document.getElementById("translationsNoteInput").value = note ?? "";
}

describe("Translate Practice — the category itself", () => {
  it("appears as a Word Bank category and shows an empty state at first", async () => {
    const { window } = await loadApp();
    const document = window.document;
    openTranslations(document);
    expect(document.getElementById("wordbank-translations").style.display).toBe("block");
    expect(document.getElementById("translationsList").textContent).toContain("No translations yet");
  });

  it("is registered in WORD_BANK_CATEGORIES so the switcher can reach it", async () => {
    const { hooks } = await loadApp();
    expect(hooks.WORD_BANK_CATEGORIES).toContain("translations");
  });
});

describe("Translate Practice — saving", () => {
  it("requires both the Tagalog sentence and your own English attempt", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openTranslations(document);

    fillForm(document, { tagalog: "Bukas pa ako darating." });
    document.getElementById("translationsAddBtn").click();
    expect(document.getElementById("translationsAddStatus").className).toContain("error");
    expect(hooks.translationsData).toHaveLength(0);

    fillForm(document, { myEnglish: "I will arrive tomorrow." });
    document.getElementById("translationsAddBtn").click();
    expect(hooks.translationsData).toHaveLength(0);
  });

  it("saves a full entry and renders it, correction optional", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openTranslations(document);
    fillForm(document, {
      tagalog: "Bukas pa ako makakarating sa site.",
      myEnglish: "I will arrive at the site tomorrow only."
    });
    document.getElementById("translationsAddBtn").click();
    await wait();

    expect(hooks.translationsData).toHaveLength(1);
    const card = document.querySelector("#translationsList .translation-card");
    expect(card.querySelector(".translation-tagalog").textContent).toBe("Bukas pa ako makakarating sa site.");
    expect(card.querySelector(".translation-mine").textContent).toBe("I will arrive at the site tomorrow only.");
    // No correction yet — say so rather than showing an empty diff.
    expect(card.textContent).toContain("No corrected version yet");
  });

  it("is gated behind isDeviceUnlocked()", async () => {
    const { window, hooks } = await loadApp({ ownerUnlocked: false });
    const document = window.document;
    openTranslations(document);
    fillForm(document, { tagalog: "Ako ay pagod.", myEnglish: "I am tired." });
    document.getElementById("translationsAddBtn").click();
    expect(hooks.translationsData).toHaveLength(0);
    expect(document.getElementById("translationsAddStatus").className).toContain("error");
  });

  it("supports **bold** in every free-text field, like the rest of the app", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openTranslations(document);
    fillForm(document, {
      tagalog: "Ang **pump** ay sira.",
      myEnglish: "The **pump** is broke.",
      corrected: "The **pump** is broken.",
      note: "Use **broken**, not broke."
    });
    document.getElementById("translationsAddBtn").click();
    await wait();

    const entry = hooks.translationsData[0];
    expect(entry.tagalog).toBe("Ang <b>pump</b> ay sira.");
    expect(entry.corrected).toBe("The <b>pump</b> is broken.");
    expect(entry.note).toBe("Use <b>broken</b>, not broke.");
  });

  it("persists to IndexedDB and comes back on reload", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openTranslations(document);
    fillForm(document, { tagalog: "Ako ay pagod.", myEnglish: "I am tired." });
    document.getElementById("translationsAddBtn").click();
    await wait(60);

    const rows = await VocabCache.getAllTranslationEntries({ dbPromise: hooks.vocabDbPromise });
    expect(rows).toHaveLength(1);
    expect(rows[0].tagalog).toBe("Ako ay pagod.");
  });
});

describe("Translate Practice — the diff between your attempt and the correction", () => {
  it("marks words the correction kept, and flags the ones it changed", async () => {
    const { hooks } = await loadApp();
    const diff = hooks.diffTranslationWords("I will arrive tomorrow only.", "I will only arrive tomorrow.");
    const changed = diff.filter((d) => !d.matched).map((d) => d.word);
    // "only" moved, so it cannot count as kept in place.
    expect(changed).toContain("only");
    expect(diff.filter((d) => d.matched).map((d) => d.word)).toEqual(
      expect.arrayContaining(["I", "will", "arrive"])
    );
  });

  it("flags a genuinely corrected word", async () => {
    const { hooks } = await loadApp();
    const diff = hooks.diffTranslationWords("The pump is broke.", "The pump is broken.");
    expect(diff.filter((d) => !d.matched).map((d) => d.word)).toEqual(["broken."]);
  });

  it("treats an identical correction as all-kept", async () => {
    const { hooks } = await loadApp();
    const diff = hooks.diffTranslationWords("I am tired.", "I am tired.");
    expect(diff.every((d) => d.matched)).toBe(true);
  });

  it("renders changed words with the highlight class and kept words without it", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openTranslations(document);
    fillForm(document, {
      tagalog: "Sira ang pump.",
      myEnglish: "The pump is broke.",
      corrected: "The pump is broken."
    });
    document.getElementById("translationsAddBtn").click();
    await wait();

    const changed = Array.from(document.querySelectorAll("#translationsList .translation-diff-word.changed"))
      .map((el) => el.textContent);
    expect(changed).toEqual(["broken."]);
    expect(document.querySelectorAll("#translationsList .translation-diff-word.kept").length).toBeGreaterThan(0);
  });

  it("is safe with empty or missing text", async () => {
    const { hooks } = await loadApp();
    expect(hooks.diffTranslationWords("", "")).toEqual([]);
    expect(hooks.diffTranslationWords(undefined, undefined)).toEqual([]);
    expect(hooks.renderTranslationDiffHtml("", "")).toBe("");
  });
});

describe("Translate Practice — the free auto-check on your attempt", () => {
  it("scores the attempt through GrammarCheck and shows the badge", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.GrammarCheck.checkText = async () => ({
      ok: true, score: 8.5, grade: { label: "Good", tier: "good" }, wordCount: 5, corrections: []
    });
    openTranslations(document);
    fillForm(document, { tagalog: "Ako ay pagod.", myEnglish: "I am very tired today." });
    document.getElementById("translationsAddBtn").click();
    await wait(60);

    expect(hooks.translationsData[0].grading.status).toBe("graded");
    expect(hooks.translationsData[0].grading.score).toBe(8.5);
    expect(document.querySelector("#translationsList .translation-badge").textContent).toContain("8.5/10");
  });

  it("keeps the entry when the check fails (offline / rate-limited), marked unavailable", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.GrammarCheck.checkText = async () => ({ ok: false, reason: "offline" });
    openTranslations(document);
    fillForm(document, { tagalog: "Ako ay pagod.", myEnglish: "I am tired." });
    document.getElementById("translationsAddBtn").click();
    await wait(60);

    expect(hooks.translationsData).toHaveLength(1);
    expect(hooks.translationsData[0].grading.status).toBe("unavailable");
    expect(document.querySelector("#translationsList .translation-badge").textContent).toContain("unavailable");
  });

  it("does not re-check when an edit only pastes in the correction", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const checkText = vi.fn(async () => ({
      ok: true, score: 9, grade: { label: "Excellent", tier: "excellent" }, wordCount: 3, corrections: []
    }));
    window.GrammarCheck.checkText = checkText;
    openTranslations(document);
    fillForm(document, { tagalog: "Ako ay pagod.", myEnglish: "I am tired." });
    document.getElementById("translationsAddBtn").click();
    await wait(60);
    expect(checkText).toHaveBeenCalledTimes(1);

    hooks.loadTranslationForEdit(hooks.translationsData[0].id);
    document.getElementById("translationsCorrectedInput").value = "I am exhausted.";
    document.getElementById("translationsAddBtn").click();
    await wait(60);

    // The attempt is unchanged, so the score it already earned stands.
    expect(checkText).toHaveBeenCalledTimes(1);
    expect(hooks.translationsData[0].grading.score).toBe(9);
    expect(hooks.translationsData[0].corrected).toBe("I am exhausted.");
  });
});

describe("Translate Practice — edit and delete (owner-gated)", () => {
  it("Edit loads the entry back into the form with ** markers, not raw <b>", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openTranslations(document);
    fillForm(document, { tagalog: "Sira ang **pump**.", myEnglish: "The pump is broke." });
    document.getElementById("translationsAddBtn").click();
    await wait();

    document.querySelector("#translationsList .translation-edit-btn").click();
    expect(document.getElementById("translationsTagalogInput").value).toBe("Sira ang **pump**.");
    expect(document.getElementById("translationsAddBtn").textContent).toContain("Update");
  });

  it("editing updates in place rather than creating a second entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openTranslations(document);
    fillForm(document, { tagalog: "Ako ay pagod.", myEnglish: "I am tired." });
    document.getElementById("translationsAddBtn").click();
    await wait();

    hooks.loadTranslationForEdit(hooks.translationsData[0].id);
    document.getElementById("translationsNoteInput").value = "remember this";
    document.getElementById("translationsAddBtn").click();
    await wait();

    expect(hooks.translationsData).toHaveLength(1);
    expect(hooks.translationsData[0].note).toBe("remember this");
  });

  it("Delete removes it after confirmation, and is gated on a locked device", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openTranslations(document);
    fillForm(document, { tagalog: "Ako ay pagod.", myEnglish: "I am tired." });
    document.getElementById("translationsAddBtn").click();
    await wait();
    const id = hooks.translationsData[0].id;

    window.confirm = () => false;
    document.querySelector("#translationsList .translation-delete-btn").click();
    await wait();
    expect(hooks.translationsData).toHaveLength(1);

    window.confirm = () => true;
    document.querySelector("#translationsList .translation-delete-btn").click();
    await wait(40);
    expect(hooks.translationsData).toHaveLength(0);
    expect(await VocabCache.getAllTranslationEntries({ dbPromise: hooks.vocabDbPromise })).toHaveLength(0);
  });

  it("hides Edit/Delete on a locked device", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openTranslations(document);
    fillForm(document, { tagalog: "Ako ay pagod.", myEnglish: "I am tired." });
    document.getElementById("translationsAddBtn").click();
    await wait();
    expect(document.querySelector("#translationsList .translation-edit-btn")).not.toBeNull();

    window.localStorage.removeItem("mepf_toolkit_owner_unlocked");
    hooks.renderTranslationsTab();
    expect(document.querySelector("#translationsList .translation-edit-btn")).toBeNull();
  });
});
