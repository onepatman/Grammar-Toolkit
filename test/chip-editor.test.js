// Tests for the shared chip-based Synonym/Antonym editor
// (createChipEditorChip/renderChipEditor/wireChipEditorEvents/
// collectChipEditorValues/commitChipEditorInput in index.html) —
// replaces the old plain comma-separated text input used by the
// Vocabulary, Language Bank, and Distinctions Words editors. Exercised
// here as a standalone component; its wiring into each of those three
// editors is covered by vocab-management.test.js,
// language-bank-manage.test.js, and distinctions-words.test.js.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

describe("chip-based Synonym/Antonym editor", () => {
  it("renderChipEditor renders one chip per existing value plus a trailing text input", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);

    hooks.renderChipEditor(container, ["quick", "fast"], "syn");

    const chips = container.querySelectorAll(".chip-editor-chip");
    expect(chips).toHaveLength(2);
    expect(Array.from(chips).map((c) => c.querySelector(".chip-editor-chip-text").textContent)).toEqual(["quick", "fast"]);
    expect(container.querySelector(".chip-editor-input")).not.toBeNull();
    chips.forEach((c) => expect(c.classList.contains("syn")).toBe(true));
  });

  it("renders no chips (just the input) for an empty or missing values array", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);

    hooks.renderChipEditor(container, [], "ant");
    expect(container.querySelectorAll(".chip-editor-chip")).toHaveLength(0);
    expect(container.querySelector(".chip-editor-input")).not.toBeNull();
  });

  it("pressing Enter in the input commits it as a new chip and clears the input", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    hooks.renderChipEditor(container, [], "syn");
    hooks.wireChipEditorEvents(container);

    const input = container.querySelector(".chip-editor-input");
    input.value = "swift";
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(hooks.collectChipEditorValues(container)).toEqual(["swift"]);
    expect(input.value).toBe("");
  });

  it("typing a comma also commits the typed word as a chip", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    hooks.renderChipEditor(container, [], "syn");
    hooks.wireChipEditorEvents(container);

    const input = container.querySelector(".chip-editor-input");
    input.value = "rapid";
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: ",", bubbles: true }));

    expect(hooks.collectChipEditorValues(container)).toEqual(["rapid"]);
  });

  it("losing focus on the input also commits whatever was typed, so nothing is silently lost", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    hooks.renderChipEditor(container, [], "syn");
    hooks.wireChipEditorEvents(container);

    const input = container.querySelector(".chip-editor-input");
    input.value = "hasty";
    input.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));

    expect(hooks.collectChipEditorValues(container)).toEqual(["hasty"]);
  });

  it("clicking a chip's × removes just that chip", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    hooks.renderChipEditor(container, ["quick", "fast", "speedy"], "syn");
    hooks.wireChipEditorEvents(container);

    const middleChip = container.querySelectorAll(".chip-editor-chip")[1];
    middleChip.querySelector(".chip-editor-remove").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(hooks.collectChipEditorValues(container)).toEqual(["quick", "speedy"]);
  });

  it("adding a word that already exists (case-insensitive) does not create a duplicate chip", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    hooks.renderChipEditor(container, ["Quick"], "syn");
    hooks.wireChipEditorEvents(container);

    const input = container.querySelector(".chip-editor-input");
    input.value = "quick";
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(hooks.collectChipEditorValues(container)).toEqual(["Quick"]);
  });

  it("committing an empty/whitespace-only input adds nothing", async () => {
    const { window, hooks } = await loadApp();
    const document = window.document;
    const container = document.createElement("div");
    document.body.appendChild(container);
    hooks.renderChipEditor(container, [], "syn");

    const input = container.querySelector(".chip-editor-input");
    input.value = "   ";
    hooks.commitChipEditorInput(container);

    expect(hooks.collectChipEditorValues(container)).toEqual([]);
  });
});
