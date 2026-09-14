import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createChromeEvent, flush, source } from "./helpers.js";

async function bootSwitcher({ shortcut, width = 1280 } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><h1>Test page</h1></body></html>", {
    runScripts: "outside-only",
    url: "https://example.com/page",
  });
  const { window } = dom;
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  const runtimeMessages = [];
  const runtimeEvents = createChromeEvent();
  const storageEvents = createChromeEvent();
  window.chrome = {
    runtime: {
      onMessage: runtimeEvents,
      sendMessage: (message) => {
        runtimeMessages.push(message);
        return Promise.resolve(message.type === "switcher-cycle" ? { sessionId: "session-1" } : { ok: true });
      },
    },
    storage: {
      local: { get: async () => ({ "recent-tab-switcher:shortcut:v1": shortcut }) },
      onChanged: storageEvents,
    },
  };
  window.eval(await source("shortcut.js"));
  window.eval(await source("favicon-guard.js"));
  window.eval(await source("switcher.js"));
  await flush(window);
  return { dom, window, runtimeEvents, runtimeMessages, storageEvents };
}

function items(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Tab ${index + 1}`,
    favicon: index === 0 ? "http://192.168.1.1/favicon.ico" : `https://example.com/icon-${index + 1}.png`,
  }));
}

test("switcher renders a responsive row, safe favicons, and a maximum of nine cells", async () => {
  const { window, runtimeEvents, runtimeMessages } = await bootSwitcher();
  runtimeEvents.listeners[0]({ type: "open", sessionId: "session-1", items: items(10), selectedIndex: 1 });

  const host = window.document.querySelector("#recent-tab-switcher-root");
  const strip = host.shadowRoot.querySelector(".strip");
  assert.equal(strip.children.length, 9);
  assert.equal(strip.children[0].querySelector("img"), null, "private favicon uses fallback");
  assert.match(strip.children[1].querySelector("img").src, /https:\/\/example\.com\/icon-2\.png/);
  assert.equal(strip.children[1].classList.contains("selected"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(runtimeMessages.at(-1))), { type: "switcher-ready", sessionId: "session-1", capacity: 9 });

  window.innerWidth = 160;
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(strip.children.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(runtimeMessages.at(-1))), { type: "switcher-ready", sessionId: "session-1", capacity: 1 });
});

test("switcher cycles forward and reverse, commits on release, and cancels with Escape", async () => {
  const { window, runtimeEvents, runtimeMessages } = await bootSwitcher({
    shortcut: { ctrl: true, alt: false, code: "KeyZ" },
  });
  runtimeEvents.listeners[0]({ type: "open", sessionId: "session-1", items: items(3), selectedIndex: 1 });

  const forward = new window.KeyboardEvent("keydown", { code: "KeyZ", key: "z", ctrlKey: true, bubbles: true, cancelable: true });
  window.dispatchEvent(forward);
  const reverse = new window.KeyboardEvent("keydown", { code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
  window.dispatchEvent(reverse);
  const escape = new window.KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true, cancelable: true });
  window.dispatchEvent(escape);
  await flush(window);

  assert.equal(forward.defaultPrevented, true);
  assert.equal(reverse.defaultPrevented, true);
  assert.deepEqual(runtimeMessages.filter((message) => message.type === "switcher-cycle").map((message) => message.direction), [1, -1]);
  assert.equal(runtimeMessages.at(-1).type, "switcher-cancel");

  runtimeEvents.listeners[0]({ type: "open", sessionId: "session-2", items: items(3), selectedIndex: 1 });
  window.dispatchEvent(new window.KeyboardEvent("keyup", { code: "ControlLeft", key: "Control", ctrlKey: false, bubbles: true }));
  assert.equal(runtimeMessages.at(-1).type, "switcher-commit");
});

test("switcher ignores duplicate programmatic injection", async () => {
  const { window, runtimeEvents } = await bootSwitcher();
  window.eval(await source("switcher.js"));
  assert.equal(runtimeEvents.listeners.length, 1);
});

test("switcher previews and commits pointer selections, hides cleanly, and applies setting changes", async () => {
  const { window, runtimeEvents, runtimeMessages, storageEvents } = await bootSwitcher();
  runtimeEvents.listeners[0]({ type: "open", sessionId: "session-1", items: items(3), selectedIndex: 1 });
  const host = window.document.querySelector("#recent-tab-switcher-root");
  const cells = host.shadowRoot.querySelectorAll(".cell");

  cells[2].dispatchEvent(new window.Event("mouseenter"));
  cells[0].click();
  assert.deepEqual(JSON.parse(JSON.stringify(runtimeMessages.slice(-2))), [
    { type: "switcher-preview", sessionId: "session-1", index: 2 },
    { type: "switcher-commit", sessionId: "session-1" },
  ]);

  runtimeEvents.listeners[0]({ type: "hide", sessionId: "session-1" });
  assert.equal(host.shadowRoot.querySelector(".layer").classList.contains("visible"), false);

  storageEvents.dispatch({
    "recent-tab-switcher:shortcut:v1": { newValue: { ctrl: true, alt: false, code: "KeyZ" } },
  }, "local");
  window.dispatchEvent(new window.KeyboardEvent("keydown", { code: "KeyZ", key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
  await flush(window);
  assert.equal(runtimeMessages.at(-1).type, "switcher-cycle");
});
