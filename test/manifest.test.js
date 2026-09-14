import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./helpers.js";

test("manifest is MV3, uses the expected runtime files, and declares only required capabilities", async () => {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Switchy");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest.permissions, ["tabs", "storage", "scripting"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["shortcut.js", "favicon-guard.js", "switcher.js"]);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.equal(manifest.background.type, "module");

  const runtimeFiles = [
    manifest.background.service_worker,
    manifest.options_ui.page,
    ...manifest.content_scripts[0].js,
    ...Object.values(manifest.icons),
  ];
  for (const file of runtimeFiles) assert.equal(existsSync(path.join(ROOT, file)), true, file);
});

test("store copy describes the protected-page and local-network limitations", async () => {
  const listing = await readFile(path.join(ROOT, "STORE_LISTING.md"), "utf8");
  assert.match(listing, /`chrome:\/\/` pages/);
  assert.match(listing, /Local Network Access/);
  assert.match(listing, /scripting/);
});
