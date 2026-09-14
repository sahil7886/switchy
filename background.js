import "./favicon-guard.js";

const MAX_TABS = 9;
const SESSION_KEY = "recent-tab-switcher:mru:v1";

/** @type {Map<number, number[]>} */
const mruByWindow = new Map();
/** @type {Map<number, {id: string, windowId: number, originTabId: number, items: chrome.tabs.Tab[], selectedIndex: number, capacity: number, expiresAt: number}>} */
const switchSessions = new Map();
/** @type {Map<number, Promise<unknown>>} */
const windowOperations = new Map();

let restorePromise = restoreMru();

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await injectIntoOpenTabs();
  setTimeout(() => void injectIntoOpenTabs(), 1000);
  if (reason === "install") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void injectIntoOpenTabs();
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  recordActivation(windowId, tabId);
  void ensureContentScript(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") void ensureContentScript(tabId);
});

chrome.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => {
  const current = mruByWindow.get(windowId);
  if (current) {
    mruByWindow.set(windowId, current.filter((id) => id !== tabId));
    void persistMru();
  }

  const session = switchSessions.get(windowId);
  if (!isWindowClosing && session) {
    session.items = session.items.filter((tab) => tab.id !== tabId);
    session.capacity = Math.min(session.capacity, session.items.length);
    if (!session.items.length || tabId === session.originTabId) {
      void endSession(windowId, false);
    } else {
      session.selectedIndex = clampIndex(session.selectedIndex, session.capacity);
    }
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  mruByWindow.delete(windowId);
  switchSessions.delete(windowId);
  void persistMru();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tab = sender.tab;
  if (!tab || tab.id === undefined || tab.windowId === undefined || !message?.type) return;

  if (message.type === "switcher-cycle") {
    queueWindowOperation(tab.windowId, () => cycleFromTab(tab, Number(message.direction) < 0 ? -1 : 1))
      .then((session) => sendResponse({ sessionId: session?.id ?? null }))
      .catch(() => sendResponse({ sessionId: null }));
    return true;
  }

  if (message.type === "switcher-release") {
    queueWindowOperation(tab.windowId, async () => {
      const activeSession = switchSessions.get(tab.windowId);
      if (activeSession?.originTabId === tab.id) await endSession(tab.windowId, true);
    }).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }),
    );
    return true;
  }

  const session = switchSessions.get(tab.windowId);
  if (!session || session.id !== message.sessionId || session.originTabId !== tab.id) return;

  if (message.type === "switcher-ready") {
    session.capacity = Math.min(
      session.items.length,
      Math.max(1, Number(message.capacity) || 1),
    );
    session.selectedIndex = clampIndex(session.selectedIndex, session.capacity);
    session.expiresAt = Date.now() + 7000;
    void sendOverlay(session, "update");
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "switcher-preview") {
    session.selectedIndex = clampIndex(Number(message.index) || 0, session.capacity);
    session.expiresAt = Date.now() + 7000;
    void sendOverlay(session, "update");
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "switcher-commit") {
    void endSession(tab.windowId, true);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "switcher-cancel") {
    void endSession(tab.windowId, false);
    sendResponse({ ok: true });
    return true;
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [windowId, session] of switchSessions) {
    if (session.expiresAt < now) void endSession(windowId, false);
  }
}, 1000);

async function cycleFromTab(tab, direction) {
  await restorePromise;
  const active = await chrome.tabs.get(tab.id);
  if (!active.active || active.windowId === undefined) return null;

  const windowId = active.windowId;
  recordActivation(windowId, active.id);
  let session = switchSessions.get(windowId);

  if (session && session.expiresAt < Date.now()) {
    await endSession(windowId, false);
    session = undefined;
  }

  if (!session || session.originTabId !== active.id) {
    const items = await getMruTabs(windowId, active.id);
    if (items.length < 2) return null;

    session = {
      id: crypto.randomUUID(),
      windowId,
      originTabId: active.id,
      items,
      selectedIndex: direction > 0 ? 1 : items.length - 1,
      capacity: items.length,
      expiresAt: Date.now() + 7000,
    };
    switchSessions.set(windowId, session);
    const delivered = await sendOverlay(session, "open");
    if (!delivered) {
      // Browser-internal pages cannot host the overlay. Still provide a useful,
      // deterministic one-step switch rather than leaving the shortcut inert.
      await endSession(windowId, true);
    }
    return session;
  }

  session.selectedIndex = wrapIndex(session.selectedIndex + direction, session.capacity);
  session.expiresAt = Date.now() + 7000;
  const delivered = await sendOverlay(session, "update");
  if (!delivered) await endSession(windowId, true);
  return session;
}

async function injectIntoOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => ensureContentScript(tab.id, tab.url || tab.pendingUrl)));
  } catch {
    // Protected browser pages are intentionally skipped. Manifest-declared
    // content scripts still cover ordinary pages on their next navigation.
  }
}

async function ensureContentScript(tabId, knownUrl) {
  if (tabId === undefined) return;
  try {
    const tab = knownUrl ? null : await chrome.tabs.get(tabId);
    const url = knownUrl || tab?.url || tab?.pendingUrl || "";
    if (!/^https?:/i.test(url)) return;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["shortcut.js", "favicon-guard.js", "switcher.js"],
      injectImmediately: true,
      world: "ISOLATED",
    });
  } catch {
    // The tab may have navigated or become a protected browser page before
    // injection completed. Its next activation or navigation retries safely.
  }
}

function queueWindowOperation(windowId, operation) {
  const previous = windowOperations.get(windowId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  windowOperations.set(windowId, next);
  void next.finally(() => {
    if (windowOperations.get(windowId) === next) windowOperations.delete(windowId);
  }).catch(() => undefined);
  return next;
}

async function getMruTabs(windowId, activeTabId) {
  const tabs = await chrome.tabs.query({ windowId });
  const byId = new Map(tabs.filter((tab) => tab.id !== undefined).map((tab) => [tab.id, tab]));
  const stored = mruByWindow.get(windowId) ?? [];
  const orderedIds = [
    activeTabId,
    ...stored.filter((id) => id !== activeTabId),
    ...tabs
      .filter((tab) => tab.id !== undefined && !stored.includes(tab.id) && tab.id !== activeTabId)
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
      .map((tab) => tab.id),
  ];

  return orderedIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, MAX_TABS);
}

async function sendOverlay(session, type) {
  try {
    await chrome.tabs.sendMessage(session.originTabId, {
      type,
      sessionId: session.id,
      items: session.items.map((tab) => ({
        id: tab.id,
        title: tab.title || "Untitled tab",
        favicon: SwitchyFavicon.safeUrl(tab.favIconUrl),
        active: tab.id === session.originTabId,
      })),
      selectedIndex: session.selectedIndex,
    });
    return true;
  } catch {
    return false;
  }
}

async function endSession(windowId, commit) {
  const session = switchSessions.get(windowId);
  if (!session) return;
  switchSessions.delete(windowId);

  try {
    await chrome.tabs.sendMessage(session.originTabId, {
      type: "hide",
      sessionId: session.id,
    });
  } catch {
    // The current page may be a protected browser page; the tab operation is
    // still valid and provides the fallback behavior.
  }

  if (!commit) return;
  const selected = session.items[clampIndex(session.selectedIndex, session.items.length)];
  if (selected?.id !== undefined) await chrome.tabs.update(selected.id, { active: true });
}

function recordActivation(windowId, tabId) {
  const current = mruByWindow.get(windowId) ?? [];
  mruByWindow.set(windowId, [tabId, ...current.filter((id) => id !== tabId)].slice(0, MAX_TABS));
  void persistMru();
}

function wrapIndex(value, size) {
  if (size <= 0) return 0;
  return ((value % size) + size) % size;
}

function clampIndex(value, size) {
  if (size <= 0) return 0;
  return Math.max(0, Math.min(size - 1, value));
}

async function restoreMru() {
  try {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    for (const [windowId, ids] of Object.entries(stored[SESSION_KEY] ?? {})) {
      if (Array.isArray(ids)) mruByWindow.set(Number(windowId), ids.filter(Number.isInteger));
    }
  } catch {
    // Older Chromium builds can still run correctly with the in-memory map.
  }
}

async function persistMru() {
  try {
    await chrome.storage.session.set({
      [SESSION_KEY]: Object.fromEntries(mruByWindow),
    });
  } catch {
    // The in-memory state is sufficient until the worker is suspended.
  }
}
