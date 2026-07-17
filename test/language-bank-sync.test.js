// Integration tests for Language Bank cross-device sync (phrasal verbs,
// idioms/expressions, useful sentences, sentence patterns) — the
// counterpart to test/sync-owner-auth.test.js, which covers the same
// syncedLogs/{code} Firestore doc's `entries` (correction log) field.
//
// Regression coverage for the reported bug: "My Correction Log syncs
// fine across devices, but newly-added Language Bank entries only stay
// on the device I added them from." Root cause was that
// addLanguageBankEntry() only ever wrote to local IndexedDB — there was
// no Firestore read or write path for it at all. This file proves the
// fix piggybacks on the SAME syncedLogs/{code} doc (a new `languageBank`
// field) rather than a new collection, specifically so the fix doesn't
// require the app owner to edit/redeploy firestore.rules again.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";
import { createFakeFirebase } from "./helpers/fake-firebase.js";

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const OWNER_EMAIL = "owner@example.com";
const OWNER_PASSWORD = "correct-horse-battery-staple";

function makeFirebase() {
  return createFakeFirebase({
    ownerEmail: OWNER_EMAIL,
    users: { [OWNER_EMAIL]: OWNER_PASSWORD }
  });
}

const ONLINE_IDIOM_RESULT = {
  w: "burn the midnight oil",
  senses: [{ use: "(idiom) Work late into the night.", examples: ["She burned the midnight oil to finish the report."] }],
  syn: ["work late"],
  ant: [],
  mistake: null,
  tagalog: null,
  source: "online"
};

describe("the owner's Language Bank additions reach the shared Firestore doc", () => {
  it("seeds an empty languageBank object (all 4 categories) alongside entries on first connect", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("lb-code-1");

    const doc = firebase._docs.get("syncedLogs/lb-code-1");
    expect(doc).toBeTruthy();
    expect(doc.languageBank).toEqual({ phrasal: [], idioms: [], sentences: [], patterns: [] });
  });

  it("an idiom added while connected as owner is saved to languageBank.idioms in the shared doc, not just local IndexedDB", async () => {
    const firebase = makeFirebase();
    const { window, hooks } = await loadApp({ firebase });
    window.OnlineLookup.fetchOnlineDefinition = async () => ONLINE_IDIOM_RESULT;

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("lb-code-2");

    const document = window.document;
    document.getElementById("idiomsAddInput").value = "burn the midnight oil";
    document.getElementById("idiomsAddBtn").click();
    await wait(50);

    const doc = firebase._docs.get("syncedLogs/lb-code-2");
    expect(doc.languageBank.idioms.some((e) => e.w === "burn the midnight oil")).toBe(true);
    expect(document.getElementById("idiomsAddStatus").textContent).toContain("Added");
    expect(document.getElementById("idiomsAddStatus").className).toContain("success");
  });

  it("only syncs entries actually typed in (source:'online'), never the built-in seed content", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("lb-code-builtin-check");

    const doc = firebase._docs.get("syncedLogs/lb-code-builtin-check");
    // phrasalData/idiomsData/etc. all ship dozens of built-ins — none of
    // them should have made it into the synced snapshot.
    expect(doc.languageBank.phrasal).toEqual([]);
    expect(doc.languageBank.idioms).toEqual([]);
  });

  it("a phrasal verb added locally BEFORE connecting still reaches the shared doc once connected (mirrors the corrections regression fix)", async () => {
    const firebase = makeFirebase();
    const { hooks } = await loadApp({ firebase });
    hooks.addPhrasalEntry(
      { w: "wind down", senses: [{ use: "(verb) To relax before sleep.", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" },
      { persist: true }
    );

    await hooks.signInAsOwner(OWNER_EMAIL, OWNER_PASSWORD);
    await hooks.connectSync("lb-code-3");
    await wait(50);

    const doc = firebase._docs.get("syncedLogs/lb-code-3");
    expect(doc.languageBank.phrasal.some((e) => e.w === "wind down")).toBe(true);
  });
});

describe("a non-owner's Language Bank additions are not pushed to the shared log, but stay usable locally", () => {
  it("keeps the entry in this device's own data/IndexedDB even though the shared write is rejected", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/lb-code-4", {
      entries: [],
      languageBank: { phrasal: [], idioms: [], sentences: [], patterns: [] }
    });
    const { window, hooks } = await loadApp({ firebase });
    window.OnlineLookup.fetchOnlineDefinition = async () => ONLINE_IDIOM_RESULT;

    await hooks.connectSync("lb-code-4"); // anonymous — never signed in as owner

    const document = window.document;
    document.getElementById("idiomsAddInput").value = "burn the midnight oil";
    document.getElementById("idiomsAddBtn").click();
    await wait(50);

    // Unlike a rejected correction-log write, this is NOT rolled back —
    // there's no single shared list to drift from, so the entry stays
    // usable offline on this device even though it never reached the
    // shared log.
    expect(hooks.idiomsData.some((e) => e.w === "burn the midnight oil")).toBe(true);
    expect(firebase._docs.get("syncedLogs/lb-code-4").languageBank.idioms).toEqual([]);
    expect(document.getElementById("idiomsAddStatus").textContent).toContain("Only the signed-in owner");
    expect(document.getElementById("idiomsAddStatus").className).toContain("error");
  });
});

describe("a device that connects to an already-seeded code pulls in the shared Language Bank entries", () => {
  it("adds a remotely-seeded phrasal entry locally, searchable and cached offline", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/lb-code-5", {
      entries: [],
      languageBank: {
        phrasal: [{
          w: "zonk out",
          senses: [{ use: "(verb) To fall asleep suddenly.", examples: [] }],
          syn: [], ant: [], mistake: null, tagalog: null, source: "online"
        }],
        idioms: [], sentences: [], patterns: []
      }
    });

    const { window, hooks } = await loadApp({ firebase, ownerUnlocked: false });
    await hooks.connectSync("lb-code-5");
    await wait(50);

    expect(hooks.phrasalData.some((p) => p.w === "zonk out")).toBe(true);
    expect(hooks.wordIndexMap.get("zonk out")).toBeTruthy();

    hooks.runSearchPipeline("zonk out");
    expect(window.document.getElementById("searchResults").textContent).toContain("zonk out");
  });

  it("pulls in entries across all 4 categories at once", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/lb-code-6", {
      entries: [],
      languageBank: {
        phrasal: [{ w: "zonk out", senses: [{ use: "u", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }],
        idioms: [{ w: "burn the midnight oil", senses: [{ use: "u", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }],
        sentences: [{ w: "Could you send that file when you get a chance?", senses: [], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }],
        patterns: [{ w: "Should + subject + have + past participle", senses: [], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }]
      }
    });

    const { hooks } = await loadApp({ firebase, ownerUnlocked: false });
    await hooks.connectSync("lb-code-6");
    await wait(50);

    expect(hooks.phrasalData.some((p) => p.w === "zonk out")).toBe(true);
    expect(hooks.idiomsData.some((p) => p.w === "burn the midnight oil")).toBe(true);
    expect(hooks.sentencesData.some((p) => p.w === "Could you send that file when you get a chance?")).toBe(true);
    expect(hooks.patternsData.some((p) => p.w === "Should + subject + have + past participle")).toBe(true);
  });

  it("does not duplicate an entry that already exists locally as a built-in", async () => {
    const firebase = makeFirebase();
    firebase._docs.set("syncedLogs/lb-code-7", {
      entries: [],
      languageBank: {
        // "move on" is a built-in phrasal entry — see phrasalData in index.html.
        phrasal: [{ w: "move on", senses: [{ use: "fabricated", examples: [] }], syn: [], ant: [], mistake: null, tagalog: null, source: "online" }],
        idioms: [], sentences: [], patterns: []
      }
    });

    const { hooks } = await loadApp({ firebase, ownerUnlocked: false });
    await hooks.connectSync("lb-code-7");
    await wait(50);

    expect(hooks.phrasalData.filter((p) => p.w === "move on")).toHaveLength(1);
    expect(hooks.phrasalData.find((p) => p.w === "move on").senses[0].use).not.toBe("fabricated");
  });
});
