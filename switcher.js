(() => {
  if (globalThis.__switchySwitcherLoaded) return;
  globalThis.__switchySwitcherLoaded = true;

  const ROOT_ID = "recent-tab-switcher-root";
  const CELL_SIZE = 58;
  const CELL_GAP = 7;
  const OUTER_GUTTER = 38;
  const MAX_CELLS = 9;

  let currentSessionId = null;
  let currentItems = [];
  let selectedIndex = 0;
  let visibleCapacity = MAX_CELLS;
  let host;
  let strip;
  let awaitingSession = false;
  let shortcut = RecentTabShortcut.DEFAULT_SHORTCUT;

  void loadShortcut();

  async function loadShortcut() {
    try {
      const stored = await chrome.storage.local.get(RecentTabShortcut.STORAGE_KEY);
      shortcut = RecentTabShortcut.normalise(stored[RecentTabShortcut.STORAGE_KEY]);
    } catch {
      shortcut = RecentTabShortcut.DEFAULT_SHORTCUT;
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[RecentTabShortcut.STORAGE_KEY]) return;
    shortcut = RecentTabShortcut.normalise(changes[RecentTabShortcut.STORAGE_KEY].newValue);
  });

  function ensureOverlay() {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.id = ROOT_ID;
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-label", "Recent tab switcher");
    host.attachShadow({ mode: "open" });
    host.shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        .layer {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: grid;
          place-items: center;
          pointer-events: none;
          opacity: 0;
          transition: opacity 100ms ease-out;
        }
        .layer.visible { opacity: 1; }
        .switcher {
          display: flex;
          max-width: calc(100vw - 24px);
          padding: 10px;
          border: 1px solid rgba(255, 255, 255, .18);
          border-radius: 17px;
          background: rgba(25, 25, 28, .79);
          box-shadow: 0 20px 60px rgba(0, 0, 0, .29), inset 0 1px 0 rgba(255, 255, 255, .10);
          backdrop-filter: blur(25px) saturate(1.25);
          -webkit-backdrop-filter: blur(25px) saturate(1.25);
          transform: translateY(5px) scale(.985);
          transition: transform 130ms cubic-bezier(.2, .9, .2, 1);
        }
        .visible .switcher { transform: translateY(0) scale(1); }
        .strip { display: flex; gap: ${CELL_GAP}px; }
        .cell {
          width: ${CELL_SIZE}px;
          height: ${CELL_SIZE}px;
          flex: 0 0 ${CELL_SIZE}px;
          display: grid;
          place-items: center;
          margin: 0;
          padding: 0;
          border: 1px solid transparent;
          border-radius: 12px;
          outline: none;
          appearance: none;
          color: #f7f7f8;
          background: rgba(255, 255, 255, .075);
          box-shadow: inset 0 1px rgba(255, 255, 255, .08);
          cursor: pointer;
          transition: transform 110ms ease-out, background 110ms ease-out, border-color 110ms ease-out, box-shadow 110ms ease-out;
        }
        .cell:hover { background: rgba(255, 255, 255, .14); }
        .cell.selected {
          border-color: rgba(255, 255, 255, .6);
          background: #f7f7f8;
          box-shadow: 0 6px 18px rgba(0, 0, 0, .26), inset 0 1px rgba(255, 255, 255, .9);
          transform: translateY(-2px);
        }
        .favicon-frame {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border-radius: 9px;
          background: rgba(255, 255, 255, .11);
        }
        .selected .favicon-frame { background: rgba(0, 0, 0, .07); }
        img {
          display: block;
          width: 21px;
          height: 21px;
          object-fit: contain;
        }
        .fallback {
          width: 21px;
          height: 21px;
          display: grid;
          place-items: center;
          border-radius: 6px;
          color: white;
          background: #6d6a8c;
          font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .selected .fallback { background: #2c2b34; }
        @media (prefers-reduced-motion: reduce) {
          .layer, .switcher, .cell { transition: none; }
        }
      </style>
      <div class="layer" role="dialog" aria-modal="true">
        <div class="switcher"><div class="strip"></div></div>
      </div>`;
    strip = host.shadowRoot.querySelector(".strip");
    document.documentElement.append(host);
  }

  function capacityForViewport() {
    return Math.max(
      1,
      Math.min(MAX_CELLS, Math.floor((window.innerWidth - OUTER_GUTTER + CELL_GAP) / (CELL_SIZE + CELL_GAP))),
    );
  }

  function render() {
    ensureOverlay();
    visibleCapacity = Math.min(currentItems.length, capacityForViewport());
    selectedIndex = Math.max(0, Math.min(selectedIndex, visibleCapacity - 1));
    strip.replaceChildren();

    currentItems.slice(0, visibleCapacity).forEach((item, index) => {
      const cell = document.createElement("button");
      cell.className = `cell${index === selectedIndex ? " selected" : ""}`;
      cell.type = "button";
      cell.title = item.title;
      cell.setAttribute("aria-label", item.title);
      cell.setAttribute("aria-current", String(index === selectedIndex));
      const frame = document.createElement("span");
      frame.className = "favicon-frame";
      const fallback = makeFallback(item.title);
      const favicon = nativeFaviconUrl(item.pageUrl);
      if (favicon) {
        const image = document.createElement("img");
        image.src = favicon;
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.replaceWith(fallback), { once: true });
        frame.append(image);
      } else {
        frame.append(fallback);
      }
      cell.append(frame);
      cell.addEventListener("mouseenter", () => preview(index));
      cell.addEventListener("click", () => commit(index));
      strip.append(cell);
    });

    host.shadowRoot.querySelector(".layer").classList.add("visible");
  }

  function makeFallback(title) {
    const fallback = document.createElement("span");
    fallback.className = "fallback";
    fallback.textContent = (title || "?").trim().slice(0, 1).toUpperCase() || "?";
    return fallback;
  }

  function nativeFaviconUrl(pageUrl) {
    const safePageUrl = SwitchyFavicon.safePageUrl(pageUrl);
    if (!safePageUrl) return "";

    try {
      // Chrome serves this URL itself. The active webpage therefore does not
      // fetch an arbitrary remote favicon and cannot trigger its own Local
      // Network Access prompt through Switchy.
      const endpoint = new URL(chrome.runtime.getURL("_favicon/"));
      endpoint.searchParams.set("pageUrl", safePageUrl);
      endpoint.searchParams.set("size", "32");
      return endpoint.href;
    } catch {
      return "";
    }
  }

  function preview(index) {
    if (index === selectedIndex || !currentSessionId) return;
    selectedIndex = index;
    chrome.runtime.sendMessage({ type: "switcher-preview", sessionId: currentSessionId, index });
  }

  function commit(index = selectedIndex) {
    if (!currentSessionId) return;
    selectedIndex = index;
    chrome.runtime.sendMessage({ type: "switcher-commit", sessionId: currentSessionId });
  }

  function cancel() {
    if (!currentSessionId) return;
    chrome.runtime.sendMessage({ type: "switcher-cancel", sessionId: currentSessionId });
  }

  function hide() {
    currentSessionId = null;
    awaitingSession = false;
    const layer = host?.shadowRoot.querySelector(".layer");
    layer?.classList.remove("visible");
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "hide" && message.sessionId === currentSessionId) {
      hide();
      return;
    }
    if (message?.type !== "open" && message?.type !== "update") return;
    currentSessionId = message.sessionId;
    currentItems = Array.isArray(message.items) ? message.items : [];
    selectedIndex = Number(message.selectedIndex) || 0;
    render();
    if (message.type === "open") {
      chrome.runtime.sendMessage({
        type: "switcher-ready",
        sessionId: currentSessionId,
        capacity: visibleCapacity,
      });
    }
  });

  window.addEventListener("keyup", (event) => {
    if (RecentTabShortcut.isHoldingBaseModifiers(event, shortcut)) return;
    if (currentSessionId) commit();
    else if (awaitingSession) chrome.runtime.sendMessage({ type: "switcher-release" });
  }, true);

  window.addEventListener("keydown", (event) => {
    const isSwitcherChord = RecentTabShortcut.matchesEvent(event, shortcut);
    if (isSwitcherChord) {
      event.preventDefault();
      event.stopImmediatePropagation();
      awaitingSession = true;
      chrome.runtime.sendMessage({
        type: "switcher-cycle",
        direction: event.shiftKey ? -1 : 1,
      }).then(({ sessionId } = {}) => {
        awaitingSession = false;
        if (sessionId) currentSessionId = sessionId;
      });
      return;
    }

    if (currentSessionId && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    }
  }, true);

  window.addEventListener("blur", () => {
    if (currentSessionId) cancel();
  });

  window.addEventListener("resize", () => {
    if (!currentSessionId) return;
    render();
    chrome.runtime.sendMessage({
      type: "switcher-ready",
      sessionId: currentSessionId,
      capacity: visibleCapacity,
    });
  });
})();
