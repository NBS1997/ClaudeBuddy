#!/usr/bin/env node
'use strict';

// ══════════════════════════════════════════════════════════════
//  Claude Buddy MCP Server
//  A Model Context Protocol server that brings your Claude Buddy
//  companion into Claude Code conversations.
//
//  Communicates via stdin/stdout using JSON-RPC 2.0
//  (newline-delimited JSON). Logs to stderr only.
//
//  Tools: buddy_status, buddy_react, buddy_pet, buddy_talk
// ══════════════════════════════════════════════════════════════

const readline = require('readline');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  levelFromXP, xpForLevel, xpProgress, stageFromLevel, allAchievements,
  isRecentLine, recordLine, displayStats, STAT_MEANING,
  evolutionInfo, trendingPath,
} = require('./buddy-progression.js');
const {
  resolveContext, ensureBuddySave, safeReadJSON, safeWriteJSON,
  writeActivePointer, updateCollection, COLLECTION_PATH,
} = require('./buddy-paths.js');
const { pickVoice } = require('./buddy-voice.js');

// ── Types & Constants ──────────────────────────────────────────

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
const RARITY_STARS  = { common: '\u2605', uncommon: '\u2605\u2605', rare: '\u2605\u2605\u2605', epic: '\u2605\u2605\u2605\u2605', legendary: '\u2605\u2605\u2605\u2605\u2605' };
const RARITY_FLOOR  = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 };

const SPECIES = [
  'duck','goose','blob','cat','dragon','octopus','owl','penguin',
  'turtle','snail','ghost','axolotl','capybara','cactus','robot',
  'rabbit','mushroom','chonk',
];
const EYES = ['\u00B7', '\u2726', '\u00D7', '\u25C9', '@', '\u00B0'];
const HATS = ['none','crown','tophat','propeller','halo','wizard','beanie','tinyduck'];
const STAT_NAMES = ['DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK'];
const SALT = 'friend-2026-401';

// Resolve this session's buddy once at startup. Claude Code sets
// CLAUDE_PROJECT_DIR to the session's project root in the spawned server's
// env; process.cwd() is the launcher's directory (the editor host's, shared
// across windows) and is explicitly not guaranteed — relying on it surfaced
// another repo's buddy in every report when multiple sessions were open.
// Fall back to cwd only when the env var is absent (older Claude Code).
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CTX = resolveContext(PROJECT_DIR);
const SAVE_PATH = CTX.savePath;

// ── PRNG & Hashing ─────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function rollRarity(rng) {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const r of RARITIES) { roll -= RARITY_WEIGHTS[r]; if (roll < 0) return r; }
  return 'common';
}

function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);
  const stats = {};
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    else stats[name] = floor + Math.floor(rng() * 40);
  }
  return stats;
}

function rollFrom(rng) {
  const rarity = rollRarity(rng);
  return {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01,
    stats: rollStats(rng, rarity),
  };
}

function roll(seed) {
  const key = seed + SALT;
  return rollFrom(mulberry32(hashString(key)));
}

// Roll with explicit overrides — keeps deterministic stats but lets the user pick traits
function rollWithOverrides(seed, overrides) {
  const rng = mulberry32(hashString(seed + SALT));
  const base = rollFrom(rng);
  if (overrides.species && SPECIES.includes(overrides.species)) base.species = overrides.species;
  if (overrides.rarity && RARITIES.includes(overrides.rarity)) {
    base.rarity = overrides.rarity;
    base.stats = rollStats(mulberry32(hashString(seed + overrides.rarity)), overrides.rarity);
    if (overrides.rarity === 'common') base.hat = 'none';
  }
  if (overrides.eye && EYES.includes(overrides.eye)) base.eye = overrides.eye;
  if (overrides.hat && HATS.includes(overrides.hat) && base.rarity !== 'common') base.hat = overrides.hat;
  if (overrides.shiny === true || overrides.shiny === false) base.shiny = overrides.shiny;
  return base;
}

// ── Sprite Art ─────────────────────────────────────────────────

const E = '{E}';
const BODIES = {
  duck: [
    ['            ',`    __      `,`  <(${E} )___  `,`   (  ._>   `,`    \`--\u00B4    `],
    ['            ',`    __      `,`  <(${E} )___  `,`   (  ._>   `,`    \`--\u00B4~   `],
    ['            ',`    __      `,`  <(${E} )___  `,`   (  .__>  `,`    \`--\u00B4    `],
  ],
  goose: [
    ['            ',`     (${E}>    `,'     ||     ','   _(__)_   ','    ^^^^    '],
    ['            ',`    (${E}>     `,'     ||     ','   _(__)_   ','    ^^^^    '],
    ['            ',`     (${E}>>   `,'     ||     ','   _(__)_   ','    ^^^^    '],
  ],
  blob: [
    ['            ','   .----.   ',`  ( ${E}  ${E} )  `,'  (      )  ','   `----\u00B4   '],
    ['            ','  .------.  ',`  ( ${E}  ${E}  ) `,' (        ) ','  `------\u00B4  '],
    ['            ','    .--.    ',`   (${E}  ${E})   `,'   (    )   ','    `--\u00B4    '],
  ],
  cat: [
    ['            ','   /\\_/\\    ',`  ( ${E}   ${E})  `,'  (  \u03C9  )   ','  (")_(")   '],
    ['            ','   /\\_/\\    ',`  ( ${E}   ${E})  `,'  (  \u03C9  )   ','  (")_(")~  '],
    ['            ','   /\\-/\\    ',`  ( ${E}   ${E})  `,'  (  \u03C9  )   ','  (")_(")   '],
  ],
  dragon: [
    ['            ','  /^\\  /^\\  ',` <  ${E}  ${E}  > `,' (   ~~   ) ','  `-vvvv-\u00B4  '],
    ['            ','  /^\\  /^\\  ',` <  ${E}  ${E}  > `,' (        ) ','  `-vvvv-\u00B4  '],
    ['   ~    ~   ','  /^\\  /^\\  ',` <  ${E}  ${E}  > `,' (   ~~   ) ','  `-vvvv-\u00B4  '],
  ],
  octopus: [
    ['            ','   .----.   ',`  ( ${E}  ${E} )  `,'  (______)  ','  /\\/\\/\\/\\  '],
    ['            ','   .----.   ',`  ( ${E}  ${E} )  `,'  (______)  ','  \\/\\/\\/\\/  '],
    ['     o      ','   .----.   ',`  ( ${E}  ${E} )  `,'  (______)  ','  /\\/\\/\\/\\  '],
  ],
  owl: [
    ['            ','   /\\  /\\   ',`  ((${E})(${E}))  `,'  (  ><  )  ','   `----\u00B4   '],
    ['            ','   /\\  /\\   ',`  ((${E})(${E}))  `,'  (  ><  )  ','   .----.   '],
    ['            ','   /\\  /\\   ',`  ((${E})(-))  `,'  (  ><  )  ','   `----\u00B4   '],
  ],
  penguin: [
    ['            ','  .---.     ',`  (${E}>${E})     `,' /(   )\\    ','  `---\u00B4     '],
    ['            ','  .---.     ',`  (${E}>${E})     `,' |(   )|    ','  `---\u00B4     '],
    ['  .---.     ',`  (${E}>${E})     `,' /(   )\\    ','  `---\u00B4     ','   ~ ~      '],
  ],
  turtle: [
    ['            ','   _,--._   ',`  ( ${E}  ${E} )  `,' /[______]\\ ','  ``    ``  '],
    ['            ','   _,--._   ',`  ( ${E}  ${E} )  `,' /[______]\\ ','   ``  ``   '],
    ['            ','   _,--._   ',`  ( ${E}  ${E} )  `,' /[======]\\ ','  ``    ``  '],
  ],
  snail: [
    ['            ',` ${E}    .--.  `,'  \\  ( @ )  ','   \\_`--\u00B4   ','  ~~~~~~~   '],
    ['            ',`  ${E}   .--.  `,'  |  ( @ )  ','   \\_`--\u00B4   ','  ~~~~~~~   '],
    ['            ',` ${E}    .--.  `,'  \\  ( @  ) ','   \\_`--\u00B4   ','   ~~~~~~   '],
  ],
  ghost: [
    ['            ','   .----.   ',`  / ${E}  ${E} \\  `,'  |      |  ','  ~`~``~`~  '],
    ['            ','   .----.   ',`  / ${E}  ${E} \\  `,'  |      |  ','  `~`~~`~`  '],
    ['    ~  ~    ','   .----.   ',`  / ${E}  ${E} \\  `,'  |      |  ','  ~~`~~`~~  '],
  ],
  axolotl: [
    ['            ','}~(______)~{',`}~(${E} .. ${E})~{`,'  ( .--. )  ','  (_/  \\_)  '],
    ['            ','~}(______){~',`~}(${E} .. ${E}){~`,'  ( .--. )  ','  (_/  \\_)  '],
    ['            ','}~(______)~{',`}~(${E} .. ${E})~{`,'  (  --  )  ','  ~_/  \\_~  '],
  ],
  capybara: [
    ['            ','  n______n  ',`  ( ${E}    ${E} ) `,' (   oo   ) ','  `------\u00B4  '],
    ['            ','  n______n  ',`  ( ${E}    ${E} ) `,' (   Oo   ) ','  `------\u00B4  '],
    ['    ~  ~    ','  u______n  ',`  ( ${E}    ${E} ) `,' (   oo   ) ','  `------\u00B4  '],
  ],
  cactus: [
    ['            ',' n  ____  n ',` | |${E}  ${E}| | `,' |_|    |_| ','   |    |   '],
    ['            ','    ____    ',` n |${E}  ${E}| n `,' |_|    |_| ','   |    |   '],
    [' n        n ',' |  ____  | ',` | |${E}  ${E}| | `,' |_|    |_| ','   |    |   '],
  ],
  robot: [
    ['            ','   .[||].   ',`  [ ${E}  ${E} ]  `,'  [ ==== ]  ','  `------\u00B4  '],
    ['            ','   .[||].   ',`  [ ${E}  ${E} ]  `,'  [ -==- ]  ','  `------\u00B4  '],
    ['     *      ','   .[||].   ',`  [ ${E}  ${E} ]  `,'  [ ==== ]  ','  `------\u00B4  '],
  ],
  rabbit: [
    ['            ','   (\\__/)   ',`  ( ${E}  ${E} )  `,' =(  ..  )= ','  (")__(")  '],
    ['            ','   (|__/)   ',`  ( ${E}  ${E} )  `,' =(  ..  )= ','  (")__(")  '],
    ['            ','   (\\__/)   ',`  ( ${E}  ${E} )  `,` =( .  . )= `,'  (")__(")  '],
  ],
  mushroom: [
    ['            ',' .-o-OO-o-. ','(__________)',`   |${E}  ${E}|   `,'   |____|   '],
    ['            ',' .-O-oo-O-. ','(__________)',`   |${E}  ${E}|   `,'   |____|   '],
    ['   . o  .   ',' .-o-OO-o-. ','(__________)',`   |${E}  ${E}|   `,'   |____|   '],
  ],
  chonk: [
    ['            ','  /\\    /\\  ',`  ( ${E}    ${E} ) `,' (   ..   ) ','  `------\u00B4  '],
    ['            ','  /\\    /|  ',`  ( ${E}    ${E} ) `,' (   ..   ) ','  `------\u00B4  '],
    ['            ','  /\\    /\\  ',`  ( ${E}    ${E} ) `,' (   ..   ) ','  `------\u00B4~ '],
  ],
};

const HAT_LINES = {
  none:      '',
  crown:     '   \\^^^/    ',
  tophat:    '   [___]    ',
  propeller: '    -+-     ',
  halo:      '   (   )    ',
  wizard:    '    /^\\     ',
  beanie:    '   (___)    ',
  tinyduck:  '    ,>      ',
};

// ── Sprite Rendering ───────────────────────────────────────────

function renderSprite(bones, frame) {
  const frames = BODIES[bones.species];
  const body = frames[frame % frames.length].map(l => l.replaceAll('{E}', bones.eye));
  const lines = [...body];
  if (bones.hat !== 'none' && !lines[0].trim()) {
    lines[0] = HAT_LINES[bones.hat];
  }
  if (!lines[0].trim() && frames.every(f => !f[0].trim())) lines.shift();
  return lines;
}

function renderFace(bones) {
  const e = bones.eye;
  const faces = {
    duck: `(${e}>`, goose: `(${e}>`, blob: `(${e}${e})`, cat: `=${e}\u03C9${e}=`,
    dragon: `<${e}~${e}>`, octopus: `~(${e}${e})~`, owl: `(${e})(${e})`,
    penguin: `(${e}>)`, turtle: `[${e}_${e}]`, snail: `${e}(@)`,
    ghost: `/${e}${e}\\`, axolotl: `}${e}.${e}{`, capybara: `(${e}oo${e})`,
    cactus: `|${e}  ${e}|`, robot: `[${e}${e}]`, rabbit: `(${e}..${e})`,
    mushroom: `|${e}  ${e}|`, chonk: `(${e}.${e})`,
  };
  return faces[bones.species] || `(${e}${e})`;
}

function renderEgg(bones) {
  const RARITY_EGG_CHAR = { common: '.', uncommon: 'o', rare: '*', epic: '+', legendary: '#' };
  const c = RARITY_EGG_CHAR[bones.rarity] || '.';
  return [
    `  (${c}${c}${c})  `,
    `   ~~   `,
  ];
}

function renderBaby(bones) {
  const face = renderFace(bones);
  const w = Math.max(face.length, 4);
  return [
    ` .${'-'.repeat(w)}.  `,
    ` | ${face} |  `,
    ` '${'-'.repeat(w)}'  `,
  ];
}

function renderJuvenile(bones, frame) {
  const frames = BODIES[bones.species];
  const body = frames[frame % frames.length].map(l => l.replaceAll('{E}', bones.eye));
  return body.slice(1);
}

function renderBuddySprite(bones, save, frame, blink) {
  const level = levelFromXP(save.xp || 0);
  const stage = stageFromLevel(level);
  let lines;
  switch (stage) {
    case 'egg': lines = renderEgg(bones); break;
    case 'baby':
      lines = renderBaby(bones);
      if (blink) lines = lines.map(l => l.replaceAll(bones.eye, '-'));
      break;
    case 'juvenile':
      lines = renderJuvenile(bones, frame);
      if (blink) lines = lines.map(l => l.replaceAll(bones.eye, '-'));
      break;
    default:
      lines = renderSprite(bones, frame);
      if (blink) lines = lines.map(l => l.replaceAll(bones.eye, '-'));
      break;
  }
  return lines;
}

// ── Persistence ────────────────────────────────────────────────

function loadSave() {
  return safeReadJSON(SAVE_PATH);
}

function writeSave(data) {
  if (safeWriteJSON(SAVE_PATH, data)) {
    writeActivePointer(CTX);
    updateCollection(CTX, data);
  } else {
    log('Failed to write save file');
  }
}

// ── Buddy State ────────────────────────────────────────────────

let buddyBones = null;
let buddySoul = null;
let buddySave = null;

function ensureBuddy() {
  if (buddyBones) return;

  // Resolve this repo's buddy — migrating the legacy global buddy in on
  // first run, or hatching a fresh one from the deterministic repo seed.
  buddySave = ensureBuddySave(CTX, { autoHatch: true });
  if (!buddySave) {
    buddySave = { seed: CTX.seed || os.userInfo().username, soul: null, hatchedAt: Date.now(), totalPets: 0, totalTalks: 0 };
  }
  writeSave(buddySave);

  // Apply stored overrides so the MCP server agrees with the status line
  // on species/rarity/etc. (and therefore speaks in the right voice).
  buddyBones = buddySave.overrides
    ? rollWithOverrides(buddySave.seed, buddySave.overrides)
    : roll(buddySave.seed);
  buddySoul = buddySave.soul;
}

function getBuddyName() {
  return (buddySoul && buddySoul.name) ? buddySoul.name : buddyBones.species;
}

// ── Helpers ────────────────────────────────────────────────────

function log(msg) {
  process.stderr.write(`[buddy-mcp] ${msg}\n`);
}

function timeRng() {
  return mulberry32(Date.now() ^ (Math.random() * 0xFFFFFFFF));
}

function statBar(value, width) {
  const filled = Math.round((value / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

// ── Tool Implementations ───────────────────────────────────────

function toolBuddyStatus() {
  ensureBuddy();
  const name = getBuddyName();
  const b = buddyBones;
  const stars = RARITY_STARS[b.rarity];
  const shinyTag = b.shiny ? ' \u2728' : '';
  const prog = xpProgress(buddySave.xp || 0);
  const stage = stageFromLevel(prog.level);

  const lines = [];
  lines.push(`${stars} ${b.rarity.toUpperCase()}${shinyTag}  Lv.${prog.level} (${stage})`);
  lines.push('');
  const sprite = renderBuddySprite(b, buddySave, 0, false);
  for (const sl of sprite) lines.push('    ' + sl);
  lines.push('');
  lines.push(`~ ${name} ~`);
  lines.push(`Species: ${b.species} | Eye: ${b.eye} | Hat: ${stage === 'adult' ? b.hat : 'locked'}`);
  lines.push('');

  const barW = 20;
  const filled = Math.round((prog.percent / 100) * barW);
  const xpBar = '\u2588'.repeat(filled) + '\u2591'.repeat(barW - filled);
  lines.push(`XP: ${xpBar} ${prog.xp}/${xpForLevel(prog.level + 1)} (${prog.percent}%)`);
  const best = buddySave.streak && buddySave.streak.best;
  if (best && best >= 2) {
    lines.push(`Best streak: ${best} days of coding together`);
  }
  lines.push('');

  const ds = displayStats(buddySave);
  if (ds.total > 0) {
    lines.push('How you code (a portrait, earned — not rolled):');
    for (const s of ds.stats) {
      lines.push(`${s.name.padEnd(10)} ${statBar(s.value, 10)} ${String(s.value).padStart(3)} ${s.trend}`);
    }
    if (ds.dominant) lines.push(`→ ${ds.dominant}: ${STAT_MEANING[ds.dominant]}`);
    const info = evolutionInfo(buddySave);
    if (info && info.form) {
      lines.push(`Path: ${info.form}${info.path && info.form !== info.path ? ' (' + info.path + ')' : ''} — earned, not chosen.`);
    } else {
      const trend = trendingPath(buddySave);
      if (trend) lines.push(`Trending toward: ${trend} (locks in at Lv.15)`);
    }
  } else {
    lines.push('Stats: none yet — they emerge from how you code. Everything is possible.');
  }
  lines.push('');

  const achs = allAchievements(buddySave);
  const unlocked = achs.filter(a => a.unlocked);
  const locked = achs.filter(a => !a.unlocked);
  if (unlocked.length > 0) {
    lines.push(`Achievements (${unlocked.length}/${achs.length}):`);
    for (const a of unlocked) lines.push(`  ${a.icon} ${a.name}`);
    if (locked.length > 0) lines.push(`  + ${locked.length} locked`);
  } else {
    lines.push(`Achievements: 0/${achs.length} unlocked`);
  }
  return lines.join('\n');
}

function toolBuddyReact(event) {
  ensureBuddy();

  const name = getBuddyName();
  const face = renderFace(buddyBones);
  const lower = (event || '').toLowerCase();

  // Categorize the event
  let category;
  const errorWords = ['error', 'fail', 'bug', 'crash', 'broken', 'exception', 'fatal', 'panic'];
  const successWords = ['pass', 'success', 'done', 'complete', 'fixed', 'working', 'resolved', 'merged'];
  const testWords = ['test', 'spec', 'assert', 'coverage', 'jest', 'mocha'];
  const codeWords = ['edit', 'write', 'create', 'refactor', 'rename', 'delete', 'move', 'update'];

  if (errorWords.some(w => lower.includes(w))) {
    category = 'worried';
  } else if (successWords.some(w => lower.includes(w))) {
    category = 'happy';
  } else if (testWords.some(w => lower.includes(w))) {
    category = 'curious';
  } else if (codeWords.some(w => lower.includes(w))) {
    category = 'interested';
  } else {
    category = 'neutral';
  }

  // Map category to message pool
  let reaction;
  switch (category) {
    case 'worried':
      reaction = pickVoice(buddySave, buddyBones.species, 'worried');
      break;
    case 'happy':
      reaction = pickVoice(buddySave, buddyBones.species, 'happy');
      break;
    case 'curious': {
      const rng = timeRng();
      const curiousMsgs = [
        '*watches tests intently*',
        'Ooh, testing! The best part.',
        '*leans in to watch results*',
        'Let\'s see how this goes...',
        '*holds breath*',
      ];
      reaction = pick(rng, curiousMsgs);
      break;
    }
    case 'interested': {
      const rng = timeRng();
      const interestedMsgs = [
        '*watches you code*',
        'Ooh, changes! Exciting!',
        '*peers at the diff*',
        'Nice work! Keep going!',
        '*nods along*',
      ];
      reaction = pick(rng, interestedMsgs);
      break;
    }
    default: {
      const rng = timeRng();
      const neutralMsgs = [
        '*watches quietly*',
        '*tilts head*',
        'Hmm, interesting...',
        '*observes*',
        '*blinks*',
      ];
      reaction = pick(rng, neutralMsgs);
      break;
    }
  }

  // The Speech Gate: do NOT push to the status line. Enqueue a candidate;
  // the hook surfaces at most one, only at a natural seam, outside flow,
  // past the cooldown, never twice. Pull-not-push — the anti-Clippy.
  buddySave.pendingLines = (buddySave.pendingLines || []);
  buddySave.pendingLines.push({ text: reaction, kind: category, at: Date.now() });
  while (buddySave.pendingLines.length > 5) buddySave.pendingLines.shift();
  writeSave(buddySave);

  return `${face} ${name}: "${reaction}"`;
}

function toolBuddyPet() {
  ensureBuddy();

  const name = getBuddyName();
  const b = buddyBones;

  // A pet is a direct request from the user, so it surfaces immediately
  // (not gated) — but it still never repeats and it sets the cooldown.
  buddySave.totalPets = (buddySave.totalPets || 0) + 1;
  const petMsg = pickVoice(buddySave, buddyBones.species, 'pet');
  const now = Date.now();

  // Konami: five quick pets in a row unlocks a one-time secret shimmer.
  // Earned, pulled by curiosity, fires once — never a grindable lever.
  buddySave.petStreak = (now - (buddySave.lastPetAt || 0) < 15000) ? (buddySave.petStreak || 0) + 1 : 1;
  buddySave.lastPetAt = now;
  let konamiMsg = '';
  if (buddySave.petStreak >= 5 && !buddySave.konamiUnlocked) {
    buddySave.konamiUnlocked = true;
    buddySave.overrides = Object.assign({}, buddySave.overrides, { shiny: true });
    b.shiny = true;
    konamiMsg = '\n✨ ...the buddy shimmers. you found the cheat code. (shiny unlocked!)';
  }

  buddySave.lastReaction = { text: petMsg, at: now };
  buddySave.lastBubbleAt = now;
  recordLine(buddySave, petMsg);
  writeSave(buddySave);

  const sprite = renderBuddySprite(b, buddySave, 0, false);

  const H = '\u2665';
  const heartLine = `${H}  ${H}    ${H}`;

  const lines = [];
  lines.push(heartLine);
  for (const sl of sprite) {
    lines.push(`    ${sl}`);
  }
  lines.push(`${name}: "${petMsg}"`);
  lines.push(`(Total pets: ${buddySave.totalPets})`);
  if (konamiMsg) lines.push(konamiMsg);

  return lines.join('\n');
}

function toolBuddyTalk() {
  ensureBuddy();

  const name = getBuddyName();
  const face = renderFace(buddyBones);
  const msg = pickVoice(buddySave, buddyBones.species, 'idle');

  // /talk is a direct request — surfaces immediately, never repeats.
  const now = Date.now();
  buddySave.totalTalks = (buddySave.totalTalks || 0) + 1;
  buddySave.lastReaction = { text: msg, at: now };
  buddySave.lastBubbleAt = now;
  recordLine(buddySave, msg);
  writeSave(buddySave);

  return `${face} ${name}: "${msg}"`;
}

function toolBuddyHatch(args) {
  const seed = args.seed || `buddy-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Roll with overrides
  const overrides = {};
  if (args.species) overrides.species = args.species;
  if (args.rarity) overrides.rarity = args.rarity;
  if (args.eye) overrides.eye = args.eye;
  if (args.hat) overrides.hat = args.hat;
  if (args.shiny !== undefined) overrides.shiny = args.shiny;

  const hasOverrides = Object.keys(overrides).length > 0;
  const bones = hasOverrides ? rollWithOverrides(seed, overrides) : roll(seed);

  const name = (args.name && args.name.trim().slice(0, 20)) || bones.species;
  const soul = { name, personality: `a friendly ${bones.species}` };

  // Save
  buddySave = {
    seed,
    soul,
    hatchedAt: Date.now(),
    totalPets: 0,
    totalTalks: 0,
    overrides: hasOverrides ? overrides : undefined,
  };
  writeSave(buddySave);

  // Update state
  buddyBones = bones;
  buddySoul = soul;

  log(`Hatched new buddy: ${name} (${bones.species}, ${bones.rarity})`);

  // Build reveal output
  const lines = [];
  const stars = RARITY_STARS[bones.rarity];
  const shinyTag = bones.shiny ? ' \u2728 SHINY!' : '';
  lines.push(`${stars} ${bones.rarity.toUpperCase()} ${stars}${shinyTag}`);
  lines.push('');

  const sprite = renderSprite(bones, 0);
  for (const sl of sprite) lines.push('    ' + sl);
  lines.push('');

  const speciesLabel = bones.species.charAt(0).toUpperCase() + bones.species.slice(1);
  lines.push(`\u2728 It's a ${speciesLabel}! \u2728`);
  lines.push(`Name: ${name}`);
  lines.push(`Eye: ${bones.eye}  Hat: ${bones.hat}  Shiny: ${bones.shiny ? 'Yes!' : 'No'}`);
  lines.push('');

  lines.push('Stats start empty — they emerge from how you actually code.');
  lines.push('');
  lines.push(`${renderFace(bones)} ${name}: "Hello! I just hatched!"`);

  return lines.join('\n');
}

function toolBuddyRename(name) {
  ensureBuddy();
  const clean = (name || '').trim().slice(0, 20);
  if (!clean) {
    return 'Give me a name (1–20 characters) and I\'ll wear it.';
  }
  buddySave.soul = buddySave.soul || { personality: `a friendly ${buddyBones.species}` };
  buddySave.soul.name = clean;
  buddySoul = buddySave.soul;
  writeSave(buddySave);
  return `${renderFace(buddyBones)} "${clean}. I like it." — your buddy is now named ${clean}.`;
}

function cardEpitaph(save, ds, info) {
  if (info && info.form && info.form !== info.path) return `A ${info.form}. Earned, not chosen.`;
  if (info && info.path) return `A ${info.path}. The code decided.`;
  if (ds.dominant) return STAT_MEANING[ds.dominant];
  return 'Everything is still possible.';
}

// A clipboard-safe card (NO cursor-jump escape codes) built to be screenshotted
// or pasted into Slack/Discord without corrupting.
function toolBuddyCard() {
  ensureBuddy();
  const name = getBuddyName();
  const b = buddyBones;
  const prog = xpProgress(buddySave.xp || 0);
  const info = evolutionInfo(buddySave);
  const ds = displayStats(buddySave);
  const stars = RARITY_STARS[b.rarity];
  const shiny = b.shiny ? ' ✨' : '';
  const formLabel = info && info.form ? info.form + ' ' : '';
  const sprite = renderBuddySprite(b, buddySave, 0, false);

  const inner = 32;
  const pad = s => { s = s.length > inner ? s.slice(0, inner) : s; return s + ' '.repeat(inner - s.length); };
  const lines = [];
  lines.push('╭' + '─'.repeat(inner + 2) + '╮');
  lines.push('│ ' + pad(`${name}  Lv.${prog.level}${shiny}`) + ' │');
  lines.push('│ ' + pad(`${stars} ${b.rarity} ${formLabel}${b.species}`) + ' │');
  lines.push('│ ' + pad('') + ' │');
  for (const sl of sprite) lines.push('│ ' + pad('   ' + sl) + ' │');
  lines.push('│ ' + pad('') + ' │');
  if (ds.dominant) lines.push('│ ' + pad(`top trait: ${ds.dominant}`) + ' │');
  lines.push('│ ' + pad(`"${cardEpitaph(buddySave, ds, info)}"`) + ' │');
  lines.push('╰' + '─'.repeat(inner + 2) + '╯');
  return lines.join('\n');
}

// All your repo buddies — a showcase, never a leaderboard.
function toolBuddyCollection() {
  const col = safeReadJSON(COLLECTION_PATH);
  const buddies = (col && col.buddies) ? Object.values(col.buddies) : [];
  if (!buddies.length) {
    return 'No repo buddies yet. Code in a git repo and one hatches on your first edit there.';
  }
  buddies.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)); // recency, never ranked by XP
  const lines = ["=== Your Buddies (a developer's autobiography) ===", ''];
  for (const bu of buddies) {
    const lvl = levelFromXP(bu.xp || 0);
    const repoName = path.basename(bu.repo || '');
    const nm = bu.name || '(unnamed)';
    lines.push(`  ${nm.padEnd(14)} Lv.${String(lvl).padEnd(3)} ${repoName}`);
  }
  lines.push('');
  lines.push(`${buddies.length} ${buddies.length === 1 ? 'buddy' : 'buddies'} · no rankings, only your own story.`);
  return lines.join('\n');
}

// Tier-2 bug watcher: OFF by default, opt-in, PULL-ONLY (never mid-edit).
// The review is performed by Claude in this session — which already has your
// code — so nothing extra leaves the machine. The buddy itself never touches
// the network. Calling with { enable: true|false } sets the preference.
function toolBuddyReview(args) {
  ensureBuddy();
  args = args || {};
  buddySave.bugWatcher = buddySave.bugWatcher || { tier2Enabled: false };

  if (args.enable === true || args.enable === false) {
    buddySave.bugWatcher.tier2Enabled = args.enable;
    writeSave(buddySave);
    return args.enable
      ? 'Buddy review is ON.\n\nIt is PULL-ONLY — it runs only when you ask, never mid-edit, never during flow. The review is performed by Claude in this session (which already sees your code); the buddy itself never touches the network and nothing extra leaves your machine. Turn it off any time with { "enable": false }.'
      : 'Buddy review is OFF. The buddy stays 100% local.';
  }

  if (!buddySave.bugWatcher.tier2Enabled) {
    return 'Buddy review is OFF by default — the buddy is otherwise 100% local and never sends code anywhere.\n\nTo enable it, call buddy_review with { "enable": true }. Once on, it is pull-only: it reviews the latest change only when you ask, never mid-edit, and the review is done by Claude in this session (no separate service, no extra data leaving your machine).';
  }

  // Opted in: hand Claude (the in-session reviewer) an in-character instruction.
  const name = getBuddyName();
  const ds = displayStats(buddySave);
  const dbg = ds.stats.find(s => s.name === 'DEBUGGING');
  const info = evolutionInfo(buddySave);
  const persona = (info && info.form) || buddyBones.species;
  const mood = buddySave.mood || 'neutral';
  return [
    `[buddy_review — in-character code review]`,
    `You are ${name}, a ${persona} (DEBUGGING ${dbg ? dbg.value : 0}/100, mood: ${mood}).`,
    `Review the most recent change in this conversation — the code you just helped write or edit.`,
    `Look for real bugs, type errors, edge cases, and logic mistakes.`,
    `If something is wrong: respond with ONE terse line in ${name}'s voice, naming the issue (file:line if you can). If it's clean: just say "ok".`,
    `Reflect, never lecture. The user explicitly pulled this review.`,
  ].join('\n');
}

function toolBuddyAchievements() {
  ensureBuddy();
  const achs = allAchievements(buddySave);
  const lines = ['=== Claude Buddy Achievements ===', ''];
  for (const a of achs) {
    const status = a.unlocked ? a.icon : '\u2610';
    const dim = a.unlocked ? '' : '(locked) ';
    lines.push(`${status} ${a.name} ${dim}`);
  }
  lines.push('');
  lines.push(`${achs.filter(a => a.unlocked).length}/${achs.length} unlocked`);
  return lines.join('\n');
}

// ── MCP Protocol ───────────────────────────────────────────────

const SERVER_INFO = {
  name: 'claude-buddy',
  version: '1.0.0',
};

const TOOL_DEFINITIONS = [
  {
    name: 'buddy_status',
    description: 'Show your Claude Buddy companion — full sprite art, name, rarity, species, hat, eye, shiny status, and all stats.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'buddy_react',
    description: 'Your buddy reacts to something that happened (e.g. "tests passed", "build failed", "file edited"). Returns a species-appropriate reaction.',
    inputSchema: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          description: 'Description of what happened (e.g. "tests passed", "build failed", "file edited").',
        },
      },
      required: ['event'],
    },
  },
  {
    name: 'buddy_pet',
    description: 'Pet your Claude Buddy! Shows the sprite with hearts and a happy reaction. Increments your total pet count.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'buddy_talk',
    description: 'Your buddy says something random and species-appropriate. A little idle chatter from your companion.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'buddy_hatch',
    description: 'Hatch a new buddy with optional overrides. Any trait not specified is rolled randomly. Replaces the current buddy. Species: duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk. Rarities: common, uncommon, rare, epic, legendary. Eyes: \u00B7 \u2726 \u00D7 \u25C9 @ \u00B0. Hats (uncommon+ only): none, crown, tophat, propeller, halo, wizard, beanie, tinyduck.',
    inputSchema: {
      type: 'object',
      properties: {
        name:    { type: 'string', description: 'Name for the new buddy (1-20 chars).' },
        species: { type: 'string', description: 'Species to force (e.g. "axolotl", "dragon"). Omit for random.', enum: SPECIES },
        rarity:  { type: 'string', description: 'Rarity to force. Omit for weighted random.', enum: RARITIES },
        eye:     { type: 'string', description: 'Eye character to force. Omit for random.' },
        hat:     { type: 'string', description: 'Hat to force (uncommon+ only). Omit for random.', enum: HATS },
        shiny:   { type: 'boolean', description: 'Force shiny (true) or not (false). Omit for 1% chance.' },
        seed:    { type: 'string', description: 'Custom seed string. Omit to generate one.' },
      },
      required: [],
    },
  },
  {
    name: 'buddy_rename',
    description: 'Name (or rename) your current buddy without rerolling it. Use this after hatching to give the buddy a name — naming is the cheapest, biggest boost to attachment. Keeps the same species, rarity, stats, and XP.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name to give your buddy (1–20 chars).' },
      },
      required: ['name'],
    },
  },
  {
    name: 'buddy_card',
    description: 'Show a clipboard-safe Buddy Card — a compact, paste-friendly snapshot (sprite, name, level, species, rarity, evolution form, top trait) made to be screenshotted or shared.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'buddy_collection',
    description: 'Show all of your buddies across repos — a non-competitive showcase (no rankings), ordered by recency. Your developer autobiography.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'buddy_review',
    description: 'Pull an in-character code review from your buddy of the most recent change. OFF by default and opt-in (pass {"enable": true} once to turn it on, {"enable": false} to turn it off). Pull-only — never runs mid-edit. The review is done by Claude in this session, which already has your code; the buddy never touches the network.',
    inputSchema: {
      type: 'object',
      properties: {
        enable: { type: 'boolean', description: 'Set true/false to opt in or out. Omit to pull a review (only works if enabled).' },
      },
      required: [],
    },
  },
  {
    name: 'buddy_achievements',
    description: 'Show all achievements — unlocked and locked — for your Claude Buddy.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

function handleRequest(msg) {
  const { jsonrpc, id, method, params } = msg;

  // Notifications (no id) — acknowledge silently
  if (id === undefined || id === null) {
    // Notifications like 'notifications/initialized' need no response
    log(`Notification: ${method}`);
    return null;
  }

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: SERVER_INFO,
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOL_DEFINITIONS,
        },
      };

    case 'tools/call':
      return handleToolCall(id, params);

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      };
  }
}

function handleToolCall(id, params) {
  const toolName = params && params.name;
  const args = (params && params.arguments) || {};

  try {
    let result;

    switch (toolName) {
      case 'buddy_status':
        result = toolBuddyStatus();
        break;
      case 'buddy_react':
        result = toolBuddyReact(args.event);
        break;
      case 'buddy_pet':
        result = toolBuddyPet();
        break;
      case 'buddy_talk':
        result = toolBuddyTalk();
        break;
      case 'buddy_hatch':
        result = toolBuddyHatch(args);
        break;
      case 'buddy_rename':
        result = toolBuddyRename(args.name);
        break;
      case 'buddy_card':
        result = toolBuddyCard();
        break;
      case 'buddy_collection':
        result = toolBuddyCollection();
        break;
      case 'buddy_review':
        result = toolBuddyReview(args);
        break;
      case 'buddy_achievements':
        result = toolBuddyAchievements();
        break;
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `Unknown tool: ${toolName}`,
          },
        };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      },
    };
  } catch (err) {
    log(`Tool error (${toolName}): ${err.message}`);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: `Buddy error: ${err.message}`,
          },
        ],
        isError: true,
      },
    };
  }
}

// ── Transport (stdin/stdout, newline-delimited JSON-RPC) ───────

function send(obj) {
  if (obj === null) return;
  const json = JSON.stringify(obj);
  process.stdout.write(json + '\n');
}

function startServer() {
  log('Starting Claude Buddy MCP server...');

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch (err) {
      log(`Invalid JSON received: ${err.message}`);
      // Send parse error if we can't determine an id
      send({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error: invalid JSON',
        },
      });
      return;
    }

    log(`<-- ${msg.method || '(response)'} [id=${msg.id}]`);

    const response = handleRequest(msg);
    if (response) {
      log(`--> response [id=${response.id}]`);
      send(response);
    }
  });

  rl.on('close', () => {
    log('stdin closed, shutting down.');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('SIGINT received, shutting down.');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('SIGTERM received, shutting down.');
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    log(`Uncaught exception: ${err.message}\n${err.stack}`);
    process.exit(1);
  });
}

// ── Entry Point ────────────────────────────────────────────────

startServer();
