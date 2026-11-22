# flow-strip-sync

A lightweight CLI utility that strips Flow types from JavaScript files and copies non-JS assets (styles, JSON, media) into an output folder while keeping directory structure intact.

## Quick Start

```bash
npm install
node index.js --src src --out dist --clean
```

## Options

- `--src, -s <dir>`: Source directory (default: `src`)
- `--out, -o <dir>`: Output directory (default: `dist`)
- `--all, -a`: Strip types from all JS files, even without `// @flow`
- `--clean`: Remove existing output directory before building
- `--dry-run`: Preview file counts without writing output files
- `--json`: Print build summary as JSON
- `--quiet, -q`: Suppress non-JSON console output
- `--version, -v`: Show CLI version
- `--help, -h`: Display usage info
