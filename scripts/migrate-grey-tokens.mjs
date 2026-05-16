#!/usr/bin/env node
/**
 * migrate-grey-tokens.mjs
 *
 * Replaces all legacy grey hex values and Tailwind grey utility classes throughout
 * src/ with the new 13-shade cool-grey token system documented in
 * artifacts/cool-grey-migration.md.
 *
 * Usage:
 *   node scripts/migrate-grey-tokens.mjs           # Dry run — shows changes, writes nothing
 *   node scripts/migrate-grey-tokens.mjs --apply   # Apply all changes to disk
 *   node scripts/migrate-grey-tokens.mjs --verbose # Also show unchanged files
 *
 * What it changes:
 *   • src/index.css          — injects --cool-grey-* CSS var block into :root if absent
 *   • src/tailwind.css       — injects --color-cool-grey-* @theme entries if absent
 *   • src/ css files           — replaces grey hex values → var(--cool-grey-X)
 *   • src/ tsx/ts/jsx files   — replaces Tailwind gray-N/neutral-N utility classes +
 *                               grey hex values → var(--cool-grey-X)
 *   • src/icons/ svg files    — replaces grey fill/stroke hex → currentColor
 *   • src/ other svg files    — replaces grey fill/stroke hex → var(--cool-grey-X)
 *
 * Alpha variants (#RRGGBBAA) are auto-replaced with color-mix(in srgb, ...) equivalents.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src');

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// ─── PALETTE ────────────────────────────────────────────────────────────────

const SHADE_TO_HEX = {
  '50':  '#F7F9FC',
  '100': '#EEF2F7',
  '200': '#DCE3EE',
  '300': '#C3CDDC',
  '400': '#A3B0C4',
  '500': '#7E8A9E',
  '600': '#626D82',
  '700': '#4B5468',
  '800': '#383F50',
  '900': '#2C313F',
  '925': '#21252F',
  '950': '#111319',
  '975': '#05070A',
};

/**
 * Maps uppercase legacy hex → cool-grey shade number.
 * All 98 greys from the exhaustive palette analysis (artifacts/cool-grey-migration.md).
 */
const HEX_TO_SHADE = {
  // ── cool-grey-50 (#F7F9FC) ────────────────────────────────────────────────
  '#F9FBFE': '50', '#F4F4F5': '50', '#FAFAFA': '50',
  '#FCFCFC': '50', '#F5F5F5': '50', '#F3F4F6': '50',
  // ── cool-grey-100 (#EEF2F7) ───────────────────────────────────────────────
  '#ECEDEE': '100', '#E6EDF3': '100', '#E5E5E5': '100',
  '#EEEEEE': '100', '#E8E8E8': '100',
  // ── cool-grey-200 (#DCE3EE) ───────────────────────────────────────────────
  '#E4E7EB': '200', '#E4E4E4': '200', '#E5E7EB': '200', '#DEDFE0': '200',
  '#D9D9D9': '200', '#D6D6D6': '200', '#D5D9E5': '200', '#D0D9FA': '200',
  '#D4D4D4': '200', '#D1D5DB': '200',
  // ── cool-grey-300 (#C3CDDC) ───────────────────────────────────────────────
  '#C4CBDA': '300', '#C9C7C7': '300', '#B7BDC2': '300',
  '#B1B9D3': '300', '#AFB8C1': '300',
  // ── cool-grey-400 (#A3B0C4) ───────────────────────────────────────────────
  '#9CA3AF': '400', '#959CB2': '400', '#9299AA': '400', '#9099AC': '400',
  '#A3A3A3': '400', '#A7A7A7': '400', '#A1A1A1': '400',
  // ── cool-grey-500 (#7E8A9E) ───────────────────────────────────────────────
  '#8D95A9': '500', '#868E96': '500', '#7E848C': '500',
  '#8C8C8C': '500', '#969896': '500',
  // ── cool-grey-600 (#626D82) ───────────────────────────────────────────────
  '#727987': '600', '#717888': '600', '#6B7280': '600',
  '#6C6C6C': '600', '#737373': '600',
  // ── cool-grey-700 (#4B5468) ───────────────────────────────────────────────
  '#525B6F': '700', '#4B505F': '700', '#4B4E57': '700', '#474A54': '700',
  '#4B5563': '700', '#5C5D62': '700', '#525252': '700', '#4E4E4E': '700',
  // ── cool-grey-800 (#383F50) ───────────────────────────────────────────────
  '#3F4452': '800', '#3A3D44': '800', '#3A3D46': '800', '#3C3C4A': '800',
  '#3C3C49': '800', '#3A3C45': '800', '#383B45': '800', '#363840': '800',
  '#374151': '800', '#393939': '800', '#363636': '800', '#404040': '800',
  '#454545': '800', '#444444': '800',
  // ── cool-grey-900 (#2C313F) ───────────────────────────────────────────────
  '#30363D': '900', '#31343D': '900', '#2F3137': '900', '#2D3039': '900',
  '#2A3038': '900', '#2D2F36': '900', '#2A2F38': '900', '#2A2D37': '900',
  '#2D2D2D': '900', '#2A2A2A': '900', '#292929': '900',
  // ── cool-grey-925 (#21252F) ───────────────────────────────────────────────
  '#24272E': '925', '#24292F': '925', '#25272D': '925', '#26282D': '925',
  '#1F2228': '925', '#1F2125': '925', '#1E2028': '925', '#1F2937': '925',
  '#262626': '925', '#242424': '925', '#1F1F1F': '925', '#1E1E1E': '925',
  // ── cool-grey-950 (#111319) ───────────────────────────────────────────────
  '#1A1A1A': '950', '#171717': '950', '#0D0F11': '950', '#0B0E14': '950',
  '#0F172A': '950', '#111827': '950', '#0C0E10': '950', '#0F0F0F': '950',
  // ── cool-grey-975 (#05070A) ───────────────────────────────────────────────
  '#0A0A0A': '975', '#050505': '975',
};

/** Old Tailwind gray-* shade numbers → cool-grey shade */
const GRAY_TO_COOL_GREY = {
  '100': '50',  '200': '200', '300': '200', '400': '400',
  '500': '600', '600': '700', '700': '800', '800': '925',
  '900': '950', '950': '975',
};

/** Old Tailwind neutral-* shade numbers → cool-grey shade */
const NEUTRAL_TO_COOL_GREY = {
  '100': '50',  '200': '100', '300': '200', '400': '400',
  '500': '600', '600': '700', '700': '800', '800': '925',
  '900': '950', '950': '975',
};

/**
 * 8-digit alpha hex values → color-mix() equivalents.
 * Opacity computed as round(0xAA / 255 * 100).
 *   #RRGGBB → nearest cool-grey shade (same rules as 6-digit mapping)
 *   pure black alpha values → rgba() to avoid color-mix dependency on cool-grey tokens
 */
const ALPHA_HEX_RE = /#[0-9A-Fa-f]{8}(?![0-9A-Fa-f])/g;
const ALPHA_HEX_REPLACEMENTS = {
  // solid base → cool-grey-300, opacity 0x33/255 = 20%
  '#AFB8C133': 'color-mix(in srgb, var(--cool-grey-300) 20%, transparent)',
  // solid base → cool-grey-925, opacity 0x99/255 = 60%
  '#24242499': 'color-mix(in srgb, var(--cool-grey-925) 60%, transparent)',
  // solid base → cool-grey-925, opacity 0xCC/255 = 80%
  '#242424CC': 'color-mix(in srgb, var(--cool-grey-925) 80%, transparent)',
  // solid base → cool-grey-925, opacity 0x99/255 = 60%
  '#1F1F1F99': 'color-mix(in srgb, var(--cool-grey-925) 60%, transparent)',
  // solid base → cool-grey-975, opacity 0x80/255 ≈ 50%
  '#0A0A0A80': 'color-mix(in srgb, var(--cool-grey-975) 50%, transparent)',
  // solid base → cool-grey-950, opacity 0xCC/255 = 80%
  '#171717CC': 'color-mix(in srgb, var(--cool-grey-950) 80%, transparent)',
  // solid base → cool-grey-975, opacity 0xCC/255 = 80%
  '#0A0A0ACC': 'color-mix(in srgb, var(--cool-grey-975) 80%, transparent)',
  // pure black, opacity 0x1A/255 ≈ 10%
  '#0000001A': 'rgba(0, 0, 0, 0.1)',
  // pure black, opacity 0x77/255 ≈ 47%
  '#00000077': 'rgba(0, 0, 0, 0.467)',
};

// ─── CSS BLOCKS TO INJECT ───────────────────────────────────────────────────

const CSS_VARS_BLOCK = `
  /* ── Cool Grey Scale (13 shades + 2 pure anchors: white / black) ──────── */
  --cool-grey-50:  #F7F9FC;
  --cool-grey-100: #EEF2F7;
  --cool-grey-200: #DCE3EE;
  --cool-grey-300: #C3CDDC;
  --cool-grey-400: #A3B0C4;
  --cool-grey-500: #7E8A9E;
  --cool-grey-600: #626D82;
  --cool-grey-700: #4B5468;
  --cool-grey-800: #383F50;
  --cool-grey-900: #2C313F;
  --cool-grey-925: #21252F;
  --cool-grey-950: #0B0E14; /* intentional override: preserves original app-shell depth */
  --cool-grey-975: #05070A;
  /* ─────────────────────────────────────────────────────────────────────── */`;

const TAILWIND_THEME_BLOCK = `
  /* Cool Grey scale */
  --color-cool-grey-50:  var(--cool-grey-50);
  --color-cool-grey-100: var(--cool-grey-100);
  --color-cool-grey-200: var(--cool-grey-200);
  --color-cool-grey-300: var(--cool-grey-300);
  --color-cool-grey-400: var(--cool-grey-400);
  --color-cool-grey-500: var(--cool-grey-500);
  --color-cool-grey-600: var(--cool-grey-600);
  --color-cool-grey-700: var(--cool-grey-700);
  --color-cool-grey-800: var(--cool-grey-800);
  --color-cool-grey-900: var(--cool-grey-900);
  --color-cool-grey-925: var(--cool-grey-925);
  --color-cool-grey-950: var(--cool-grey-950);
  --color-cool-grey-975: var(--cool-grey-975);`;

// ─── FILE WALKER ─────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'build', 'dist', '__snapshots__',
  'test-results', '.next', 'coverage', 'playwright-report',
]);

function* walkFiles(dir, exts) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walkFiles(full, exts);
    } else if (entry.isFile() && exts.includes(extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

// ─── HEX REGEX (built once from the full mapping table) ─────────────────────

// Matches any of the known grey hex values, case-insensitive, not preceded/followed
// by another hex digit (prevents partial matches inside longer hex strings).
const HEX_PATTERN = new RegExp(
  `(?<![0-9A-Fa-f])(${
    Object.keys(HEX_TO_SHADE)
      .map(h => h.slice(1)) // strip leading '#', we'll match '#' separately
      .join('|')
  })(?![0-9A-Fa-f])`,
  'gi',
);

function replaceHex(str, replacement) {
  return str.replace(/#([0-9A-Fa-f]{6})(?![0-9A-Fa-f])/g, (match) => {
    const upper = `#${match.slice(1).toUpperCase()}`;
    const shade = HEX_TO_SHADE[upper];
    if (!shade) return match;
    return replacement(shade, match);
  });
}

// ─── TAILWIND CLASS REPLACEMENT ──────────────────────────────────────────────

// Matches: {prefix}-(gray|neutral)-(shade)(/(opacity))?
// Prefix covers the full set of Tailwind color-bearing utilities.
const TAILWIND_RE = /\b(bg|text|border|ring|divide|fill|stroke|shadow|placeholder|outline|from|via|to|accent|caret|decoration|underline|inset-ring)-(gray|neutral|slate|zinc)-(\d+)(\/[\d.]+)?\b/g;

function replaceTailwind(str, changes) {
  return str.replace(TAILWIND_RE, (match, prefix, scale, shade, opacity = '') => {
    let map;
    if (scale === 'gray')                     map = GRAY_TO_COOL_GREY;
    else if (scale === 'neutral')             map = NEUTRAL_TO_COOL_GREY;
    else                                       return match; // slate/zinc: same as neutral
    const newShade = map[shade];
    if (!newShade) return match;
    const replacement = `${prefix}-cool-grey-${newShade}${opacity}`;
    changes.push({ from: match, to: replacement });
    return replacement;
  });
}

// ─── PER-FILETYPE PROCESSORS ─────────────────────────────────────────────────

/** CSS files: replace hex → var(--cool-grey-X) and alpha hex → color-mix(), line by line */
function processCss(content) {
  const changes = [];
  const result = content
    .split('\n')
    .map(line => {
      // Never touch the cool-grey variable definitions themselves
      if (/--cool-grey-\d+:/.test(line)) return line;

      // Replace 8-digit alpha hex values first (must run before 6-digit to avoid partial match)
      let out = line.replace(ALPHA_HEX_RE, (match) => {
        const upper = match.toUpperCase();
        const repl = ALPHA_HEX_REPLACEMENTS[upper];
        if (!repl) return match;
        changes.push({ from: match, to: repl });
        return repl;
      });

      // Replace 6-digit hex values
      out = replaceHex(out, (shade, original) => {
        changes.push({ from: original, to: `var(--cool-grey-${shade})` });
        return `var(--cool-grey-${shade})`;
      });

      return out;
    })
    .join('\n');
  return { result, changes };
}

/** TSX/TS/JSX files: Tailwind class names + alpha hex + hex → var(--cool-grey-X) */
function processScript(content) {
  const changes = [];

  // 1. Tailwind grey utility classes
  let result = replaceTailwind(content, changes);

  // 2. Replace 8-digit alpha hex values first (must run before 6-digit pass)
  result = result.replace(ALPHA_HEX_RE, (match) => {
    const upper = match.toUpperCase();
    const repl = ALPHA_HEX_REPLACEMENTS[upper];
    if (!repl) return match;
    changes.push({ from: match, to: repl });
    return repl;
  });

  // 3. Raw 6-digit hex values (in string literals, style objects, template literals)
  result = replaceHex(result, (shade, original) => {
    changes.push({ from: original, to: `var(--cool-grey-${shade})` });
    return `var(--cool-grey-${shade})`;
  });

  return { result, changes };
}

/**
 * SVG files in src/icons/: grey fill/stroke → currentColor (icons inherit text color).
 * Other SVG files: grey fill/stroke → var(--cool-grey-X).
 */
function processSvg(content, isIcon) {
  const changes = [];
  const result = content.replace(
    /\b(fill|stroke)="(#[0-9A-Fa-f]{6})"/gi,
    (match, attr, hex) => {
      const upper = `#${hex.slice(1).toUpperCase()}`;
      const shade = HEX_TO_SHADE[upper];
      if (!shade) return match;
      const to = isIcon ? `${attr}="currentColor"` : `${attr}="var(--cool-grey-${shade})"`;
      changes.push({ from: match, to });
      return to;
    },
  );
  return { result, changes };
}

// ─── SPECIAL FILES: inject token definitions ─────────────────────────────────

function injectIndexCss(content) {
  if (content.includes('--cool-grey-50:')) return { result: content, changes: [] };
  // Insert before the closing brace of the first :root block
  const result = content.replace(/(:root\s*\{[\s\S]*?)(})/, (_, body, close) => {
    return `${body}${CSS_VARS_BLOCK}\n${close}`;
  });
  const changed = result !== content;
  return {
    result,
    changes: changed ? [{ from: '(no --cool-grey vars)', to: '(injected 13 CSS var definitions into :root)' }] : [],
  };
}

function injectTailwindCss(content) {
  if (content.includes('--color-cool-grey-50:')) return { result: content, changes: [] };
  // Insert before the closing brace of the @theme inline block
  const result = content.replace(/(@theme\s+inline\s*\{[\s\S]*?)(})/, (_, body, close) => {
    return `${body}${TAILWIND_THEME_BLOCK}\n${close}`;
  });
  const changed = result !== content;
  return {
    result,
    changes: changed ? [{ from: '(no --color-cool-grey entries)', to: '(injected 13 Tailwind @theme entries)' }] : [],
  };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

const stats = {
  filesScanned:  0,
  filesChanged:  0,
  hexChanges:    0,
  twChanges:     0,
  alphaChanges:  0,
  injections:    0,
};

const report = [];

function processFile(filePath) {
  const rel  = relative(ROOT, filePath);
  const ext  = extname(filePath).toLowerCase();
  const base = filePath.split('/').at(-1);
  const isIconSvg = filePath.includes('/icons/') && ext === '.svg';

  const original = readFileSync(filePath, 'utf8');
  let content = original;
  let allChanges = [];

  // Special injection pass for the two root style files
  if (rel === 'src/index.css') {
    const { result, changes } = injectIndexCss(content);
    content = result;
    allChanges.push(...changes);
    if (changes.length) stats.injections++;
  }
  if (rel === 'src/tailwind.css') {
    const { result, changes } = injectTailwindCss(content);
    content = result;
    allChanges.push(...changes);
    if (changes.length) stats.injections++;
  }

  // Per-filetype transformation
  let processed;
  if (ext === '.css') {
    processed = processCss(content);
  } else if (['.tsx', '.ts', '.jsx', '.js'].includes(ext)) {
    processed = processScript(content);
  } else if (ext === '.svg') {
    processed = processSvg(content, isIconSvg);
  } else {
    return;
  }

  content = processed.result;
  allChanges.push(...processed.changes);

  stats.filesScanned++;

  const hexCount = allChanges.filter(c => !c.isWarning && (c.from.startsWith('#') || c.from.includes('AFB8') || c.from.includes('242424'))).length;
  const twCount  = allChanges.filter(c => !c.from.startsWith('#') && !c.from.startsWith('(') && c.from.match(/-(gray|neutral|slate|zinc)-/)).length;
  const alphaCount = allChanges.filter(c => /^#[0-9a-fA-F]{8}/.test(c.from)).length;

  stats.hexChanges    += hexCount;
  stats.twChanges     += twCount;
  stats.alphaChanges  += alphaCount;

  const changed = content !== original;

  if (changed || allChanges.length > 0) {
    stats.filesChanged++;
    report.push({ rel, allChanges, changed });

    if (APPLY && changed) {
      writeFileSync(filePath, content, 'utf8');
    }
  } else if (VERBOSE) {
    report.push({ rel, allChanges: [], changed: false });
  }
}

// Process src/index.css and src/tailwind.css first (injection)
processFile(join(SRC, 'index.css'));
processFile(join(SRC, 'tailwind.css'));

// Walk all other source files
for (const file of walkFiles(SRC, ['.tsx', '.ts', '.jsx', '.js', '.css', '.svg'])) {
  const rel = relative(SRC, file);
  if (rel === 'index.css' || rel === 'tailwind.css') continue; // already processed
  processFile(file);
}

// ─── OUTPUT ──────────────────────────────────────────────────────────────────

const mode = APPLY ? '🟢 APPLIED' : '🔵 DRY RUN';
console.log(`\n${mode} — Cool Grey Token Migration`);
console.log('═'.repeat(60));

for (const { rel, allChanges } of report) {
  if (allChanges.length === 0) continue;
  console.log(`\n  ${rel}`);
  for (const c of allChanges) {
    const label = c.isWarning ? '  ⚠ ' : '  → ';
    // Deduplicate same from→to pairs in display
    console.log(`${label}${c.from.padEnd(28)} ➜  ${c.to}`);
  }
}

console.log('\n' + '─'.repeat(60));
console.log(`  Files scanned : ${stats.filesScanned}`);
console.log(`  Files changed : ${stats.filesChanged}`);
console.log(`  Hex swaps     : ${stats.hexChanges}`);
console.log(`  Tailwind swaps: ${stats.twChanges}`);
console.log(`  Alpha swaps   : ${stats.alphaChanges}`);
console.log(`  Injections    : ${stats.injections}`);

if (!APPLY && stats.filesChanged > 0) {
  console.log(`\n  ℹ  Run with --apply to write changes to disk.\n`);
}
if (APPLY) {
  console.log(`\n  ✅ All changes written. Run 'npm run typecheck && npm run build' to verify.\n`);
}
