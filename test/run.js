"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const cliPath = path.join(root, "index.js");
const outDir = path.join(root, "dist");

fs.rmSync(outDir, { recursive: true, force: true });

// 1. Real build with --clean and --all
execFileSync(process.execPath, [
  cliPath,
  "--src",
  "test/fixtures",
  "--out",
  "dist",
  "--clean",
  "--all",
], { stdio: "pipe" });

const strippedJs = fs.readFileSync(path.join(outDir, "sample.js"), "utf8");
assert.ok(!strippedJs.includes(": string"), "Flow type annotations should be stripped");
assert.ok(fs.existsSync(path.join(outDir, "styles.css")), "Non-JS asset should be copied");

const noPragmaJs = fs.readFileSync(path.join(outDir, "no-pragma.js"), "utf8");
assert.ok(!noPragmaJs.includes(": number"), "Flow types should be stripped without @flow when --all is passed");

const nestedJs = fs.readFileSync(path.join(outDir, "nested", "helper.js"), "utf8");
assert.ok(!nestedJs.includes(": number"), "Nested Flow file should have types stripped");
assert.ok(fs.existsSync(path.join(outDir, "nested", "config.json")), "Nested non-JS asset should be copied");

// 2. --json with --dry-run
const jsonOut = execFileSync(process.execPath, [
  cliPath,
  "--src",
  "test/fixtures",
  "--out",
  "dist",
  "--dry-run",
  "--json",
], { encoding: "utf8" });
const parsed = JSON.parse(jsonOut.trim());
assert.strictEqual(parsed.strippedJs, 3, "JSON output should report 3 JS files");
assert.strictEqual(parsed.copiedAssets, 2, "JSON output should report 2 asset files");
assert.strictEqual(parsed.dryRun, true, "JSON output should report dryRun: true");

// 3. --quiet
const quietOut = execFileSync(process.execPath, [
  cliPath,
  "--src",
  "test/fixtures",
  "--out",
  "dist",
  "--dry-run",
  "--quiet",
], { encoding: "utf8" });
assert.strictEqual(quietOut.trim(), "", "Quiet mode should suppress standard output");

// 4. --version
const verOut = execFileSync(process.execPath, [cliPath, "--version"], { encoding: "utf8" });
assert.strictEqual(verOut.trim(), "0.1.0", "Version flag should print package.json version");

// 5. Invalid flag exits with code 1
assert.throws(() => {
  execFileSync(process.execPath, [cliPath, "--bogus-flag"], { stdio: "pipe" });
}, (err) => err.status === 1, "Unknown flag should exit with code 1");

// 6. --ignore skips matching files
execFileSync(process.execPath, [
  cliPath,
  "--src",
  "test/fixtures",
  "--out",
  "dist",
  "--clean",
  "--all",
  "--ignore",
  "config.json",
], { stdio: "pipe" });
assert.ok(!fs.existsSync(path.join(outDir, "nested", "config.json")), "Ignored file should not be copied");

// 7. --ext strips custom extensions like .mjs
const mjsFixture = path.join(root, "test", "fixtures", "custom.mjs");
fs.writeFileSync(mjsFixture, "// @flow\nexport function greet(name: string): string { return name; }\n", "utf8");
try {
  execFileSync(process.execPath, [
    cliPath,
    "--src",
    "test/fixtures",
    "--out",
    "dist",
    "--clean",
    "--ext",
    ".mjs",
  ], { stdio: "pipe" });
  const strippedMjs = fs.readFileSync(path.join(outDir, "custom.mjs"), "utf8");
  assert.ok(!strippedMjs.includes(": string"), "Custom --ext .mjs file should have Flow types stripped");
} finally {
  fs.rmSync(mjsFixture, { force: true });
}

// 8. Missing --src directory exits with code 1
assert.throws(() => {
  execFileSync(process.execPath, [cliPath, "--src", "does-not-exist-src", "--out", "dist"], { stdio: "pipe" });
}, (err) => err.status === 1, "Missing source directory should exit with code 1");

// 9. package.json exposes flow-strip-sync bin entry
const pkgJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.strictEqual(pkgJson.bin && pkgJson.bin["flow-strip-sync"], "./index.js", "package.json should define flow-strip-sync bin");

// 9. package.json exposes flow-strip-sync bin entry
assert.strictEqual(pkgJson.bin && pkgJson.bin["flow-strip-sync"], "./index.js", "package.json should define flow-strip-sync bin");

// 10. index.js starts with executable node shebang
const entryContent = fs.readFileSync(cliPath, "utf8");
assert.ok(entryContent.startsWith("#!/usr/bin/env node"), "index.js should start with node shebang");

// 11. --clean removes stale files in output directory
fs.mkdirSync(outDir, { recursive: true });
const staleFile = path.join(outDir, "stale.txt");
fs.writeFileSync(staleFile, "old artifact", "utf8");
execFileSync(process.execPath, [
  cliPath,
  "--src",
  "test/fixtures",
  "--out",
  "dist",
  "--clean",
], { stdio: "pipe" });
assert.ok(!fs.existsSync(staleFile), "--clean should remove pre-existing files in output directory");

// 13. --help prints usage and exits with code 0
const helpOut = execFileSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
assert.ok(helpOut.includes("--src") && helpOut.includes("--out") && helpOut.includes("--version"), "Help output should list CLI options");

// 14. Strips Flow type imports and type aliases
const flowFixture = path.join(root, "test", "fixtures", "types-sample.js");
fs.writeFileSync(
  flowFixture,
  "// @flow\nimport type { Config } from './config';\ntype UserId = string;\nexport function getId(id: UserId): string { return id; }\n",
  "utf8"
);
try {
  execFileSync(process.execPath, [
    cliPath,
    "--src",
    "test/fixtures",
    "--out",
    "dist",
    "--clean",
  ], { stdio: "pipe" });
  const strippedFlow = fs.readFileSync(path.join(outDir, "types-sample.js"), "utf8");
  assert.ok(!strippedFlow.includes("import type"), "Flow type imports should be stripped");
  assert.ok(!strippedFlow.includes("type UserId"), "Flow type aliases should be stripped");
} finally {
  fs.rmSync(flowFixture, { force: true });
}

fs.rmSync(outDir, { recursive: true, force: true });
console.log("All tests passed!");