// Integration tests for the dark mode toggle. The actual theme
// detection (localStorage preference, falling back to the OS setting)
// runs in a tiny inline <script> in <head> before the main script ever
// executes — see the early-detection comment in index.html — so these
// tests exercise the observable result of that (the data-theme
// attribute on <html>) plus the toggle button's own behavior, which
// IS owned by the main script.
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/load-app.js";

describe("initial theme detection", () => {
  it("defaults to light when there's no stored preference and the OS prefers light", async () => {
    const { window, hooks } = await loadApp();
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(hooks.getCurrentTheme()).toBe("light");
  });

  it("defaults to dark when there's no stored preference but the OS prefers dark", async () => {
    const { window, hooks } = await loadApp({ prefersDarkScheme: true });
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(hooks.getCurrentTheme()).toBe("dark");
  });

  it("a stored 'dark' preference overrides the OS preferring light", async () => {
    const { window } = await loadApp({ localStorage: { mepf_toolkit_theme: "dark" } });
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("a stored 'light' preference overrides the OS preferring dark", async () => {
    const { window } = await loadApp({ prefersDarkScheme: true, localStorage: { mepf_toolkit_theme: "light" } });
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("theme toggle button", () => {
  it("shows a moon icon in light mode, labeled to switch to dark", async () => {
    const { window } = await loadApp();
    const btn = window.document.getElementById("themeToggleBtn");
    expect(btn.textContent).toBe("🌙");
    expect(btn.getAttribute("aria-label")).toContain("dark");
  });

  it("clicking switches to dark mode and flips the icon/label", async () => {
    const { window } = await loadApp();
    const btn = window.document.getElementById("themeToggleBtn");

    btn.click();

    expect(window.document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(btn.textContent).toBe("☀️");
    expect(btn.getAttribute("aria-label")).toContain("light");
  });

  it("clicking twice returns to light mode", async () => {
    const { hooks } = await loadApp();
    hooks.toggleTheme();
    hooks.toggleTheme();
    expect(hooks.getCurrentTheme()).toBe("light");
  });

  it("persists the explicit choice to localStorage", async () => {
    const { window, hooks } = await loadApp();
    hooks.toggleTheme();
    expect(window.localStorage.getItem("mepf_toolkit_theme")).toBe("dark");
  });

  it("an explicit preference from a previous session is honored on the next load", async () => {
    const { window: firstWindow, hooks: firstHooks } = await loadApp();
    firstHooks.toggleTheme(); // -> dark, persisted
    const stored = firstWindow.localStorage.getItem("mepf_toolkit_theme");

    const { window: secondWindow } = await loadApp({ localStorage: { mepf_toolkit_theme: stored } });
    expect(secondWindow.document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("live-following the OS theme", () => {
  it("switches automatically when the OS theme changes, as long as the user never explicitly toggled", async () => {
    const { window } = await loadApp();
    expect(window.document.documentElement.getAttribute("data-theme")).toBe("light");

    window.__triggerColorSchemeChange(true);

    expect(window.document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("stops following the OS once the user has explicitly toggled", async () => {
    const { window, hooks } = await loadApp();
    hooks.toggleTheme(); // explicit choice -> dark

    window.__triggerColorSchemeChange(false); // OS says light now

    expect(window.document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("dark mode doesn't affect app data or functionality", () => {
  it("search and navigation still work normally", async () => {
    const { window, hooks } = await loadApp({ localStorage: { mepf_toolkit_theme: "dark" } });
    hooks.runSearchPipeline("abandon");
    const match = Array.from(window.document.querySelectorAll("#searchResults .search-result-item"))
      .find((el) => el.textContent.includes("abandon"));
    expect(match).toBeTruthy();
  });

  it("Language Bank quick-add still works normally under dark mode", async () => {
    const { window, hooks } = await loadApp({ localStorage: { mepf_toolkit_theme: "dark" } });
    window.OnlineLookup.fetchOnlineDefinition = async () => ({
      w: "resilient-dark-test",
      senses: [{ use: "(adjective) Able to recover quickly.", examples: [] }],
      syn: [], ant: [], mistake: null, tagalog: null, source: "online"
    });

    window.document.querySelector('.thumb-tab[data-tab="langbank"]').click();
    window.document.getElementById("phrasalAddInput").value = "resilient-dark-test";
    window.document.getElementById("phrasalAddBtn").click();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(hooks.phrasalData.some((p) => p.w === "resilient-dark-test")).toBe(true);
  });
});
