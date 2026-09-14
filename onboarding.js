(() => {
  const shortcutApi = globalThis.RecentTabShortcut;
  const captureButton = document.querySelector("#shortcut-capture");
  const value = document.querySelector("#shortcut-value");
  const hint = document.querySelector("#shortcut-hint");
  const status = document.querySelector("#shortcut-status");
  const reset = document.querySelector("#reset-shortcut");
  let shortcut = shortcutApi.DEFAULT_SHORTCUT;
  let listening = false;

  void initialise();

  async function initialise() {
    try {
      const stored = await chrome.storage.local.get(shortcutApi.STORAGE_KEY);
      shortcut = shortcutApi.normalise(stored[shortcutApi.STORAGE_KEY]);
    } catch {
      shortcut = shortcutApi.DEFAULT_SHORTCUT;
    }
    render("Ready to use on a regular website.");
  }

  function render(message, isError = false) {
    value.textContent = shortcutApi.format(shortcut);
    hint.textContent = listening ? "Press a shortcut…" : "Click to choose";
    captureButton.classList.toggle("listening", listening);
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function startListening() {
    if (listening) return;
    listening = true;
    render("Press Control or Option (Alt), then a regular key. Press Esc to stop.");
    captureButton.focus({ preventScroll: true });
  }

  function stopListening(message, isError = false) {
    listening = false;
    render(message, isError);
  }

  async function save(nextShortcut) {
    try {
      await chrome.storage.local.set({ [shortcutApi.STORAGE_KEY]: nextShortcut });
      shortcut = nextShortcut;
      stopListening(`Saved: ${shortcutApi.format(shortcut)}. Add Shift to cycle backward.`);
    } catch {
      stopListening("The shortcut could not be saved. Please try again.", true);
    }
  }

  captureButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    startListening();
  });
  captureButton.addEventListener("click", startListening);

  reset.addEventListener("click", () => {
    listening = false;
    void save({ ...shortcutApi.DEFAULT_SHORTCUT });
  });

  window.addEventListener("keydown", (event) => {
    if (!listening) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.key === "Escape") {
      stopListening(`Kept ${shortcutApi.format(shortcut)}.`);
      return;
    }
    if (event.repeat || shortcutApi.isModifierCode(event.code)) {
      render("Keep holding the modifier, then press a regular key.");
      return;
    }

    const result = shortcutApi.validateEvent(event);
    if (!result.valid) {
      // Keep capture active so a mistyped or unsupported shortcut can be
      // corrected immediately without requiring another click.
      render(result.reason, true);
      return;
    }
    void save(result.shortcut);
  }, true);
})();
