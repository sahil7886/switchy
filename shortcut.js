(() => {
  const STORAGE_KEY = "recent-tab-switcher:shortcut:v1";
  const DEFAULT_SHORTCUT = Object.freeze({ ctrl: true, alt: false, code: "Backquote" });
  const MODIFIER_CODES = new Set([
    "AltLeft", "AltRight", "ControlLeft", "ControlRight", "MetaLeft", "MetaRight",
    "ShiftLeft", "ShiftRight", "Fn", "FnLock",
  ]);
  const NON_TRIGGER_CODES = new Set([
    "CapsLock", "ContextMenu", "NumLock", "Pause", "PrintScreen", "ScrollLock",
    "Power", "Sleep", "WakeUp",
  ]);
  const CTRL_BROWSER_CODES = new Set([
    "Tab", "PageUp", "PageDown", "KeyA", "KeyB", "KeyD", "KeyE", "KeyF", "KeyG",
    "KeyH", "KeyI", "KeyJ", "KeyK", "KeyL", "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR",
    "KeyS", "KeyT", "KeyU", "KeyW", "KeyY", "Digit0", "Digit1", "Digit2", "Digit3",
    "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Equal", "Minus",
  ]);
  const ALT_SYSTEM_CODES = new Set([
    "Tab", "Escape", "F4", "Space", "ArrowLeft", "ArrowRight", "Home",
  ]);
  const ALWAYS_RESERVED_CODES = new Set(["F1", "F5", "F6", "F11", "F12"]);

  function normalise(value) {
    if (!value || typeof value !== "object") return { ...DEFAULT_SHORTCUT };
    const shortcut = {
      ctrl: value.ctrl === true,
      alt: value.alt === true,
      code: typeof value.code === "string" ? value.code : "",
    };
    return validateShortcut(shortcut).valid ? shortcut : { ...DEFAULT_SHORTCUT };
  }

  function validateEvent(event) {
    return validateShortcut({
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
      code: event.code,
    });
  }

  function validateShortcut(shortcut) {
    if (shortcut.meta) {
      return invalid("Command (⌘) is not supported. macOS keeps Command shortcuts away from webpages.");
    }
    if (shortcut.shift) {
      return invalid("Shift is reserved for reverse cycling. Choose the base shortcut without Shift.");
    }
    if (!shortcut.ctrl && !shortcut.alt) {
      return invalid("Include Control or Option (Alt) so the key can be held while you cycle.");
    }
    if (!shortcut.code || MODIFIER_CODES.has(shortcut.code)) {
      return invalid("Press a non-modifier key to finish the shortcut.");
    }
    if (NON_TRIGGER_CODES.has(shortcut.code) || ALWAYS_RESERVED_CODES.has(shortcut.code)) {
      return invalid("That key is reserved by the operating system or browser.");
    }
    if (shortcut.ctrl && !shortcut.alt && CTRL_BROWSER_CODES.has(shortcut.code)) {
      return invalid("Chrome already reserves that Control shortcut. Pick a different final key.");
    }
    if (!shortcut.ctrl && shortcut.alt && ALT_SYSTEM_CODES.has(shortcut.code)) {
      return invalid("That Option (Alt) shortcut is reserved by the operating system or browser.");
    }
    if (shortcut.ctrl && shortcut.alt && ["Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(shortcut.code)) {
      return invalid("That Control + Option (Alt) shortcut is reserved by the operating system or browser.");
    }
    return { valid: true, shortcut: { ctrl: shortcut.ctrl, alt: shortcut.alt, code: shortcut.code } };
  }

  function matchesEvent(event, shortcut) {
    return event.code === shortcut.code
      && event.ctrlKey === shortcut.ctrl
      && event.altKey === shortcut.alt
      && !event.metaKey;
  }

  function isHoldingBaseModifiers(event, shortcut) {
    return event.ctrlKey === shortcut.ctrl && event.altKey === shortcut.alt && !event.metaKey;
  }

  function format(shortcut) {
    const parts = [];
    if (shortcut.ctrl) parts.push("Control");
    if (shortcut.alt) parts.push(isApplePlatform() ? "Option" : "Alt");
    parts.push(keyLabel(shortcut.code));
    return parts.join(" + ");
  }

  function keyLabel(code) {
    const labels = {
      Backquote: "`", Backslash: "\\", BracketLeft: "[", BracketRight: "]", Comma: ",",
      Period: ".", Quote: "'", Semicolon: ";", Slash: "/", Equal: "=", Minus: "-",
      Space: "Space", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑",
      Backspace: "Backspace", Delete: "Delete", End: "End", Home: "Home", Insert: "Insert",
      NumpadAdd: "Num +", NumpadDecimal: "Num .", NumpadDivide: "Num /", NumpadMultiply: "Num *",
      NumpadSubtract: "Num -",
    };
    if (labels[code]) return labels[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
    return code || "shortcut";
  }

  function invalid(reason) {
    return { valid: false, reason };
  }

  function isApplePlatform() {
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  }

  globalThis.RecentTabShortcut = {
    DEFAULT_SHORTCUT,
    STORAGE_KEY,
    format,
    isHoldingBaseModifiers,
    isModifierCode: (code) => MODIFIER_CODES.has(code),
    keyLabel,
    matchesEvent,
    normalise,
    validateEvent,
  };
})();
