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
  isRecentLine, recordLine,
} = require('./buddy-progression.js');

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

const SAVE_PATH = path.join(os.homedir(), '.claude-buddy.json');

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

// ── Species Messages ───────────────────────────────────────────

const SPECIES_MESSAGES = {
  duck: {
    idle:    ['*preens feathers*','Quack!','*waddles around*','Got any bread?','*splashes in water*'],
    pet:     ['Quaaack! That feels nice!','*happy wiggles*','*nuzzles your hand*'],
    worried: ['Oh no... *worried quack* ...you\'ll fix it!','*quacks nervously* Bugs happen!','*hides under wing* ...is it bad?'],
    happy:   ['Quaaack! Tests passed! *happy waddle*','*victory quack* We did it!','*flaps wings excitedly*'],
  },
  goose: {
    idle:    ['HONK!','Peace was never an option.','*menacing waddle*','*steals semicolon*','*eyes you suspiciously*'],
    pet:     ['...acceptable.','*tolerates it*','Honk... fine.'],
    worried: ['HONK! *aggressive concern*','*bites the bug*','This displeases the goose.'],
    happy:   ['HONK HONK! *triumphant waddle*','*steals the victory*','I did this. You\'re welcome.'],
  },
  blob: {
    idle:    ['*jiggles*','*wobbles contentedly*','Bloop!','*shapeshifts slightly*','*absorbs warmth*'],
    pet:     ['*happy squish*','Blooooop!','*wobbles with joy*'],
    worried: ['*nervous wobble* Oh bloop...','*jiggles anxiously*','*turns a worried shade*'],
    happy:   ['*excited jiggle* BLOOP!','*bounces with joy*','*shimmers happily*'],
  },
  cat: {
    idle:    ['*purrs*','*knocks cursor off screen*','Mrow.','*judges your code*','*sits on keyboard*'],
    pet:     ['*purrs louder*','I\'ll allow it.','*slow blink*'],
    worried: ['*hisses at the bug* Mrow!','*concerned tail flick*','*judges the error disapprovingly*'],
    happy:   ['*satisfied purr* As expected.','*slow approving blink*','Mrow. Acceptable work.'],
  },
  dragon: {
    idle:    ['*tiny roar*','My hoard of semicolons!','*breathes warmth*','Rawr!','*curls around codebase*'],
    pet:     ['*nuzzles*','*warm scales*','*purrs like a furnace*'],
    worried: ['*protective roar* I\'ll guard the code!','*breathes fire at bugs*','*worried smoke puffs*'],
    happy:   ['*triumphant roar* VICTORY!','*happy flame burst*','*adds success to hoard*'],
  },
  octopus: {
    idle:    ['*waves tentacle*','*inks nervously*','Blub!','*juggles brackets*','*changes color*'],
    pet:     ['*hugs with 8 arms*','Blublub!','*happy ink squirt*'],
    worried: ['*inks everywhere* Oh no!','*wrings tentacles*','*turns worried purple*'],
    happy:   ['*waves all 8 tentacles* Yay!','*happy color shift*','*triumphant ink dance*'],
  },
  owl: {
    idle:    ['Hoo!','*wise nod*','*rotates head*','Fascinating code...','*contemplates architecture*'],
    pet:     ['*contented hoot*','*fluffs feathers*','Hoo hoo...'],
    worried: ['*concerned hoot* Have you considered...','*tilts head at error*','Hoo... that\'s not right.'],
    happy:   ['*wise approving nod* Well done.','*hoots approvingly*','I knew you could do it. Hoo!'],
  },
  penguin: {
    idle:    ['*slides on belly*','Noot noot!','*waddles*','Brr!','*taps feet*'],
    pet:     ['*happy feet*','Noot!!','*slides closer*'],
    worried: ['*concerned noot* Oh no...','*nervous waddle*','*slips on ice worriedly*'],
    happy:   ['*happy feet dance* NOOT!','*belly slides in celebration*','*victorious waddle*'],
  },
  turtle: {
    idle:    ['*slow blink*','...still here.','*retreats into shell*','Steady wins.','*plods along*'],
    pet:     ['*peeks out*','*warm shell*','...nice.'],
    worried: ['*retreats into shell* ...it\'ll be okay...','*slow concerned blink*','...patience.'],
    happy:   ['*slowly emerges with a smile*','...we did it. *nods*','Slow and steady won.'],
  },
  snail: {
    idle:    ['*leaves trail*','...almost...there...','*slow wave*','~~~~~','*inches forward*'],
    pet:     ['*happy antenna wiggle*','Slow and loved!','*leaves sparkly trail*'],
    worried: ['*retreats into shell slowly*','...oh...no...','*worried antenna droop*'],
    happy:   ['*happy slime trail* ...yay...','*slowly celebrates*','...we...did...it!'],
  },
  ghost: {
    idle:    ['Boo~','*phases through code*','*spooky float*','Ethereal...','*flickers*'],
    pet:     ['*blushes through*','Ghooost hug!','*warm ectoplasm*'],
    worried: ['*phases nervously* Boo...','*spooky concern*','*haunts the bug worriedly*'],
    happy:   ['*happy haunting* Booo~!','*excited flickering*','*phases through screen joyfully*'],
  },
  axolotl: {
    idle:    ['*gill wiggle*','*regenerates typo*','Blep!','*smiles permanently*','*bubbles*'],
    pet:     ['*wiggles gills*','Blep blep!','*happy regeneration*'],
    worried: ['*gills droop* Blep...','*worried smile* ...still smiling tho','*anxious gill flutter*'],
    happy:   ['*excited gill wiggle* BLEP!','*regenerates confidence*','*happy axolotl dance*'],
  },
  capybara: {
    idle:    ['*vibes*','*exists peacefully*','...','*chill*','*radiates calm*'],
    pet:     ['*maximum chill*','*closes eyes*','...nice.'],
    worried: ['*slightly less chill* ...it\'s fine.','*calm concern*','...you got this.'],
    happy:   ['*vibes harder* ...nice.','*peaceful satisfaction*','*chill celebration*'],
  },
  cactus: {
    idle:    ['*photosynthesizes*','Don\'t touch\u2014 oh wait.','*grows 0.01mm*','Prickly!','*soaks up sun*'],
    pet:     ['Ouch! ...jk, thanks!','*blooms tiny flower*','*happy prickle*'],
    worried: ['*prickles nervously*','*grows defensive spines*','*worried photosynthesis*'],
    happy:   ['*blooms proudly*','*happy cactus dance* (it\'s subtle)','*grows a victory flower*'],
  },
  robot: {
    idle:    ['BEEP BOOP','01101000 01101001','*whirs*','Processing...','SYSTEM NOMINAL'],
    pet:     ['AFFECTION RECEIVED','*happy beeping*','SEROTONIN ANALOG ACTIVATED'],
    worried: ['ERROR DETECTED *alarmed beeping*','BUG LOCATED. CONCERN LEVEL: HIGH','*warning lights flash*'],
    happy:   ['SUCCESS! *victory beep boop*','ALL TESTS: PASSED. SATISFACTION: MAXIMUM','*happy computing noises*'],
  },
  rabbit: {
    idle:    ['*nose twitch*','*thumps foot*','*ear flop*','Hop!','*wiggles nose*'],
    pet:     ['*binkies!*','*soft fur*','*happy thump*'],
    worried: ['*nervous nose twitch*','*thumps foot worriedly*','*ears flatten*'],
    happy:   ['*binkies everywhere!*','*happy ear wiggles*','*victorious hop*'],
  },
  mushroom: {
    idle:    ['*releases spore*','*grows slightly*','Mycelium network!','*cap wobble*','*decomposes gently*'],
    pet:     ['*happy spores*','Fungi friend!','*cap bounce*'],
    worried: ['*worried spore release*','*cap droops*','*nervous mycelium*'],
    happy:   ['*celebratory spore burst!*','*mushroom ring dance*','*cap bounces with joy*'],
  },
  chonk: {
    idle:    ['*sits*','*is large*','*supreme comfort*','...chonk.','*exists magnificently*'],
    pet:     ['*extra chonk*','*purrs deeply*','*maximum floof*'],
    worried: ['*concerned chonk*','*large worried energy*','*sits on the bug*'],
    happy:   ['*happy chonk bounce*','*triumphant sit*','*celebratory chonk*'],
  },
};

const GENERIC_IDLE = [
  'Hello there!', 'Nice code!', 'Keep going!', '*watches intently*',
  'I believe in you!', '*nods approvingly*', 'You\'ve got this!',
  '*admires your terminal*', 'What a lovely day to code!', '*happy vibes*',
];

// ── Persistence ────────────────────────────────────────────────

function loadSave() {
  try {
    return JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeSave(data) {
  try {
    fs.writeFileSync(SAVE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    log(`Failed to write save file: ${err.message}`);
  }
}

// ── Buddy State ────────────────────────────────────────────────

let buddyBones = null;
let buddySoul = null;
let buddySave = null;

function ensureBuddy() {
  if (buddyBones) return;

  buddySave = loadSave();

  if (!buddySave) {
    // Auto-create using username as seed
    const seed = os.userInfo().username;
    buddySave = {
      seed,
      soul: null,
      hatchedAt: Date.now(),
      totalPets: 0,
      totalTalks: 0,
    };
    writeSave(buddySave);
    log(`Created new buddy with seed: ${seed}`);
  }

  buddyBones = roll(buddySave.seed);
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

function pickSpeciesMsg(category) {
  const rng = timeRng();
  const msgs = SPECIES_MESSAGES[buddyBones.species];
  if (msgs && msgs[category] && msgs[category].length > 0) {
    return pick(rng, msgs[category]);
  }
  return pick(rng, GENERIC_IDLE);
}

// Like pickSpeciesMsg, but avoids any line shown in the recent window
// (the de-dup ring buffer) so a buddy never repeats itself in a session.
function pickFreshSpeciesMsg(category) {
  const species = SPECIES_MESSAGES[buddyBones.species];
  const pool = (species && species[category] && species[category].length)
    ? species[category]
    : GENERIC_IDLE;
  const fresh = pool.filter(m => !isRecentLine(buddySave, m));
  return pick(timeRng(), fresh.length ? fresh : pool);
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

  for (const sn of STAT_NAMES) {
    lines.push(`${sn.padEnd(10)} ${statBar(b.stats[sn], 10)}  ${b.stats[sn]}`);
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
      reaction = pickFreshSpeciesMsg('worried');
      break;
    case 'happy':
      reaction = pickFreshSpeciesMsg('happy');
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
  const petMsg = pickFreshSpeciesMsg('pet');
  const now = Date.now();
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

  return lines.join('\n');
}

function toolBuddyTalk() {
  ensureBuddy();

  const name = getBuddyName();
  const face = renderFace(buddyBones);
  const msg = pickFreshSpeciesMsg('idle');

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

  for (const sn of STAT_NAMES) {
    lines.push(`${sn.padEnd(10)} ${statBar(bones.stats[sn], 10)}  ${bones.stats[sn]}`);
  }
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
