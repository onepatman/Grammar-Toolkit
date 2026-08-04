// Integration tests for markdown-style **bold** support across every
// typing box in the app. Since these are plain <input>/<textarea>
// fields (no rich-text/contenteditable), there's no live preview —
// **word** typed by the Owner is converted to real <b>...</b> markup at
// SAVE time instead (see mdBold() in index.html), reusing every render
// function's existing support for literal <b> markup. Only genuinely
// free-text fields (definitions, examples, explanations, notes) are
// transformed — headwords/keys used for search/sync/duplicate-detection
// are deliberately left untouched, verified explicitly below.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mdBold() helper", () => {
  it("converts **word** into <b>word</b>", async () => {
    const { hooks } = await loadApp();
    expect(hooks.mdBold("This is **important**.")).toBe("This is <b>important</b>.");
  });

  it("converts multiple bold spans in the same string", async () => {
    const { hooks } = await loadApp();
    expect(hooks.mdBold("**one** and **two**")).toBe("<b>one</b> and <b>two</b>");
  });

  it("leaves plain text with no ** markers untouched", async () => {
    const { hooks } = await loadApp();
    expect(hooks.mdBold("nothing bold here")).toBe("nothing bold here");
  });

  it("leaves a lone unmatched ** untouched", async () => {
    const { hooks } = await loadApp();
    expect(hooks.mdBold("just ** one marker")).toBe("just ** one marker");
  });

  it("handles empty/undefined input safely", async () => {
    const { hooks } = await loadApp();
    expect(hooks.mdBold("")).toBe("");
    expect(hooks.mdBold(undefined)).toBe("");
    expect(hooks.mdBold(null)).toBe("");
  });
});

describe("Add to correction — Wrong/Right/Why support **bold**", () => {
  function openFixesTab(document) {
    document.querySelector('.thumb-tab[data-tab="mistakes"]').click();
    document.getElementById("mistakeSelect").value = "double negatives";
    document.getElementById("mistakeSelect").dispatchEvent(new document.defaultView.Event("change"));
  }

  it("converts **bold** in Wrong, Right, and Why when saved", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openFixesTab(document);

    document.getElementById("qaWrongInput").value = "He **go** to the site";
    document.getElementById("qaRightInput").value = "He **goes** to the site";
    document.getElementById("qaWhyInput").value = "**Subject-verb agreement** in the present tense.";
    document.getElementById("qaAddBtn").click();
    await wait();

    const saved = hooks.loadPersonalCorrections();
    expect(saved).toHaveLength(1);
    expect(saved[0].examples[0].wrong).toBe("He <b>go</b> to the site");
    expect(saved[0].examples[0].right).toBe("He <b>goes</b> to the site");
    expect(saved[0].why).toBe("<b>Subject-verb agreement</b> in the present tense.");
  });

  it("renders the converted <b> markup as real bold text in the entry", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openFixesTab(document);

    document.getElementById("qaWrongInput").value = "He **go** to the site";
    document.getElementById("qaRightInput").value = "He goes to the site";
    document.getElementById("qaAddBtn").click();
    await wait();

    expect(document.getElementById("mistakeEntry").innerHTML).toContain("<b>go</b>");
  });
});

describe("Notes — title/body support **bold**", () => {
  it("converts **bold** in both title and body when adding a note", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.getElementById("noteTitleInput").value = "**less** vs fewer";
    document.getElementById("noteBodyInput").value = "'Less' is for **uncountable** nouns.";
    document.getElementById("noteSaveBtn").click();
    await wait();

    expect(hooks.notesData[0].title).toBe("<b>less</b> vs fewer");
    expect(hooks.notesData[0].body).toBe("'Less' is for <b>uncountable</b> nouns.");
  });
});

describe("Vocabulary Bank editor — meaning/example/notes/origin support **bold**, headword does not", () => {
  it("converts **bold** in the meaning, example, usage note, and origin, but NOT the headword itself", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addVocabEntry(
      { w: "mdbold-test", senses: [{ use: "A test word.", examples: ["An example."] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: false }
    );
    const original = hooks.vocabData.find((v) => v.w === "mdbold-test");
    hooks.openVocabEditForm(original, document.getElementById("vocabEntry"));

    document.getElementById("vocabEditWord").value = "**mdbold-test**"; // should stay literal
    document.querySelector("#vocabEntry .vocab-edit-meaning-use").value = "A **formal** definition.";
    document.querySelector("#vocabEntry .lb-edit-example-input").value = "A **bold** example sentence.";
    document.querySelector("#vocabEntry .vocab-edit-meaning-notes").value = "Chiefly used in **formal** writing.";
    document.getElementById("vocabEditOrigin").value = "From **Old English**.";
    document.getElementById("vocabEditSaveBtn").click();
    await wait();

    const updated = hooks.vocabData.find((v) => v.w === "**mdbold-test**");
    expect(updated).toBeTruthy();
    expect(updated.senses[0].use).toBe("A <b>formal</b> definition.");
    expect(updated.senses[0].examples).toEqual(["A <b>bold</b> example sentence."]);
    expect(updated.senses[0].notes).toBe("Chiefly used in <b>formal</b> writing.");
    expect(updated.origin).toBe("From <b>Old English</b>.");
  });
});

describe("Language Bank manual add (shared across categories) — meaning/example support **bold**, headword does not", () => {
  it("converts **bold** in the manually-typed meaning and example, but NOT the headword", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;

    document.getElementById("idiomsAddInput").value = "a brand new **idiom**"; // headword — stays literal
    document.getElementById("idiomsAddBtn").click();
    await wait(30);

    document.getElementById("idiomsManualUse").value = "This means to do **something** cautiously.";
    document.getElementById("idiomsManualExample").value = "We **tried it out** first.";
    document.getElementById("idiomsManualSaveBtn").click();
    await wait(30);

    const added = hooks.idiomsData.find((p) => p.w === "a brand new **idiom**");
    expect(added).toBeTruthy();
    expect(added.senses[0].use).toBe("This means to do <b>something</b> cautiously.");
    expect(added.senses[0].examples).toEqual(["We <b>tried it out</b> first."]);
  });
});

describe("Language Bank edit form — meaning/example support **bold**, headword does not", () => {
  const SAMPLE_IDIOM = {
    w: "test the waters",
    senses: [{ use: "Try something cautiously.", examples: ["We tested the waters first."] }],
    syn: [], ant: [], mistake: null, tagalog: null, source: "online"
  };

  it("converts **bold** in meaning/example on save, leaves an edited headword literal", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addIdiomEntry(SAMPLE_IDIOM, { persist: false });
    hooks.renderRuleEntry(SAMPLE_IDIOM, document.getElementById("idiomsEntry"), "Idiom / Expression", "idioms");
    document.getElementById("idiomsSelect").value = SAMPLE_IDIOM.w;
    document.getElementById("idiomsSelect").dispatchEvent(new window.Event("change"));
    document.getElementById("idiomsEntry").querySelector(".lb-edit-btn").click();

    document.getElementById("lbEditWord").value = "**test the waters**";
    document.querySelector("#lbEditMeanings .lb-edit-meaning-use").value = "A **more careful** version of the meaning.";
    document.querySelector("#lbEditMeanings .lb-edit-example-input").value = "He **tested the waters** carefully.";
    document.getElementById("lbEditSaveBtn").click();
    await wait(30);

    const updated = hooks.idiomsData.find((p) => p.w === "**test the waters**");
    expect(updated).toBeTruthy();
    expect(updated.senses[0].use).toBe("A <b>more careful</b> version of the meaning.");
    expect(updated.senses[0].examples).toEqual(["He <b>tested the waters</b> carefully."]);
  });
});

describe("Distinctions Words manual add — meaning/example support **bold** for both words, headwords do not", () => {
  function openDistinctions(document) {
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    document.querySelector('#wordBankCategorySeg button[data-val="distinctions"]').click();
  }

  it("converts **bold** in both words' manually-typed meaning/example, headwords stay literal", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    openDistinctions(document);
    window.OnlineLookup.fetchOnlineDefinition = async () => null;

    document.getElementById("distinctionsAddInput1").value = "zzzoneMd";
    document.getElementById("distinctionsAddInput2").value = "zzztwoMd";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);

    document.getElementById("distinctionsManualUse1").value = "A **cautious** meaning for word one.";
    document.getElementById("distinctionsManualExample1").value = "This is a **bold** example one.";
    document.getElementById("distinctionsManualUse2").value = "A **different** meaning for word two.";
    document.getElementById("distinctionsManualExample2").value = "This is a **bold** example two.";
    document.getElementById("distinctionsManualSaveBtn").click();
    await wait(30);

    const added = hooks.distinctionsData.find((e) => e.w === "zzzoneMd vs zzztwoMd");
    expect(added).toBeTruthy();
    expect(added.word1.senses[0].use).toBe("A <b>cautious</b> meaning for word one.");
    expect(added.word1.senses[0].examples).toEqual(["This is a <b>bold</b> example one."]);
    expect(added.word2.senses[0].use).toBe("A <b>different</b> meaning for word two.");
    expect(added.word2.senses[0].examples).toEqual(["This is a <b>bold</b> example two."]);
  });
});

describe("Distinctions Words edit form — meaning/example support **bold** for both words, headwords do not", () => {
  const RESULT_ARISE = {
    w: "Arise", senses: [{ use: "To come into being.", examples: ["A problem may arise later."] }],
    syn: [], ant: [], mistake: null, tagalog: null, source: "online"
  };
  const RESULT_QUIBBLET = {
    w: "Quibblet", senses: [{ use: "To move upward.", examples: ["The level began to rise."] }],
    syn: [], ant: [], mistake: null, tagalog: null, source: "online"
  };

  it("converts **bold** in both words' use/example on save, leaves edited headwords literal", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    document.querySelector('.thumb-tab[data-tab="wordbank"]').click();
    document.querySelector('#wordBankCategorySeg button[data-val="distinctions"]').click();
    window.OnlineLookup.fetchOnlineDefinition = async (word) => {
      const key = word.trim().toLowerCase();
      if (key === "arise") return RESULT_ARISE;
      if (key === "quibblet") return RESULT_QUIBBLET;
      return null;
    };

    document.getElementById("distinctionsAddInput1").value = "Arise";
    document.getElementById("distinctionsAddInput2").value = "Quibblet";
    document.getElementById("distinctionsAddBtn").click();
    await wait(50);
    document.getElementById("lookupModalSaveBtn").click();
    await wait(50);

    document.querySelector("#distinctionsEntry .lb-edit-btn").click();
    document.getElementById("distEditWord1").value = "**Arise**";
    document.getElementById("distEditUse1").value = "A **corrected** definition.";
    document.getElementById("distEditExample1").value = "A **bold** example.";
    document.getElementById("distEditSaveBtn").click();
    await wait(50);

    const updated = hooks.distinctionsData.find((e) => e.word1.w === "**Arise**");
    expect(updated).toBeTruthy();
    expect(updated.word1.senses[0].use).toBe("A <b>corrected</b> definition.");
    expect(updated.word1.senses[0].examples).toEqual(["A <b>bold</b> example."]);
  });
});

describe("Basic → Advanced edit form — definition/examples support **bold**, headwords do not", () => {
  it("converts **bold** in def/examples for both sides, leaves edited headwords literal", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addBasicAdvancedEntry({ basic: "happy", advanced: "elated", basicDef: null, basicExamples: [], advancedDef: null, advancedExamples: [] }, { persist: false });
    hooks.renderBasicAdvancedPair(hooks.basicAdvancedData[0]);
    document.querySelector("#basicAdvancedEntry .lb-edit-btn").click();

    document.getElementById("baEditBasic").value = "**happy**";
    document.getElementById("baEditBasicDef").value = "Feeling **pleasure**.";
    document.getElementById("baEditBasicExample").value = "She is **happy**.\nHe looked happy.";
    document.getElementById("baEditAdvancedDef").value = "**Extremely** happy.";
    document.getElementById("baEditAdvancedExample").value = "She was **elated**.";
    document.getElementById("baEditSaveBtn").click();
    await wait(30);

    const saved = hooks.basicAdvancedData.find((e) => e.basic === "**happy**");
    expect(saved).toBeTruthy();
    expect(saved.basicDef).toBe("Feeling <b>pleasure</b>.");
    expect(saved.basicExamples).toEqual(["She is <b>happy</b>.", "He looked happy."]);
    expect(saved.advancedDef).toBe("<b>Extremely</b> happy.");
    expect(saved.advancedExamples).toEqual(["She was <b>elated</b>."]);
  });
});

describe("Tagalog → English edit form — definition/examples support **bold**, headwords do not", () => {
  it("converts **bold** in def/examples for both sides, leaves edited headwords literal", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    hooks.addTagalogEnglishEntry({ tagalog: "tiyaga", english: "perseverance", tagalogDef: null, tagalogExamples: [], englishDef: null, englishExamples: [] }, { persist: false });
    hooks.renderTagalogEnglishPair(hooks.tagalogEnglishData[0]);
    document.querySelector("#tagalogEnglishEntry .lb-edit-btn").click();

    document.getElementById("teEditTagalog").value = "**tiyaga**";
    document.getElementById("teEditTagalogDef").value = "**Katatagan** ng loob.";
    document.getElementById("teEditTagalogExample").value = "Kailangan ng **tiyaga**.";
    document.getElementById("teEditEnglishDef").value = "**Continued** effort.";
    document.getElementById("teEditEnglishExample").value = "**Perseverance** pays off.";
    document.getElementById("teEditSaveBtn").click();
    await wait(30);

    const saved = hooks.tagalogEnglishData.find((e) => e.tagalog === "**tiyaga**");
    expect(saved).toBeTruthy();
    expect(saved.tagalogDef).toBe("<b>Katatagan</b> ng loob.");
    expect(saved.tagalogExamples).toEqual(["Kailangan ng <b>tiyaga</b>."]);
    expect(saved.englishDef).toBe("<b>Continued</b> effort.");
    expect(saved.englishExamples).toEqual(["<b>Perseverance</b> pays off."]);
  });
});

describe("Word Family manual add — example sentences support **bold**, word forms do not", () => {
  it("converts **bold** in exNoun/exAdj, leaves verb/noun/person/adj word-forms literal", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;

    document.getElementById("familyAddInput").value = "prioritize";
    document.getElementById("familyAddBtn").click();
    await wait(30);

    document.getElementById("familyFormNoun").value = "**prioritization**";
    document.getElementById("familyFormAdj").value = "prioritized";
    document.getElementById("familyFormExNoun").value = "The **prioritization** took an hour.";
    document.getElementById("familyFormExAdj").value = "It was **prioritized** immediately.";
    document.getElementById("familyTabAddSaveBtn").click();
    await wait(30);

    const saved = hooks.wordFamilyData.find((f) => f.verb === "prioritize");
    expect(saved).toBeTruthy();
    expect(saved.noun).toBe("**prioritization**"); // word form — stays literal
    expect(saved.exNoun).toBe("The <b>prioritization</b> took an hour.");
    expect(saved.exAdj).toBe("It was <b>prioritized</b> immediately.");
  });
});

describe("Tenses manual add — formula/uses/examples support **bold**, name does not", () => {
  it("converts **bold** in formula/uses/example sentences, leaves the tense name literal", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    window.OnlineLookup.fetchOnlineDefinition = async () => null;

    document.getElementById("tenseAddInput").value = "Going to Future";
    document.getElementById("tenseAddBtn").click();
    await wait(30);

    document.getElementById("tenseFormFormula").value = "Subject + am/is/are + **going to** + base verb";
    document.getElementById("tenseFormUses").value = "A **plan** decided before speaking.\nSomething about to happen.";
    document.getElementById("tenseFormExPos").value = "We are going to **install** the new panel.";
    document.getElementById("tenseFormExNeg").value = "We are **not** going to install it.";
    document.getElementById("tenseFormExQ").value = "Are we going to **install** it?";
    document.getElementById("tenseAddSaveBtn").click();
    await wait(30);

    const saved = hooks.tenseData.find((t) => t.name === "Going to Future");
    expect(saved).toBeTruthy();
    expect(saved.formula).toBe("Subject + am/is/are + <b>going to</b> + base verb");
    expect(saved.uses).toEqual(["A <b>plan</b> decided before speaking.", "Something about to happen."]);
    expect(saved.examples.pos).toBe("We are going to <b>install</b> the new panel.");
    expect(saved.examples.neg).toBe("We are <b>not</b> going to install it.");
    expect(saved.examples.q).toBe("Are we going to <b>install</b> it?");
  });
});
