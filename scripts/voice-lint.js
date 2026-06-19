#!/usr/bin/env node
'use strict';

// ── Reflect-never-prompt voice lint ────────────────────────────
// Guards the Buddy Bill of Rights at the line level. The buddy may
// observe what happened or sympathize with a struggle — it must never
// (a) instruct the user ("you should run your tests" = Clippy), or
// (b) reference its own feelings about your absence ("I missed you" =
// the Replika dependency trap). Run in CI / pre-commit.
//
// Usage:  node scripts/voice-lint.js   (exit 1 if any line offends)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['buddy-mcp-server.js', 'buddy-statusline.js', 'buddy-progression.js'];

// Imperative second-person instructions (telling the dev what to do).
const IMPERATIVE = [
  /\byou\s+(should|must|need to|have to|ought to|gotta|better)\b/i,
  /\b(make sure|don'?t forget|be sure to|remember to|you'?ll want to|try to)\b/i,
  /\bgo (run|fix|check|add|write|commit|push)\b/i,
  /\b(run|fix|check|add|write) your\b/i,
];

// Neediness / absence-guilt (weaponizing the nurturing instinct).
const NEEDY = [
  /\b(i|we) missed you\b/i,
  /\bmiss(ed|ing)? you\b/i,
  /\b(i'?m|i am|so) lonely\b/i,
  /\bneglect/i,
  /\byou (left|abandoned|forgot) me\b/i,
  /\b(please )?come back\b/i,
  /\bwhere (were|have) you been\b/i,
  /\bdon'?t leave me\b/i,
  /\bi('?ve| have)? been waiting\b/i,
];

// Pull every quoted string literal out of a source line.
function literals(line) {
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

const offenses = [];
for (const file of FILES) {
  const full = path.join(ROOT, file);
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
  text.split('\n').forEach((line, i) => {
    for (const lit of literals(line)) {
      for (const re of IMPERATIVE) {
        if (re.test(lit)) offenses.push({ file, line: i + 1, kind: 'imperative (Clippy)', lit });
      }
      for (const re of NEEDY) {
        if (re.test(lit)) offenses.push({ file, line: i + 1, kind: 'neediness (Replika)', lit });
      }
    }
  });
}

if (offenses.length === 0) {
  console.log('voice-lint: clean — every line reflects, none prompts. ✦');
  process.exit(0);
}

console.error('voice-lint: ' + offenses.length + ' line(s) violate the Buddy Bill of Rights:\n');
for (const o of offenses) {
  console.error(`  ${o.file}:${o.line}  [${o.kind}]  "${o.lit}"`);
}
console.error('\nLines may observe or sympathize — never instruct, never reference the buddy missing you.');
process.exit(1);
