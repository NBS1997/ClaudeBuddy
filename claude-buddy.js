#!/usr/bin/env node
'use strict';

// ══════════════════════════════════════════════════════════════
//  Claude Buddy — Faithful recreation of the /buddy companion
//  from Claude Code v2.1.96 (April 2026)
//  Run: node claude-buddy.js [--seed <value>] [--reroll]
// ══════════════════════════════════════════════════════════════

const { stdout, stdin } = process;
const path = require('path');
const os = require('os');
const fs = require('fs');

// ── ANSI ────────────────────────────────────────────────────

const ESC = '\x1b[';
const A = {
  reset:     `${ESC}0m`,
  bold:      `${ESC}1m`,
  dim:       `${ESC}2m`,
  italic:    `${ESC}3m`,
  inverse:   `${ESC}7m`,
  white:     `${ESC}97m`,
  gray:      `${ESC}38;5;242m`,
  dimGray:   `${ESC}38;5;238m`,
  hide:      `${ESC}?25l`,
  show:      `${ESC}?25h`,
  clear:     `${ESC}2J`,
  home:      `${ESC}H`,
  alt:       `${ESC}?1049h`,
  main:      `${ESC}?1049l`,
  syncOn:    `${ESC}?2026h`,
  syncOff:   `${ESC}?2026l`,
};
const RARITY_ANSI = {
  common:    `${ESC}38;5;248m`,  // gray
  uncommon:  `${ESC}38;5;78m`,   // green
  rare:      `${ESC}38;5;69m`,   // blue
  epic:      `${ESC}38;5;135m`,  // purple
  legendary: `${ESC}38;5;220m`,  // gold
};
function moveTo(x, y) { return `${ESC}${y + 1};${x + 1}H`; }

// ── Types & Constants (ported from types.ts) ────────────────

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

// ── PRNG & Hashing (ported from companion.ts) ──────────────

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
  const key = seed + 'friend-2026-401';
  return rollFrom(mulberry32(hashString(key)));
}

// ── Sprite Art (ported from sprites.ts — exact originals) ───

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

// ── Sprite Rendering (ported from sprites.ts) ───────────────

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

// Animation sequence from CompanionSprite.tsx
const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
const TICK_MS = 500;

// Hearts for petting (from CompanionSprite.tsx)
const H = '\u2665';
const PET_HEARTS = [
  `   ${H}    ${H}   `, `  ${H}  ${H}   ${H}  `, ` ${H}   ${H}  ${H}   `,
  `${H}  ${H}      ${H} `, '\u00B7    \u00B7   \u00B7  ',
];

// ── Persistence ─────────────────────────────────────────────

const {
  resolveContext, ensureBuddySave, safeWriteJSON,
  writeActivePointer, updateCollection, ensureGitignore,
} = require('./buddy-paths.js');

const CTX = resolveContext(process.cwd());
const SAVE_PATH = CTX.savePath;

function loadSave() {
  // Adopt the migrated global buddy if one exists; otherwise null so
  // setup() hatches a fresh repo buddy. autoHatch:false keeps a bare
  // `node claude-buddy.js` in a throwaway dir from leaving a buddy behind.
  return ensureBuddySave(CTX, { autoHatch: false });
}

function writeSave(data) {
  if (safeWriteJSON(SAVE_PATH, data)) {
    if (CTX.gitRoot) ensureGitignore(CTX.gitRoot);
    writeActivePointer(CTX);
    updateCollection(CTX, data);
  }
}

// ── Messages ────────────────────────────────────────────────

const SPECIES_MESSAGES = {
  duck:     { idle: ['*preens*','Quack!','*waddles*','Got any bread?'], pet: ['Quaaack!','*happy wiggles*'] },
  goose:    { idle: ['HONK!','Peace was never an option.','*menacing waddle*','*steals semicolon*'], pet: ['...acceptable.','*tolerates it*'] },
  blob:     { idle: ['*jiggles*','*wobbles contentedly*','Bloop!','*shapeshifts*'], pet: ['*happy squish*','Blooooop!'] },
  cat:      { idle: ['*purrs*','*knocks cursor off screen*','Mrow.','*judges your code*'], pet: ['*purrs louder*','I\'ll allow it.'] },
  dragon:   { idle: ['*tiny roar*','My hoard of semicolons!','*breathes warmth*','Rawr!'], pet: ['*nuzzles*','*warm scales*'] },
  octopus:  { idle: ['*waves tentacle*','*inks nervously*','Blub!','*juggles brackets*'], pet: ['*hugs with 8 arms*','Blublub!'] },
  owl:      { idle: ['Hoo!','*wise nod*','*rotates head*','Fascinating code...'], pet: ['*contented hoot*','*fluffs feathers*'] },
  penguin:  { idle: ['*slides on belly*','Noot noot!','*waddles*','Brr!'], pet: ['*happy feet*','Noot!!'] },
  turtle:   { idle: ['*slow blink*','...still here.','*retreats into shell*','Steady wins.'], pet: ['*peeks out*','*warm shell*'] },
  snail:    { idle: ['*leaves trail*','...almost...there...','*slow wave*','~~~~~'], pet: ['*happy antenna wiggle*','Slow and loved!'] },
  ghost:    { idle: ['Boo~','*phases through code*','*spooky float*','Ethereal...'], pet: ['*blushes through*','Ghooost hug!'] },
  axolotl:  { idle: ['*gill wiggle*','*regenerates typo*','Blep!','*smiles permanently*'], pet: ['*wiggles gills*','Blep blep!'] },
  capybara: { idle: ['*vibes*','*exists peacefully*','...','*chill*'], pet: ['*maximum chill*','*closes eyes*'] },
  cactus:   { idle: ['*photosynthesizes*','Don\'t touch— oh wait.','*grows 0.01mm*','Prickly!'], pet: ['Ouch! ...jk, thanks!','*blooms tiny flower*'] },
  robot:    { idle: ['BEEP BOOP','01101000 01101001','*whirs*','Processing...'], pet: ['AFFECTION RECEIVED','*happy beeping*'] },
  rabbit:   { idle: ['*nose twitch*','*thumps foot*','*ear flop*','Hop!'], pet: ['*binkies!*','*soft fur*'] },
  mushroom: { idle: ['*releases spore*','*grows slightly*','Mycelium network!','*cap wobble*'], pet: ['*happy spores*','Fungi friend!'] },
  chonk:    { idle: ['*sits*','*is large*','*supreme comfort*','...chonk.'], pet: ['*extra chonk*','*purrs deeply*'] },
};

const GENERIC_MESSAGES = [
  'Hello there!', 'Nice code!', 'Keep going!', '*watches intently*',
  'I believe in you!', '*nods approvingly*', 'You\'ve got this!',
  '*admires your terminal*', 'What a lovely day to code!', '*happy vibes*',
];

// ── Application State ───────────────────────────────────────

let state = {
  bones: null,       // CompanionBones
  soul: null,        // { name, personality }
  save: null,        // persistence data
  tick: 0,
  running: true,
  bubbleText: null,
  bubbleAge: 0,
  petting: false,
  petTick: 0,
  showHelp: false,
  showStats: true,
  hatching: false,    // true during first-run reveal
  hatchPhase: 0,
  namingMode: false,
  nameInput: '',
};

// ── Terminal helpers ─────────────────────────────────────────

function termSize() { return { cols: stdout.columns || 80, rows: stdout.rows || 24 }; }

function centerText(text, width) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function statBar(value, width) {
  const filled = Math.round((value / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

// ── Rendering ───────────────────────────────────────────────

function render() {
  const { cols, rows } = termSize();
  const out = [A.syncOn, A.clear, A.home];
  const color = RARITY_ANSI[state.bones.rarity];

  if (state.showHelp) {
    renderHelp(out, cols, rows, color);
    out.push(A.syncOff);
    stdout.write(out.join(''));
    return;
  }

  if (state.namingMode) {
    renderNaming(out, cols, rows, color);
    out.push(A.syncOff);
    stdout.write(out.join(''));
    return;
  }

  const cx = Math.floor(cols / 2);
  let cy = Math.floor(rows / 2) - 4;

  // ── Speech bubble ──
  if (state.bubbleText && state.bubbleAge < 20) {
    const fading = state.bubbleAge >= 14;
    const lines = wrapText(state.bubbleText, 30);
    const boxW = Math.max(...lines.map(l => l.length)) + 4;
    const bx = cx - Math.floor(boxW / 2);
    const by = cy - lines.length - 3;
    const bc = fading ? A.dimGray : color;

    out.push(moveTo(bx, by), bc, '\u256D', '\u2500'.repeat(boxW - 2), '\u256E', A.reset);
    for (let i = 0; i < lines.length; i++) {
      const pad = boxW - 4 - lines[i].length;
      out.push(moveTo(bx, by + 1 + i), bc, '\u2502 ', A.italic, fading ? A.dim : '', lines[i], ' '.repeat(pad), A.reset, bc, ' \u2502', A.reset);
    }
    out.push(moveTo(bx, by + lines.length + 1), bc, '\u2570', '\u2500'.repeat(boxW - 2), '\u256F', A.reset);
    out.push(moveTo(cx, by + lines.length + 2), bc, '\u2572', A.reset);
  }

  // ── Rarity badge ──
  const rarityLabel = state.bones.rarity.toUpperCase();
  const stars = RARITY_STARS[state.bones.rarity];
  const shinyTag = state.bones.shiny ? ` ${A.bold}\u2728 SHINY${A.reset}` : '';
  const badge = `${stars} ${rarityLabel} ${stars}`;
  out.push(moveTo(cx - Math.floor(badge.length / 2), cy - 1), color, A.bold, badge, shinyTag, A.reset);

  // ── Pet hearts ──
  if (state.petting && state.tick - state.petTick < PET_HEARTS.length) {
    const hIdx = (state.tick - state.petTick) % PET_HEARTS.length;
    const heartLine = PET_HEARTS[hIdx];
    out.push(moveTo(cx - Math.floor(heartLine.length / 2), cy), `${ESC}38;5;204m`, heartLine, A.reset);
    cy++;
  }

  // ── Sprite ──
  const frameCount = BODIES[state.bones.species].length;
  const step = IDLE_SEQUENCE[state.tick % IDLE_SEQUENCE.length];
  let spriteFrame, blink = false;
  if (state.petting && state.tick - state.petTick < 5) {
    spriteFrame = state.tick % frameCount;  // fast fidget when petted
  } else if (step === -1) {
    spriteFrame = 0;
    blink = true;
  } else {
    spriteFrame = step % frameCount;
  }

  let body = renderSprite(state.bones, spriteFrame);
  if (blink) body = body.map(l => l.replaceAll(state.bones.eye, '-'));

  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    out.push(moveTo(cx - Math.floor(line.length / 2), cy + i), color, line, A.reset);
  }
  cy += body.length;

  // ── Name ──
  const name = state.soul ? state.soul.name : state.bones.species;
  const nameDisplay = `~ ${name} ~`;
  out.push(moveTo(cx - Math.floor(nameDisplay.length / 2), cy + 1), color, A.bold, nameDisplay, A.reset);
  cy += 3;

  // ── Stats ──
  if (state.showStats) {
    const barW = 10;
    const statsStartY = cy;
    out.push(moveTo(cx - 16, statsStartY), A.dimGray, '\u2500'.repeat(32), A.reset);
    for (let i = 0; i < STAT_NAMES.length; i++) {
      const sn = STAT_NAMES[i];
      const sv = state.bones.stats[sn];
      const label = sn.padEnd(10);
      const bar = statBar(sv, barW);
      out.push(
        moveTo(cx - 16, statsStartY + 1 + i),
        A.gray, label, ' ',
        color, bar,
        A.gray, ` ${sv.toString().padStart(3)}`,
        A.reset
      );
    }
    out.push(moveTo(cx - 16, statsStartY + STAT_NAMES.length + 1), A.dimGray, '\u2500'.repeat(32), A.reset);
  }

  // ── Face badge (bottom-left) ──
  const face = renderFace(state.bones);
  out.push(moveTo(2, rows - 2), color, face, A.reset);

  // ── Status bar ──
  const species = state.bones.species;
  const left = ` ${face} ${name}  (${species})`;
  const right = ' [Space] Pet  [T] Talk  [S] Stats  [?] Help  [Q] Quit ';
  const padLen = Math.max(0, cols - left.length - right.length);
  out.push(
    moveTo(0, rows - 1), color, A.bold, left, A.reset,
    A.dimGray, '\u2500'.repeat(padLen), A.reset,
    A.dim, A.gray, right, A.reset
  );

  out.push(A.syncOff);
  stdout.write(out.join(''));
}

// ── Render: Help overlay ────────────────────────────────────

function renderHelp(out, cols, rows, color) {
  const lines = [
    '          Claude Buddy Help          ',
    '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    '',
    '  [Space]    Pet your buddy          ',
    '  [T]        Make it talk            ',
    '  [S]        Toggle stat display     ',
    '  [N]        Rename your buddy       ',
    '  [?]        Toggle this help        ',
    '  [Q / Esc]  Quit                    ',
    '',
    '  Your buddy is deterministic \u2014     ',
    '  species, rarity, eye, hat, and     ',
    '  stats are all derived from your    ',
    '  unique seed. Same seed = same      ',
    '  buddy, every time.                 ',
    '',
    '       Press any key to close        ',
  ];
  const boxW = 39;
  const bx = Math.floor(cols / 2) - Math.floor(boxW / 2);
  const by = Math.floor(rows / 2) - Math.floor((lines.length + 2) / 2);

  out.push(moveTo(bx, by), color, A.bold, '\u256D', '\u2500'.repeat(boxW - 2), '\u256E', A.reset);
  for (let i = 0; i < lines.length; i++) {
    const pad = boxW - 4 - lines[i].length;
    out.push(moveTo(bx, by + 1 + i), color, '\u2502', A.reset, ' ', A.white, lines[i], ' '.repeat(Math.max(0, pad)), A.reset, color, ' \u2502', A.reset);
  }
  out.push(moveTo(bx, by + lines.length + 1), color, A.bold, '\u2570', '\u2500'.repeat(boxW - 2), '\u256F', A.reset);
}

// ── Render: Naming ──────────────────────────────────────────

function renderNaming(out, cols, rows, color) {
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2) - 3;

  // Show the sprite
  const body = renderSprite(state.bones, 0);
  for (let i = 0; i < body.length; i++) {
    out.push(moveTo(cx - Math.floor(body[i].length / 2), cy + i), color, body[i], A.reset);
  }

  const prompt1 = 'Name your buddy:';
  const prompt2 = `> ${state.nameInput}_`;
  const hint = '(Enter to confirm, Esc to use species name)';

  out.push(moveTo(cx - Math.floor(prompt1.length / 2), cy + body.length + 2), A.white, A.bold, prompt1, A.reset);
  out.push(moveTo(cx - Math.floor(prompt2.length / 2), cy + body.length + 4), color, A.bold, prompt2, A.reset);
  out.push(moveTo(cx - Math.floor(hint.length / 2), cy + body.length + 6), A.dimGray, hint, A.reset);
}

// ── Egg Hatching Animation ──────────────────────────────────

const EGG_FRAMES = [
  ['   ___   ','  /   \\  ',' |     | ','  \\___/  ','         '],
  ['   ___   ','  / . \\  ',' |  .  | ','  \\___/  ','         '],
  ['   _*_   ','  / * \\  ',' | * * | ','  \\*__/  ','         '],
  ['   _/ \\  ','  /   \\  ',' / * * \\ ','  \\_*_/  ','    *    '],
  ['  \\   /  ','   * *   ','  * * *  ','   * *   ','  *   *  '],
];

function renderHatch(phase) {
  const { cols, rows } = termSize();
  const out = [A.syncOn, A.clear, A.home];
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2) - 3;
  const color = RARITY_ANSI[state.bones.rarity];

  if (phase < EGG_FRAMES.length) {
    const frame = EGG_FRAMES[phase];
    for (let i = 0; i < frame.length; i++) {
      out.push(moveTo(cx - Math.floor(frame[i].length / 2), cy + i), A.white, frame[i], A.reset);
    }
    if (phase >= 2) {
      out.push(moveTo(cx - 5, cy + 6), A.dimGray, '*crack* *crack*', A.reset);
    }
  } else {
    // Reveal!
    const body = renderSprite(state.bones, 0);
    for (let i = 0; i < body.length; i++) {
      out.push(moveTo(cx - Math.floor(body[i].length / 2), cy + i), color, body[i], A.reset);
    }

    const stars = RARITY_STARS[state.bones.rarity];
    const rLabel = state.bones.rarity.toUpperCase();
    const badge = `${stars} ${rLabel} ${stars}`;
    const shiny = state.bones.shiny ? ' \u2728 SHINY!' : '';
    out.push(moveTo(cx - Math.floor(badge.length / 2), cy - 2), color, A.bold, badge, shiny, A.reset);

    const species = state.bones.species.charAt(0).toUpperCase() + state.bones.species.slice(1);
    const reveal = `It's a ${species}!`;
    out.push(moveTo(cx - Math.floor(reveal.length / 2), cy + body.length + 1), A.white, A.bold, reveal, A.reset);

    if (state.bones.hat !== 'none') {
      const hatMsg = `Wearing a ${state.bones.hat}!`;
      out.push(moveTo(cx - Math.floor(hatMsg.length / 2), cy + body.length + 2), A.gray, hatMsg, A.reset);
    }

    const cont = 'Press any key to continue...';
    out.push(moveTo(cx - Math.floor(cont.length / 2), cy + body.length + 4), A.dimGray, cont, A.reset);
  }

  out.push(A.syncOff);
  stdout.write(out.join(''));
}

// ── Update ──────────────────────────────────────────────────

function update() {
  state.tick++;

  if (state.bubbleText) {
    state.bubbleAge++;
    if (state.bubbleAge >= 20) {
      state.bubbleText = null;
      state.bubbleAge = 0;
    }
  }

  if (state.petting && state.tick - state.petTick >= PET_HEARTS.length + 2) {
    state.petting = false;
  }
}

// ── Speech ──────────────────────────────────────────────────

function say(text) {
  state.bubbleText = text;
  state.bubbleAge = 0;
}

function saySpecies(type) {
  const msgs = SPECIES_MESSAGES[state.bones.species];
  if (msgs && msgs[type]) say(pick(mulberry32(Date.now()), msgs[type]));
  else say(pick(mulberry32(Date.now()), GENERIC_MESSAGES));
}

// ── Input ───────────────────────────────────────────────────

function handleInput(data) {
  const key = data.toString();

  // Naming mode
  if (state.namingMode) {
    if (key === '\r' || key === '\n') {
      const name = state.nameInput.trim() || state.bones.species;
      state.soul = { name, personality: `a friendly ${state.bones.species}` };
      state.namingMode = false;
      state.save.soul = state.soul;
      writeSave(state.save);
      say(`Hi! I'm ${name}!`);
      return;
    }
    if (key === '\x1B') {
      state.soul = { name: state.bones.species, personality: `a friendly ${state.bones.species}` };
      state.namingMode = false;
      state.save.soul = state.soul;
      writeSave(state.save);
      return;
    }
    if (key === '\x7F' || key === '\b') {
      state.nameInput = state.nameInput.slice(0, -1);
      return;
    }
    if (key.length === 1 && key >= ' ' && state.nameInput.length < 20) {
      state.nameInput += key;
    }
    return;
  }

  // Help overlay
  if (state.showHelp) {
    state.showHelp = false;
    return;
  }

  // Hatching reveal
  if (state.hatching) {
    if (state.hatchPhase >= EGG_FRAMES.length) {
      state.hatching = false;
      state.namingMode = true;
    }
    return;
  }

  // Normal controls
  switch (key) {
    case '\x03': case '\x1B': case 'q': case 'Q':
      shutdown();
      break;
    case ' ':
      state.petting = true;
      state.petTick = state.tick;
      saySpecies('pet');
      break;
    case 't': case 'T':
      saySpecies('idle');
      break;
    case 's': case 'S':
      state.showStats = !state.showStats;
      break;
    case 'n': case 'N':
      state.namingMode = true;
      state.nameInput = state.soul ? state.soul.name : '';
      break;
    case '?':
      state.showHelp = !state.showHelp;
      break;
  }
}

// ── Text Wrapping ───────────────────────────────────────────

function wrapText(text, maxW) {
  if (text.length <= maxW) return [text];
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > maxW && cur) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Lifecycle ───────────────────────────────────────────────

let mainLoop = null;
let hatchLoop = null;

function setup() {
  if (!stdin.isTTY) {
    console.error('Claude Buddy requires an interactive terminal.');
    process.exit(1);
  }

  // Parse args
  const args = process.argv.slice(2);
  let seed = null;
  let reroll = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed' && args[i + 1]) { seed = args[++i]; }
    if (args[i] === '--reroll') reroll = true;
  }

  // Load or create save
  let save = reroll ? null : loadSave();

  if (!save || (seed && save.seed !== seed)) {
    // New buddy
    seed = seed || `buddy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    save = { seed, soul: null, hatchedAt: Date.now(), totalPets: 0, totalTalks: 0 };
    writeSave(save);
    state.hatching = true;
  }

  state.save = save;
  state.bones = roll(save.seed);
  state.soul = save.soul;

  // Enter terminal
  stdout.write(A.alt + A.hide + A.clear);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  stdin.on('data', handleInput);
  stdout.on('resize', () => stdout.write(A.clear));

  if (state.hatching) {
    // Run hatch animation
    hatchLoop = setInterval(() => {
      if (state.hatchPhase <= EGG_FRAMES.length) {
        renderHatch(state.hatchPhase);
        state.hatchPhase++;
      } else {
        clearInterval(hatchLoop);
        hatchLoop = null;
        // Wait for keypress to continue (handled in handleInput)
      }
    }, 600);
  } else {
    // Normal startup
    if (state.soul) {
      say(`Hi! ${state.soul.name} is back!`);
    }
    startMainLoop();
  }
}

function startMainLoop() {
  mainLoop = setInterval(() => {
    if (!state.running) return;
    update();
    render();
  }, TICK_MS);
  render(); // immediate first frame
}

function shutdown() {
  state.running = false;
  if (mainLoop) clearInterval(mainLoop);
  if (hatchLoop) clearInterval(hatchLoop);
  stdout.write(A.show + A.main);
  if (stdin.isTTY) { stdin.setRawMode(false); stdin.pause(); }
  const name = state.soul ? state.soul.name : state.bones.species;
  const face = renderFace(state.bones);
  console.log('');
  console.log(` ${face} ${name} waves goodbye! See you next time!`);
  console.log('');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  stdout.write(A.show + A.main);
  if (stdin.isTTY) try { stdin.setRawMode(false); } catch {}
  console.error('\nClaude Buddy crashed:', err.message);
  process.exit(1);
});

// Lightweight poller bridges the naming/hatch → main-loop transition.
// Runs at 10Hz until the main loop starts, then self-clears.
const _transitionCheck = setInterval(() => {
  if (!state.hatching && !state.namingMode && state.soul && !mainLoop && state.running) {
    startMainLoop();
    clearInterval(_transitionCheck);
  }
  // Keep rendering during naming mode so keystrokes show immediately
  if (state.namingMode && !mainLoop && state.running) render();
}, 100);

// ── Entry Point ─────────────────────────────────────────────

setup();
