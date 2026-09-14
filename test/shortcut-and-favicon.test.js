import assert from "node:assert/strict";
import test from "node:test";
import { loadBrowserGlobal } from "./helpers.js";

test("shortcut validation accepts usable Control and Option shortcuts", async () => {
  const { RecentTabShortcut: shortcut } = await loadBrowserGlobal("shortcut.js");
  const accepted = [
    { ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, code: "Backquote" },
    { ctrlKey: false, altKey: true, shiftKey: false, metaKey: false, code: "KeyK" },
    { ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, code: "KeyK" },
    { ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, code: "KeyZ" },
    { ctrlKey: false, altKey: true, shiftKey: false, metaKey: false, code: "ArrowDown" },
  ];

  for (const event of accepted) assert.equal(shortcut.validateEvent(event).valid, true, event.code);
});

test("shortcut validation rejects unavailable and browser-reserved combinations", async () => {
  const { RecentTabShortcut: shortcut } = await loadBrowserGlobal("shortcut.js");
  const rejected = [
    { ctrlKey: false, altKey: false, shiftKey: false, metaKey: true, code: "KeyK" },
    { ctrlKey: true, altKey: false, shiftKey: true, metaKey: false, code: "KeyK" },
    { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, code: "KeyK" },
    { ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, code: "ControlLeft" },
    { ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, code: "KeyW" },
    { ctrlKey: false, altKey: true, shiftKey: false, metaKey: false, code: "Tab" },
    { ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, code: "F5" },
    { ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, code: "Delete" },
  ];

  for (const event of rejected) assert.equal(shortcut.validateEvent(event).valid, false, event.code);
});

test("shortcut matching supports reverse cycling and detects modifier release", async () => {
  const { RecentTabShortcut: shortcut } = await loadBrowserGlobal("shortcut.js");
  const configured = { ctrl: true, alt: true, code: "KeyK" };

  assert.equal(shortcut.matchesEvent({ code: "KeyK", ctrlKey: true, altKey: true, shiftKey: true, metaKey: false }, configured), true);
  assert.equal(shortcut.matchesEvent({ code: "KeyK", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }, configured), false);
  assert.equal(shortcut.isHoldingBaseModifiers({ ctrlKey: true, altKey: true, metaKey: false }, configured), true);
  assert.equal(shortcut.isHoldingBaseModifiers({ ctrlKey: false, altKey: true, metaKey: false }, configured), false);
});

test("shortcut normalization and labels are safe for corrupt stored settings", async () => {
  const { RecentTabShortcut: shortcut } = await loadBrowserGlobal("shortcut.js");

  assert.deepEqual(JSON.parse(JSON.stringify(shortcut.normalise(null))), { ctrl: true, alt: false, code: "Backquote" });
  assert.deepEqual(JSON.parse(JSON.stringify(shortcut.normalise({ ctrl: true, alt: false, code: "KeyW" }))), { ctrl: true, alt: false, code: "Backquote" });
  assert.equal(shortcut.format({ ctrl: true, alt: true, code: "KeyK" }), "Control + Option + K");
  assert.equal(shortcut.keyLabel("NumpadDivide"), "Num /");
});

test("favicon guard allows public page URLs and blocks local-network addresses", async () => {
  const { SwitchyFavicon: favicon } = await loadBrowserGlobal("favicon-guard.js");
  const safe = ["https://www.apple.com/", "http://example.com/work?view=board"];
  const blocked = [
    "file:///Users/sahil/Notes.html",
    "https://localhost/",
    "https://router.local/",
    "https://printer.lan/",
    "https://intranet/",
    "https://10.0.0.1/",
    "https://172.16.0.1/",
    "https://192.168.1.1/",
    "https://169.254.1.1/",
    "https://[::1]/",
    "not a url",
  ];

  for (const url of safe) assert.equal(favicon.safePageUrl(url), url);
  for (const url of blocked) assert.equal(favicon.safePageUrl(url), "", url);
});
