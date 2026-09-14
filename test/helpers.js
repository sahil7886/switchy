import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function source(file) {
  return readFile(path.join(ROOT, file), "utf8");
}

export async function loadBrowserGlobal(file, additions = {}) {
  const context = {
    URL,
    navigator: { platform: "MacIntel" },
    ...additions,
  };
  context.globalThis = context;
  vm.runInNewContext(await source(file), context, { filename: file });
  return context;
}

export function createChromeEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
    dispatch(...args) {
      return listeners.map((listener) => listener(...args));
    },
  };
}

export async function flush(window) {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}
