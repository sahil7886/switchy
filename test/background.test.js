import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createChromeEvent, ROOT } from "./helpers.js";

let importNumber = 0;

function makeChrome(tabs) {
  const events = {
    actionClicked: createChromeEvent(),
    installed: createChromeEvent(),
    startup: createChromeEvent(),
    runtimeMessage: createChromeEvent(),
    activated: createChromeEvent(),
    updated: createChromeEvent(),
    removed: createChromeEvent(),
    windowRemoved: createChromeEvent(),
  };
  const sentMessages = [];
  const updatedTabs = [];
  const injected = [];
  const createdTabs = [];
  const sessionData = {};

  const chrome = {
    action: { onClicked: events.actionClicked },
    runtime: {
      onInstalled: events.installed,
      onStartup: events.startup,
      onMessage: events.runtimeMessage,
      getURL: (file) => `chrome-extension://switchy-test/${file}`,
      openOptionsPage: async () => undefined,
    },
    storage: {
      session: {
        get: async (key) => ({ [key]: sessionData[key] }),
        set: async (value) => Object.assign(sessionData, value),
      },
    },
    tabs: {
      onActivated: events.activated,
      onUpdated: events.updated,
      onRemoved: events.removed,
      onCreated: createChromeEvent(),
      query: async ({ windowId } = {}) => tabs.filter((tab) => windowId === undefined || tab.windowId === windowId),
      get: async (id) => tabs.find((tab) => tab.id === id),
      sendMessage: async (tabId, message) => {
        sentMessages.push({ tabId, message });
      },
      update: async (id, changes) => {
        updatedTabs.push({ id, changes });
        if (changes.active) {
          const current = tabs.find((tab) => tab.id === id);
          for (const tab of tabs) if (tab.windowId === current.windowId) tab.active = tab.id === id;
        }
      },
      create: async (details) => createdTabs.push(details),
    },
    windows: { onRemoved: events.windowRemoved },
    scripting: {
      executeScript: async (details) => injected.push(details),
    },
  };
  return { chrome, events, sentMessages, updatedTabs, injected, createdTabs, sessionData };
}

async function bootBackground(tabs) {
  const mock = makeChrome(tabs);
  const original = { chrome: globalThis.chrome, setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout };
  const scheduled = [];
  globalThis.chrome = mock.chrome;
  globalThis.setInterval = () => 0;
  globalThis.setTimeout = (callback) => {
    scheduled.push(callback);
    return 0;
  };
  await import(`${pathToFileURL(path.join(ROOT, "background.js")).href}?test=${importNumber += 1}`);

  return {
    ...mock,
    scheduled,
    restore() {
      globalThis.chrome = original.chrome;
      globalThis.setInterval = original.setInterval;
      globalThis.setTimeout = original.setTimeout;
    },
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

test("background injects existing normal tabs and skips protected browser tabs", async () => {
  const background = await bootBackground([
    { id: 1, windowId: 1, active: true, url: "https://example.com", lastAccessed: 30 },
    { id: 2, windowId: 1, active: false, url: "http://example.org", lastAccessed: 20 },
    { id: 3, windowId: 1, active: false, url: "chrome://extensions", lastAccessed: 10 },
  ]);
  try {
    await background.events.installed.listeners[0]({ reason: "install" });
    assert.deepEqual(background.injected.map((entry) => entry.target.tabId), [1, 2]);
    assert.deepEqual(background.injected[0].files, ["shortcut.js", "favicon-guard.js", "switcher.js"]);
    assert.deepEqual(background.createdTabs, [{ url: "chrome-extension://switchy-test/onboarding.html" }]);

    await background.scheduled[0]();
    assert.equal(background.injected.length, 4, "installation retry reruns safely");

    background.events.activated.dispatch({ tabId: 1, windowId: 1 });
    background.events.updated.dispatch(2, { status: "complete" });
    await settle();
    assert.equal(background.injected.length, 6, "activation and completed navigation retry injection");
  } finally {
    background.restore();
  }
});

test("background opens a safe MRU session and commits a rapid release", async () => {
  const tabs = [
    { id: 1, windowId: 9, active: true, title: "Current", favIconUrl: "https://example.com/current.ico", lastAccessed: 300 },
    { id: 2, windowId: 9, active: false, title: "Local", favIconUrl: "http://192.168.1.1/favicon.ico", lastAccessed: 200 },
    { id: 3, windowId: 9, active: false, title: "Previous", favIconUrl: "https://example.com/previous.ico", lastAccessed: 100 },
  ];
  const background = await bootBackground(tabs);
  try {
    const handler = background.events.runtimeMessage.listeners[0];
    let cycleResponse;
    let releaseResponse;
    assert.equal(handler({ type: "switcher-cycle", direction: 1 }, { tab: tabs[0] }, (value) => { cycleResponse = value; }), true);
    assert.equal(handler({ type: "switcher-release" }, { tab: tabs[0] }, (value) => { releaseResponse = value; }), true);
    await settle();

    assert.ok(cycleResponse.sessionId);
    assert.deepEqual(releaseResponse, { ok: true });
    const open = background.sentMessages.find((entry) => entry.message.type === "open");
    assert.equal(open.tabId, 1);
    assert.equal(open.message.items[1].favicon, "", "local favicon is stripped before page delivery");
    assert.deepEqual(background.updatedTabs, [{ id: 2, changes: { active: true } }]);
  } finally {
    background.restore();
  }
});

test("background respects responsive capacity, preview, cancel, and protected tabs", async () => {
  const tabs = [
    { id: 1, windowId: 9, active: true, title: "Current", favIconUrl: "https://example.com/current.ico", lastAccessed: 300 },
    { id: 2, windowId: 9, active: false, title: "Previous", favIconUrl: "https://example.com/previous.ico", lastAccessed: 200 },
  ];
  const background = await bootBackground(tabs);
  try {
    const handler = background.events.runtimeMessage.listeners[0];
    let cycleResponse;
    handler({ type: "switcher-cycle", direction: 1 }, { tab: tabs[0] }, (value) => { cycleResponse = value; });
    await settle();
    const id = cycleResponse.sessionId;

    assert.equal(handler({ type: "switcher-ready", sessionId: id, capacity: 1 }, { tab: tabs[0] }, () => undefined), true);
    assert.equal(handler({ type: "switcher-preview", sessionId: id, index: 99 }, { tab: tabs[0] }, () => undefined), true);
    assert.equal(handler({ type: "switcher-cancel", sessionId: id }, { tab: tabs[0] }, () => undefined), true);
    await settle();

    assert.equal(background.updatedTabs.length, 0, "cancel never activates another tab");
    assert.equal(background.sentMessages.filter((entry) => entry.message.type === "hide").length, 1);
    assert.equal(background.injected.length, 0);
  } finally {
    background.restore();
  }
});
