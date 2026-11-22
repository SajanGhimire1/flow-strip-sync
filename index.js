#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

let flowRemoveTypes;
try {
  flowRemoveTypes = require("flow-remove-types");
} catch {
  flowRemoveTypes = null;
}

const JS_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    src: "src",
    out: "dist",
    clean: false,
    all: false,
    dryRun: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--all" || arg === "-a") { options.all = true; } else if (arg === "--clean") {
      options.clean = true;
    } else if (arg === "--json") { options.json = true; } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if ((arg === "--src" || arg === "-s") && args[i + 1]) {
      options.src = args[i + 1];
      i += 1;
    } else if ((arg === "--out" || arg === "-o") && args[i + 1]) {
      options.out = args[i + 1];
      i += 1;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: flow-strip-sync [--src <dir>] [--out <dir>] [--clean] [--dry-run] [--help]

Options:
  -s, --src <dir>   Source directory (default: src)
  -o, --out <dir>   Output directory (default: dist)
  -a, --all         Strip types from all JS files, even without @flow
  --clean           Remove output directory before building
  --dry-run         Preview actions without writing files
  --json            Output summary as JSON
  -h, --help        Show this help message
`);
}

function stripFlowCode(sourceCode, all) {
  if (typeof flowRemoveTypes === "function") {
    return flowRemoveTypes(sourceCode, { all }).toString();
  }
  return sourceCode.replace(/^\s*\/\/\s*@flow\s*\r?\n/m, "");
}

function processDirectory(srcDir, outDir, stats, options) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    const srcPath = path.join(srcDir, entry.name);
    const outPath = path.join(outDir, entry.name);

    if (entry.isDirectory()) {
      if (!options.dryRun) {
        fs.mkdirSync(outPath, { recursive: true });
      }
      processDirectory(srcPath, outPath, stats, options);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();

    if (JS_EXTENSIONS.has(ext)) {
      const rawContent = fs.readFileSync(srcPath, "utf8");
      const stripped = stripFlowCode(rawContent, options.all);

      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, stripped, "utf8");
      }
      stats.strippedJs += 1;
    } else {
      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.copyFileSync(srcPath, outPath);
      }
      stats.copiedAssets += 1;
    }
  }
}

function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const resolvedSrc = path.resolve(process.cwd(), options.src);
  const resolvedOut = path.resolve(process.cwd(), options.out);

  if (!fs.existsSync(resolvedSrc)) {
    console.error(`Error: Source directory not found: ${resolvedSrc}`);
    process.exit(1);
  }

  if (options.clean && !options.dryRun && fs.existsSync(resolvedOut)) {
    fs.rmSync(resolvedOut, { recursive: true, force: true });
  }

  const stats = { strippedJs: 0, copiedAssets: 0 };

  if (!options.dryRun) {
    fs.mkdirSync(resolvedOut, { recursive: true });
  }

  processDirectory(resolvedSrc, resolvedOut, stats, options);

  if (options.json) {
    console.log(JSON.stringify({
      src: options.src,
      out: options.out,
      strippedJs: stats.strippedJs,
      copiedAssets: stats.copiedAssets,
      dryRun: options.dryRun,
    }));
  } else {
    const modeLabel = options.dryRun ? " (dry-run)" : "";
    console.log(
      `Done${modeLabel}: stripped ${stats.strippedJs} JS file(s), copied ${stats.copiedAssets} asset file(s) -> ${options.out}`
    );
  }
}

main();

