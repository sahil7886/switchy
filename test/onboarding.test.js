import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createChromeEvent, flush, source } from "./helpers.js";

async function bootOnboarding({ stored = {}, failSave = false } = {}) {
  const dom = new JSDOM(await source("onboarding.html"), {
    runScripts: "outside-only",
    url: "chrome-extension://switchy-test/onboarding.html",
  });
  const { window } = dom;
  const setCalls = [];
  window.chrome = {
    storage: {
      local: {
        get: async () => stored,
        set: async (value) => {
          if (failSave) throw new Error("storage unavailable");
          setCalls.push(value);
        },
      },
      onChanged: createChromeEvent(),
    },
  };
  window.eval(await source("shortcut.js"));
  window.eval(await source("onboarding.js"));
  await flush(window);
  return { dom, window, setCalls };
}

function keydown(window, options) {
  const event = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...options });
  window.dispatchEvent(event);
  return event;
}

test("onboarding click starts shortcut capture and remains active after blur", async () => {
  const { window } = await bootOnboarding();
  const capture = window.document.querySelector("#shortcut-capture");

  capture.dispatchEvent(new window.Event("pointerdown", { bubbles: true, cancelable: true }));
  capture.dispatchEvent(new window.Event("blur"));

  assert.equal(capture.classList.contains("listening"), true);
  assert.equal(window.document.querySelector("#shortcut-hint").textContent, "Press a shortcut…");
  assert.match(window.document.querySelector("#shortcut-status").textContent, /Press Control/);
});

test("onboarding starts capture from mouse, touch, and keyboard activation", async () => {
  for (const activation of ["mousedown", "touchstart"]) {
    const { window } = await bootOnboarding();
    const capture = window.document.querySelector("#shortcut-capture");
    capture.dispatchEvent(new window.Event(activation, { bubbles: true, cancelable: true }));
    assert.equal(capture.classList.contains("listening"), true, `${activation} starts capture`);
  }

  const { window } = await bootOnboarding();
  const capture = window.document.querySelector("#shortcut-capture");
  capture.dispatchEvent(new window.KeyboardEvent("keydown", {
    key: "Enter", bubbles: true, cancelable: true,
  }));
  assert.equal(capture.classList.contains("listening"), true, "Enter starts capture");
});

test("onboarding marks the welcome screen seen once it has rendered", async () => {
  const { setCalls } = await bootOnboarding();
  assert.deepEqual(JSON.parse(JSON.stringify(setCalls)), [
    { "recent-tab-switcher:onboarding-seen:v1": true },
  ]);
});

test("onboarding captures and persists a valid shortcut", async () => {
  const { window, setCalls } = await bootOnboarding();
  const capture = window.document.querySelector("#shortcut-capture");
  capture.click();

  const event = keydown(window, { key: "z", code: "KeyZ", ctrlKey: true });
  await flush(window);

  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(JSON.parse(JSON.stringify(setCalls)).slice(-1), [{ "recent-tab-switcher:shortcut:v1": { ctrl: true, alt: false, code: "KeyZ" } }]);
  assert.equal(window.document.querySelector("#shortcut-value").textContent, "Control + Z");
  assert.equal(capture.classList.contains("listening"), false);
  assert.match(window.document.querySelector("#shortcut-status").textContent, /Saved: Control \+ Z/);
});

test("an invalid shortcut explains the problem and lets the user correct it without another click", async () => {
  const { window, setCalls } = await bootOnboarding();
  const capture = window.document.querySelector("#shortcut-capture");
  capture.click();

  keydown(window, { key: "k", code: "KeyK", metaKey: true });
  assert.equal(capture.classList.contains("listening"), true);
  assert.equal(window.document.querySelector("#shortcut-status").classList.contains("error"), true);
  assert.match(window.document.querySelector("#shortcut-status").textContent, /Command/);

  keydown(window, { key: "z", code: "KeyZ", ctrlKey: true });
  await flush(window);
  assert.equal(setCalls.length, 2);
  assert.equal(window.document.querySelector("#shortcut-value").textContent, "Control + Z");
});

test("Escape cancels capture without changing the saved shortcut", async () => {
  const { window, setCalls } = await bootOnboarding();
  const capture = window.document.querySelector("#shortcut-capture");
  capture.click();

  keydown(window, { key: "Escape", code: "Escape" });

  assert.equal(setCalls.length, 1);
  assert.equal(capture.classList.contains("listening"), false);
  assert.equal(window.document.querySelector("#shortcut-value").textContent, "Control + `");
  assert.match(window.document.querySelector("#shortcut-status").textContent, /Kept Control \+ `/);
});

test("a failed save preserves the previously active shortcut", async () => {
  const { window, setCalls } = await bootOnboarding({ failSave: true });
  const capture = window.document.querySelector("#shortcut-capture");
  capture.click();
  keydown(window, { key: "z", code: "KeyZ", ctrlKey: true });
  await flush(window);

  assert.equal(setCalls.length, 0);
  assert.equal(window.document.querySelector("#shortcut-value").textContent, "Control + `");
  assert.match(window.document.querySelector("#shortcut-status").textContent, /could not be saved/);
});

test("reset restores the default shortcut", async () => {
  const { window, setCalls } = await bootOnboarding({
    stored: { "recent-tab-switcher:shortcut:v1": { ctrl: true, alt: false, code: "KeyZ" } },
  });
  await flush(window);
  window.document.querySelector("#reset-shortcut").click();
  await flush(window);

  assert.deepEqual(JSON.parse(JSON.stringify(setCalls)).slice(-1), [{ "recent-tab-switcher:shortcut:v1": { ctrl: true, alt: false, code: "Backquote" } }]);
  assert.equal(window.document.querySelector("#shortcut-value").textContent, "Control + `");
});
