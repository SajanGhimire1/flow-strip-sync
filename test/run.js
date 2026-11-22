"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");

execFileSync(process.execPath, [
  path.join(root, "index.js"),
  "--src",
  "test/fixtures",
  "--out",
  "dist",
  "--clean", "--all",
]);

const strippedJs = fs.readFileSync(path.join(outDir, "sample.js"), "utf8");
assert.ok(!strippedJs.includes(": string"), "Flow type annotations should be stripped");
assert.ok(fs.existsSync(path.join(outDir, "styles.css")), "Non-JS asset should be copied");

const noPragmaJs = fs.readFileSync(path.join(outDir, "no-pragma.js"), "utf8");
assert.ok(!noPragmaJs.includes(": number"), "Flow types should be stripped without @flow when --all is passed");
fs.rmSync(outDir, { recursive: true, force: true });
const jsonOut = execFileSync(process.execPath, [
  path.join(root, "index.js"),
  "--src",
  "test/fixtures",
  "--out",
  "dist",
  "--dry-run",
  "--json",
], { encoding: "utf8" });
const parsed = JSON.parse(jsonOut.trim());
assert.strictEqual(parsed.strippedJs, 2, "JSON output should report 2 JS files");
assert.strictEqual(parsed.copiedAssets, 1, "JSON output should report 1 asset file");
assert.strictEqual(parsed.dryRun, true, "JSON output should report dryRun: true");

const quietOut = execFileSync(process.execPath, [
  path.join(root, "index.js"),
  "--src",
  "test/fixtures",
  "--out",
  "dist",
  "--dry-run",
  "--quiet",
], { encoding: "utf8" });
assert.strictEqual(quietOut.trim(), "", "Quiet mode should suppress standard output");

assert.throws(() => {
  execFileSync(process.execPath, [path.join(root, "index.js"), "--bogus-flag"], { stdio: "pipe" });
}, (err) => err.status === 1, "Unknown flag should exit with code 1");

const verOut = execFileSync(process.execPath, [path.join(root, "index.js"), "--version"], { encoding: "utf8" });
assert.strictEqual(verOut.trim(), "0.1.0", "Version flag should print package.json version");

console.log("All tests passed!");
