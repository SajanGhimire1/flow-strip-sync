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
console.log("All tests passed!");
