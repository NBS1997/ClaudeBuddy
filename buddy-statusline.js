#!/usr/bin/env node
'use strict';

// ══════════════════════════════════════════════════════════════
//  Claude Buddy Status Line
//  Renders the buddy sprite in Claude Code's persistent status
//  line. Designed to be fast (<50ms) since it runs every tick.
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');

const { levelFromXP, xpProgress, stageFromLevel, evolutionLine, displayStats } = require('./buddy-progression.js');
const { readActiveSavePath, safeReadJSON } = require('./buddy-paths.js');
const SALT = 'friend-2026-401';

// ── Minimal PRNG (same as companion.ts) ─────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// ── Constants ───────────────────────────────────────────────

const RARITIES = ['common','uncommon','rare','epic','legendary'];
const RARITY_WEIGHTS = { common:60, uncommon:25, rare:10, epic:4, legendary:1 };
const RARITY_STARS = { common:'\u2605', uncommon:'\u2605\u2605', rare:'\u2605\u2605\u2605', epic:'\u2605\u2605\u2605\u2605', legendary:'\u2605\u2605\u2605\u2605\u2605' };
const RARITY_FLOOR = { common:5, uncommon:15, rare:25, epic:35, legendary:50 };
const SPECIES = ['duck','goose','blob','cat','dragon','octopus','owl','penguin','turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk'];
const EYES = ['\u00B7','\u2726','\u00D7','\u25C9','@','\u00B0'];
const HATS = ['none','crown','tophat','propeller','halo','wizard','beanie','tinyduck'];
const STAT_NAMES = ['DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK'];
const IDLE_SEQ = [0,0,0,0,1,0,0,0,-1,0,0,2,0,0,0];

const IDLE_MSGS = {
  duck:['*preens*','Quack!','*waddles*'],
  goose:['HONK!','*menacing*','*steals ;*'],
  blob:['*jiggles*','Bloop!','*wobbles*'],
  cat:['*purrs*','Mrow.','*judges*'],
  dragon:['*tiny roar*','Rawr!','*warm*'],
  octopus:['*waves*','Blub!','*ink*'],
  owl:['Hoo!','*wise nod*','*rotates*'],
  penguin:['Noot!','*slides*','*waddles*'],
  turtle:['*slow blink*','...here.','Steady.'],
  snail:['*trail*','~~~~~','...almost'],
  ghost:['Boo~','*floats*','*phases*'],
  axolotl:['*gill wiggle*','Blep!','*smiles*'],
  capybara:['*vibes*','*chill*','...'],
  cactus:['*grows*','Prickly!','*sun*'],
  robot:['BEEP','01101000','*whirs*'],
  rabbit:['*twitch*','Hop!','*flop*'],
  mushroom:['*spore*','*grows*','Fungi!'],
  chonk:['*sits*','*large*','...chonk'],
};

// ── Roll (same deterministic logic) ─────────────────────────

function rollRarity(rng) {
  const total = Object.values(RARITY_WEIGHTS).reduce((a,b)=>a+b,0);
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
  for (const n of STAT_NAMES) {
    if (n === peak) stats[n] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    else if (n === dump) stats[n] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    else stats[n] = floor + Math.floor(rng() * 40);
  }
  return stats;
}
function roll(seed) {
  const rng = mulberry32(hashString(seed + SALT));
  const rarity = rollRarity(rng);
  return {
    rarity, species: pick(rng, SPECIES), eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01, stats: rollStats(rng, rarity),
  };
}

// ── Sprite Art (same as sprites.ts) ─────────────────────────

const E = '{E}';
const BODIES = {
  duck:[[`            `,`    __      `,`  <(${E} )___  `,`   (  ._>   `,`    \`--\u00B4    `],[`            `,`    __      `,`  <(${E} )___  `,`   (  ._>   `,`    \`--\u00B4~   `],[`            `,`    __      `,`  <(${E} )___  `,`   (  .__>  `,`    \`--\u00B4    `]],
  goose:[[`            `,`     (${E}>    `,`     ||     `,`   _(__)_   `,`    ^^^^    `],[`            `,`    (${E}>     `,`     ||     `,`   _(__)_   `,`    ^^^^    `],[`            `,`     (${E}>>   `,`     ||     `,`   _(__)_   `,`    ^^^^    `]],
  blob:[[`            `,`   .----.   `,`  ( ${E}  ${E} )  `,`  (      )  `,`   \`----\u00B4   `],[`            `,`  .------.  `,`  ( ${E}  ${E}  ) `,` (        ) `,`  \`------\u00B4  `],[`            `,`    .--.    `,`   (${E}  ${E})   `,`   (    )   `,`    \`--\u00B4    `]],
  cat:[[`            `,`   /\\_/\\    `,`  ( ${E}   ${E})  `,`  (  \u03C9  )   `,`  (")_(")   `],[`            `,`   /\\_/\\    `,`  ( ${E}   ${E})  `,`  (  \u03C9  )   `,`  (")_(")~  `],[`            `,`   /\\-/\\    `,`  ( ${E}   ${E})  `,`  (  \u03C9  )   `,`  (")_(")   `]],
  dragon:[[`            `,`  /^\\  /^\\  `,` <  ${E}  ${E}  > `,` (   ~~   ) `,`  \`-vvvv-\u00B4  `],[`            `,`  /^\\  /^\\  `,` <  ${E}  ${E}  > `,` (        ) `,`  \`-vvvv-\u00B4  `],[`   ~    ~   `,`  /^\\  /^\\  `,` <  ${E}  ${E}  > `,` (   ~~   ) `,`  \`-vvvv-\u00B4  `]],
  octopus:[[`            `,`   .----.   `,`  ( ${E}  ${E} )  `,`  (______)  `,`  /\\/\\/\\/\\  `],[`            `,`   .----.   `,`  ( ${E}  ${E} )  `,`  (______)  `,`  \\/\\/\\/\\/  `],[`     o      `,`   .----.   `,`  ( ${E}  ${E} )  `,`  (______)  `,`  /\\/\\/\\/\\  `]],
  owl:[[`            `,`   /\\  /\\   `,`  ((${E})(${E}))  `,`  (  ><  )  `,`   \`----\u00B4   `],[`            `,`   /\\  /\\   `,`  ((${E})(${E}))  `,`  (  ><  )  `,`   .----.   `],[`            `,`   /\\  /\\   `,`  ((${E})(-))  `,`  (  ><  )  `,`   \`----\u00B4   `]],
  penguin:[[`            `,`  .---.     `,`  (${E}>${E})     `,` /(   )\\    `,`  \`---\u00B4     `],[`            `,`  .---.     `,`  (${E}>${E})     `,` |(   )|    `,`  \`---\u00B4     `],[`  .---.     `,`  (${E}>${E})     `,` /(   )\\    `,`  \`---\u00B4     `,`   ~ ~      `]],
  turtle:[[`            `,`   _,--._   `,`  ( ${E}  ${E} )  `,` /[______]\\ `,`  \`\`    \`\`  `],[`            `,`   _,--._   `,`  ( ${E}  ${E} )  `,` /[______]\\ `,`   \`\`  \`\`   `],[`            `,`   _,--._   `,`  ( ${E}  ${E} )  `,` /[======]\\ `,`  \`\`    \`\`  `]],
  snail:[[`            `,` ${E}    .--.  `,`  \\  ( @ )  `,`   \\_\`--\u00B4   `,`  ~~~~~~~   `],[`            `,`  ${E}   .--.  `,`  |  ( @ )  `,`   \\_\`--\u00B4   `,`  ~~~~~~~   `],[`            `,` ${E}    .--.  `,`  \\  ( @  ) `,`   \\_\`--\u00B4   `,`   ~~~~~~   `]],
  ghost:[[`            `,`   .----.   `,`  / ${E}  ${E} \\  `,`  |      |  `,`  ~\`~\`\`~\`~  `],[`            `,`   .----.   `,`  / ${E}  ${E} \\  `,`  |      |  `,`  \`~\`~~\`~\`  `],[`    ~  ~    `,`   .----.   `,`  / ${E}  ${E} \\  `,`  |      |  `,`  ~~\`~~\`~~  `]],
  axolotl:[[`            `,'}~(______)~{',`}~(${E} .. ${E})~{`,`  ( .--. )  `,`  (_/  \\_)  `],[`            `,'~}(______){~',`~}(${E} .. ${E}){~`,`  ( .--. )  `,`  (_/  \\_)  `],[`            `,'}~(______)~{',`}~(${E} .. ${E})~{`,`  (  --  )  `,`  ~_/  \\_~  `]],
  capybara:[[`            `,`  n______n  `,`  ( ${E}    ${E} ) `,` (   oo   ) `,`  \`------\u00B4  `],[`            `,`  n______n  `,`  ( ${E}    ${E} ) `,` (   Oo   ) `,`  \`------\u00B4  `],[`    ~  ~    `,`  u______n  `,`  ( ${E}    ${E} ) `,` (   oo   ) `,`  \`------\u00B4  `]],
  cactus:[[`            `,` n  ____  n `,` | |${E}  ${E}| | `,` |_|    |_| `,`   |    |   `],[`            `,`    ____    `,` n |${E}  ${E}| n `,` |_|    |_| `,`   |    |   `],[` n        n `,` |  ____  | `,` | |${E}  ${E}| | `,` |_|    |_| `,`   |    |   `]],
  robot:[[`            `,`   .[||].   `,`  [ ${E}  ${E} ]  `,`  [ ==== ]  `,`  \`------\u00B4  `],[`            `,`   .[||].   `,`  [ ${E}  ${E} ]  `,`  [ -==- ]  `,`  \`------\u00B4  `],[`     *      `,`   .[||].   `,`  [ ${E}  ${E} ]  `,`  [ ==== ]  `,`  \`------\u00B4  `]],
  rabbit:[[`            `,`   (\\__/)   `,`  ( ${E}  ${E} )  `,` =(  ..  )= `,`  (")__(")  `],[`            `,`   (|__/)   `,`  ( ${E}  ${E} )  `,` =(  ..  )= `,`  (")__(")  `],[`            `,`   (\\__/)   `,`  ( ${E}  ${E} )  `,` =( .  . )= `,`  (")__(")  `]],
  mushroom:[[`            `,` .-o-OO-o-. `,`(__________)`,`   |${E}  ${E}|   `,`   |____|   `],[`            `,` .-O-oo-O-. `,`(__________)`,`   |${E}  ${E}|   `,`   |____|   `],[`   . o  .   `,` .-o-OO-o-. `,`(__________)`,`   |${E}  ${E}|   `,`   |____|   `]],
  chonk:[[`            `,`  /\\    /\\  `,`  ( ${E}    ${E} ) `,` (   ..   ) `,`  \`------\u00B4  `],[`            `,`  /\\    /|  `,`  ( ${E}    ${E} ) `,` (   ..   ) `,`  \`------\u00B4  `],[`            `,`  /\\    /\\  `,`  ( ${E}    ${E} ) `,` (   ..   ) `,`  \`------\u00B4~ `]],
};

const HAT_LINES = {
  none:'', crown:'   \\^^^/    ', tophat:'   [___]    ',
  propeller:'    -+-     ', halo:'   (   )    ',
  wizard:'    /^\\     ', beanie:'   (___)    ', tinyduck:'    ,>      ',
};

function renderSprite(bones, frame) {
  const frames = BODIES[bones.species];
  const body = frames[frame % frames.length].map(l => l.replaceAll('{E}', bones.eye));
  const lines = [...body];
  if (bones.hat !== 'none' && !lines[0].trim()) lines[0] = HAT_LINES[bones.hat];
  if (!lines[0].trim() && frames.every(f => !f[0].trim())) lines.shift();
  return lines;
}

function renderFace(bones) {
  const e = bones.eye;
  const f = { duck:`(${e}>`, goose:`(${e}>`, blob:`(${e}${e})`, cat:`=${e}\u03C9${e}=`,
    dragon:`<${e}~${e}>`, octopus:`~(${e}${e})~`, owl:`(${e})(${e})`,
    penguin:`(${e}>)`, turtle:`[${e}_${e}]`, snail:`${e}(@)`,
    ghost:`/${e}${e}\\`, axolotl:`}${e}.${e}{`, capybara:`(${e}oo${e})`,
    cactus:`|${e}  ${e}|`, robot:`[${e}${e}]`, rabbit:`(${e}..${e})`,
    mushroom:`|${e}  ${e}|`, chonk:`(${e}.${e})` };
  return f[bones.species] || `(${e}${e})`;
}

function renderEgg(bones) {
  const RARITY_EGG_CHAR = { common: '.', uncommon: 'o', rare: '*', epic: '+', legendary: '#' };
  const c = RARITY_EGG_CHAR[bones.rarity] || '.';
  return [`  (${c}${c}${c})  `, `   ~~   `];
}

function renderBaby(bones) {
  const face = renderFace(bones);
  const w = Math.max(face.length, 4);
  return [` .${'-'.repeat(w)}.  `, ` | ${face} |  `, ` '${'-'.repeat(w)}'  `];
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

// ── Main ────────────────────────────────────────────────────

const SAVE_PATH = readActiveSavePath();
const save = SAVE_PATH ? safeReadJSON(SAVE_PATH) : null;
if (!save) { /* no buddy yet */ process.stdout.write('\u2726 type "hatch me a buddy" to get started'); process.exit(0); }

const bones = roll(save.seed);
// Apply any stored overrides
if (save.overrides) {
  if (save.overrides.species && SPECIES.includes(save.overrides.species)) bones.species = save.overrides.species;
  if (save.overrides.rarity && RARITIES.includes(save.overrides.rarity)) {
    bones.rarity = save.overrides.rarity;
    bones.stats = rollStats(mulberry32(hashString(save.seed + save.overrides.rarity)), save.overrides.rarity);
    if (save.overrides.rarity === 'common') bones.hat = 'none';
  }
  if (save.overrides.eye && EYES.includes(save.overrides.eye)) bones.eye = save.overrides.eye;
  if (save.overrides.hat && HATS.includes(save.overrides.hat) && bones.rarity !== 'common') bones.hat = save.overrides.hat;
  if (save.overrides.shiny === true || save.overrides.shiny === false) bones.shiny = save.overrides.shiny;
}

const name = (save.soul && save.soul.name) ? save.soul.name : bones.species;

// ── Animation (same idle sequence as original CompanionSprite.tsx) ──
const tick = Math.floor(Date.now() / 500);
const step = IDLE_SEQ[tick % IDLE_SEQ.length];
let frame, blink = false;
if (step === -1) { frame = 0; blink = true; }
else { frame = step % BODIES[bones.species].length; }

let sprite = renderBuddySprite(bones, save, frame, blink);

// ── Speech bubble (from MCP reactions, fades after 10s like original) ──
const BUBBLE_TTL = 10000; // 10s matches original BUBBLE_SHOW * TICK_MS
let reaction = null;
let reactionFading = false;
if (save.lastReaction && save.lastReaction.text) {
  const age = Date.now() - save.lastReaction.at;
  if (age < BUBBLE_TTL) {
    reaction = save.lastReaction.text;
    reactionFading = age > BUBBLE_TTL - 3000; // fade in last 3s
  }
}

// ── Rarity color ──
const RARITY_C = {
  common:'\x1b[38;5;248m', uncommon:'\x1b[38;5;78m', rare:'\x1b[38;5;69m',
  epic:'\x1b[38;5;135m', legendary:'\x1b[38;5;220m',
};
const rc = RARITY_C[bones.rarity] || RARITY_C.common;
const RST = '\x1b[0m';
const DIM = '\x1b[2m';
const ITAL = '\x1b[3m';

// ── Evolution Ceremony ─────────────────────────────────────────
// The hook writes save.lastEvolution on every stage transition. For
// ~15s after, the buddy's growth gets a moment instead of silently
// swapping sprites — the climactic payoff the progression earns.
const CEREMONY_TTL = 15000;
if (save.lastEvolution && save.lastEvolution.to && Date.now() - save.lastEvolution.at < CEREMONY_TTL) {
  const toStage = String(save.lastEvolution.to);
  const stageLabel = toStage.toUpperCase();
  const article = /^[AEIOU]/.test(stageLabel) ? 'an' : 'a';
  const lore = evolutionLine(bones.species, toStage);
  const evoSprite = renderBuddySprite(bones, save, 0, false);
  const content = [
    '  ✦ EVOLUTION ✦',
    '',
    ...evoSprite.map(l => '  ' + l),
    '',
    `  ${name} is now ${article} ${stageLabel}.`,
    `  "${lore}"`,
    '  Your work shaped this.',
  ];
  const innerW = Math.min(46, Math.max(12, ...content.map(l => l.length)));
  const card = [`${rc}╭${'─'.repeat(innerW + 2)}╮${RST}`];
  for (const l of content) {
    const line = l.length > innerW ? l.slice(0, innerW) : l;
    card.push(`${rc}│${RST} ${line}${' '.repeat(innerW - line.length)} ${rc}│${RST}`);
  }
  card.push(`${rc}╰${'─'.repeat(innerW + 2)}╯${RST}`);
  process.stdout.write(card.join('\n'));
  process.exit(0);
}

// ── Layout: match original CompanionSprite.tsx ──
// Original layout: sprite column right-aligned, name centered below,
// speech bubble to the LEFT with ─ tail when speaking.
// Status line adaptation: sprite right, name + rarity below, bubble left.

const cols = process.stdout.columns
  || process.stderr.columns
  || parseInt(process.env.COLUMNS, 10)
  || 80;

const spriteW = Math.max(...sprite.map(l => l.length));
const spriteCol = Math.max(30, cols - spriteW - 1);
const jump = `\x1b[${spriteCol + 1}G`;

// Build speech bubble lines (if reaction exists)
let bubbleLines = [];
if (reaction) {
  const maxBubW = Math.min(32, spriteCol - 4);
  const wrapped = [];
  const words = reaction.split(' ');
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > maxBubW - 4 && cur) { wrapped.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) wrapped.push(cur);
  const innerW = Math.max(...wrapped.map(l => l.length));
  const boxW = innerW + 4;
  const fc = reactionFading ? DIM + '\x1b[38;5;242m' : rc;
  bubbleLines.push(`${fc}\u256D${'\u2500'.repeat(boxW - 2)}\u256E${RST}`);
  for (const wl of wrapped) {
    bubbleLines.push(`${fc}\u2502${RST} ${ITAL}${wl}${' '.repeat(innerW - wl.length)}${RST} ${fc}\u2502${RST}`);
  }
  bubbleLines.push(`${fc}\u2570${'\u2500'.repeat(boxW - 2)}\u256F\u2500${RST}`);
}

// Compose output lines
const out = [];

// Bubble lines (above sprite, left-aligned)
for (const bl of bubbleLines) {
  out.push(bl);
}

// Sprite lines (right-aligned via cursor jump)
for (const sl of sprite) {
  out.push(`${jump}${rc}${sl}${RST}`);
}

// Name row: centered under sprite
const nameW = name.length;
const namePad = Math.max(0, spriteCol + Math.floor((spriteW - nameW) / 2));
const prog = xpProgress(save.xp || 0);
const stage = stageFromLevel(prog.level);
const levelTag = prog.level > 0 ? ` Lv.${prog.level}` : '';
const bestStreak = (save.streak && save.streak.best) || 0;
const streakTag = bestStreak >= 3 ? ` ·${bestStreak}d` : '';
out.push(`\x1b[${namePad + 1}G${DIM}${ITAL}${rc}${name}${levelTag}${streakTag}${RST}`);

// Always-on emergent stat strip: a compact, glanceable portrait of how
// you code (the dominant trait highlighted). Hidden until stats exist.
const ds = displayStats(save);
if (ds.total > 0) {
  const ABBR = { DEBUGGING: 'DBG', PATIENCE: 'PAT', CHAOS: 'CHA', WISDOM: 'WIS', SNARK: 'SNK' };
  const cells = 4;
  const plainLen = ds.stats.length * (3 + cells) + (ds.stats.length - 1);
  const stripCol = Math.max(1, cols - plainLen);
  const parts = ds.stats.map(s => {
    const filled = Math.max(0, Math.min(cells, Math.round((s.value / 100) * cells)));
    const bar = '▰'.repeat(filled) + '▱'.repeat(cells - filled);
    const tint = s.name === ds.dominant ? rc : DIM;
    return `${tint}${ABBR[s.name]}${bar}${RST}`;
  });
  out.push(`\x1b[${stripCol}G${parts.join(' ')}`);
}

if (save.lastLevelUp && Date.now() - save.lastLevelUp.at < 10000) {
  out.push(`\x1b[${namePad + 1}G${rc}\x1b[1m\u2B06 Level ${save.lastLevelUp.level}!${RST}`);
}
if (save.lastAchievement && Date.now() - save.lastAchievement.at < 10000) {
  out.push(`\x1b[${namePad + 1}G\x1b[38;5;220m\x1b[1m${save.lastAchievement.icon} ${save.lastAchievement.name}!${RST}`);
}

process.stdout.write(out.join('\n'));
