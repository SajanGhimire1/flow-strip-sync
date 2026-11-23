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
    ignore: [],
    extensions: [".js", ".jsx"],
    dryRun: false,
    json: false,
    quiet: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--all" || arg === "-a") { options.all = true; } else if (arg === "--clean") {
      options.clean = true;
    } else if (arg === "--quiet" || arg === "-q") { options.quiet = true; } else if (arg === "--json") { options.json = true; } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--ext" || arg === "-e") {
      if (!args[i + 1]) {
        throw new Error(`Missing value for ${arg}`);
      }
      const exts = args[i + 1].split(",").map((ext) => ext.trim().startsWith(".") ? ext.trim() : `.${ext.trim()}`).filter(Boolean);
      options.extensions = exts;
      i += 1;
    } else if (arg === "--ignore" || arg === "-i") {
      if (!args[i + 1]) {
        throw new Error(`Missing value for ${arg}`);
      }
      options.ignore.push(args[i + 1]);
      i += 1;
    } else if (arg === "--src" || arg === "-s") {
      if (!args[i + 1]) {
        throw new Error(`Missing value for ${arg}`);
      }
      options.src = args[i + 1];
      i += 1;
    } else if (arg === "--out" || arg === "-o") {
      if (!args[i + 1]) {
        throw new Error(`Missing value for ${arg}`);
      }
      options.out = args[i + 1];
      i += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
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
  -i, --ignore <pat>  Skip matching file or folder (repeatable)
  -e, --ext <exts>    Comma-separated JS extensions (default: .js,.jsx)
  --clean           Remove output directory before building
  --dry-run         Preview actions without writing files
  --json            Output summary as JSON
  -q, --quiet       Suppress non-JSON console output
  -v, --version     Show CLI version
  -h, --help        Show this help message
`);
}

function stripFlowCode(sourceCode, all) {
  if (typeof flowRemoveTypes === "function") {
    return flowRemoveTypes(sourceCode, { all }).toString();
  }
  return sourceCode.replace(/^\s*\/\/\s*@flow\s*\r?\n/m, "");
}

function shouldIgnore(relativePath, patterns) {
  const normalized = relativePath.split(path.sep).join("/");
  const baseName = path.basename(normalized);
  return patterns.some((pattern) => {
    if (normalized === pattern || baseName === pattern) {
      return true;
    }
    if (pattern.startsWith("*")) {
      return baseName.endsWith(pattern.slice(1));
    }
    if (pattern.endsWith("/")) {
      const folder = pattern.slice(0, -1);
      return normalized === folder || normalized.startsWith(folder + "/");
    }
    return false;
  });
}

function stripFlowTypes(source) {
  return source
    .replace(/^\s*import\s+(?:type|typeof)\s+[^;\r\n]+;?\s*\r?\n?/gm, "")
    .replace(/^\s*(?:export\s+)?type\s+[A-Za-z0-9_$]+(?:<[^>]+>)?\s*=\s*[^;\r\n]+;?\s*\r?\n?/gm, "");
}

function stripInlineAnnotations(source) {
  return source
    .replace(/(\b(?:const|let|var)\s+[A-Za-z0-9_$]+)\s*:\s*[A-Za-z0-9_$|<>[\]]+(?=\s*=)/g, "$1")
    .replace(/(\([A-Za-z0-9_$,\s]*)([A-Za-z0-9_$]+)\s*:\s*[A-Za-z0-9_$|<>[\]]+(?=\s*[,)])/g, "$1$2")
    .replace(/(\))\s*:\s*[A-Za-z0-9_$|<>[\]]+(?=\s*\{)/g, "$1");
}

function stripExactAndOptionalTypes(source) {
  return source
    .replace(/\{\|[\s\S]*?\|\}/g, "{}")
    .replace(/([A-Za-z0-9_$]+)\?\s*:\s*[A-Za-z0-9_$|<>[\]]+/g, "$1");
}

function stripFlowInterfaces(source) {
  return source.replace(/^\s*(?:export\s+)?interface\s+[A-Za-z0-9_$]+(?:<[^>]+>)?\s*\{[\s\S]*?\}\s*\r?\n?/gm, "");
}

function stripFlowDeclares(source) {
  return source
    .replace(/^\s*(?:export\s+)?declare\s+(?:function|var|let|const)\s+[^;\r\n]+;?\s*\r?\n?/gm, "")
    .replace(/^\s*(?:export\s+)?declare\s+(?:class|module)\s+[A-Za-z0-9_$.]+(?:<[^>]+>)?\s*\{[\s\S]*?\}\s*\r?\n?/gm, "");
}

const FLOW_CAST_RE = new RegExp("\\(([A-Za-z0-9_$.]+)\\s*:\\s*[A-Za-z0-9_$|<>\\[\\]]+\\s*\\)", "g");
function stripFlowCasts(source) {
  return source.replace(FLOW_CAST_RE, "($1)");
}

function stripOpaqueTypes(source) {
  return source.replace(/^\s*(?:export\s+)?opaque\s+type\s+[A-Za-z0-9_$]+(?:<[^>]+>)?[^;\r\n]*;?\s*\r?\n?/gm, "");
}

function stripVarianceModifiers(source) {
  return source.replace(/([\{\[,;]\s*)[+-](?=[A-Za-z0-9_$]+\s*:)/g, "$1");
}

function stripObjectTypeAnnotations(source) {
  return source
    .replace(/\{\|[\s\S]*?\|\}/g, "{}")
    .replace(/(\b(?:const|let|var)\s+[A-Za-z0-9_$]+|\([A-Za-z0-9_$,\s]*[A-Za-z0-9_$]+|\))\s*:\s*\{[^{}]*\}/g, "$1");
}

function stripFunctionTypeAnnotations(source) {
  return source.replace(/(\b(?:const|let|var)\s+[A-Za-z0-9_$]+|\([A-Za-z0-9_$,\s]*[A-Za-z0-9_$]+|\))\s*:\s*\([^)]*\)\s*=>\s*[A-Za-z0-9_$|<>\[\]]+/g, "$1");
}

function stripGenericCallArgs(source) {
  return source.replace(/([A-Za-z0-9_$]+)<[A-Za-z0-9_$,\s|?&\[\]]+>(?=\s*\()/g, "$1");
}

function stripMaybeTypeAnnotations(source) {
  return source.replace(/(\b(?:const|let|var)\s+[A-Za-z0-9_$]+|\([A-Za-z0-9_$,\s]*[A-Za-z0-9_$]+|\))\s*:\s*\?[A-Za-z0-9_$|<>\[\]]+/g, "$1");
}

function processDirectory(srcDir, outDir, stats, options, baseSrcDir = srcDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const relPath = path.relative(baseSrcDir, path.join(srcDir, entry.name));
    if (options.ignore && shouldIgnore(relPath, options.ignore)) {
      continue;
    }
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    const srcPath = path.join(srcDir, entry.name);
    const outPath = path.join(outDir, entry.name);

    if (entry.isDirectory()) {
      if (!options.dryRun) {
        fs.mkdirSync(outPath, { recursive: true });
      }
      processDirectory(srcPath, outPath, stats, options, baseSrcDir, baseSrcDir);
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
        fs.writeFileSync(outPath, stripFlowTypes(stripped), "utf8");
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
  let options;
  try {
    options = parseArgs(process.argv);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (options.version) {
    const pkg = require("./package.json");
    console.log(pkg.version);
    process.exit(0);
  }

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
  } else if (!options.quiet) {
    const modeLabel = options.dryRun ? " (dry-run)" : "";
    console.log(
      `Done${modeLabel}: stripped ${stats.strippedJs} JS file(s), copied ${stats.copiedAssets} asset file(s) -> ${options.out}`
    );
  }
}

main();

