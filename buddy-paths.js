'use strict';

// ══════════════════════════════════════════════════════════════
//  Claude Buddy — storage resolution (per-repo companions)
//
//  Each git repo gets its own buddy at <repo>/.buddy/companion.json.
//  Outside a repo, the buddy lives globally at ~/.claude-buddy.json.
//  The legacy global buddy migrates into the first repo it sees and
//  is never reset — "she finds her home." A small active-pointer
//  lets the status line render the right buddy without reading stdin
//  or spawning git on every tick.
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const GLOBAL_PATH = path.join(HOME, '.claude-buddy.json');
const COLLECTION_PATH = path.join(HOME, '.claude-buddy-collection.json');
const ACTIVE_PATH = path.join(HOME, '.claude-buddy-active.json');

function safeReadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function safeWriteJSON(p, obj) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2));
    return true;
  } catch { return false; }
}

// Walk up from a directory looking for a .git entry (dir or file).
function findGitRoot(startDir) {
  let dir = startDir || process.cwd();
  try { dir = fs.realpathSync(dir); } catch { /* keep raw */ }
  for (let i = 0; i < 64; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return null;
}

// Read the remote URL from .git/config without spawning git (fast).
function readRemoteUrl(gitRoot) {
  let cfg = '';
  try { cfg = fs.readFileSync(path.join(gitRoot, '.git', 'config'), 'utf8'); } catch { return null; }
  let inOrigin = false, originUrl = null, firstUrl = null;
  for (const line of cfg.split('\n')) {
    const sec = line.match(/^\s*\[remote\s+"([^"]+)"\]/);
    if (sec) { inOrigin = sec[1] === 'origin'; continue; }
    if (/^\s*\[/.test(line)) inOrigin = false;
    const u = line.match(/^\s*url\s*=\s*(.+?)\s*$/);
    if (u) {
      if (!firstUrl) firstUrl = u[1];
      if (inOrigin && !originUrl) originUrl = u[1];
    }
  }
  return originUrl || firstUrl || null;
}

function normalizeRemote(url) {
  return String(url).replace(/\/\/[^@/]+@/, '//').replace(/\.git$/, '').trim();
}

function username() {
  try { return os.userInfo().username; } catch { return process.env.USER || process.env.USERNAME || 'user'; }
}

// Deterministic seed for a repo's buddy: same person + same repo ⇒
// same species/rarity, always. Fork it ⇒ a different buddy.
function repoSeed(gitRoot) {
  const remote = readRemoteUrl(gitRoot);
  const base = remote ? normalizeRemote(remote) : gitRoot;
  return `repo:${base}:${username()}`;
}

// Resolve where this invocation's buddy lives.
function resolveContext(cwd) {
  const gitRoot = findGitRoot(cwd || process.cwd());
  if (gitRoot) {
    return {
      scope: 'repo',
      gitRoot,
      buddyDir: path.join(gitRoot, '.buddy'),
      savePath: path.join(gitRoot, '.buddy', 'companion.json'),
      seed: repoSeed(gitRoot),
    };
  }
  return { scope: 'global', gitRoot: null, buddyDir: null, savePath: GLOBAL_PATH, seed: null };
}

// Personal, never shared.
function ensureGitignore(gitRoot) {
  if (!gitRoot) return;
  const gi = path.join(gitRoot, '.gitignore');
  let txt = '';
  try { txt = fs.readFileSync(gi, 'utf8'); } catch { /* none yet */ }
  if (/^\s*\.buddy\/?\s*$/m.test(txt)) return;
  const prefix = txt && !txt.endsWith('\n') ? '\n' : '';
  try { fs.writeFileSync(gi, txt + prefix + '.buddy/\n'); } catch { /* best effort */ }
}

// Lightweight cross-repo index for /collection (M6).
function updateCollection(ctx, save) {
  if (!ctx || ctx.scope !== 'repo') return;
  const col = safeReadJSON(COLLECTION_PATH) || { buddies: {} };
  if (!col.buddies) col.buddies = {};
  col.buddies[ctx.gitRoot] = {
    repo: ctx.gitRoot,
    savePath: ctx.savePath,
    seed: save.seed,
    name: (save.soul && save.soul.name) || null,
    xp: save.xp || 0,
    lastSeen: Date.now(),
  };
  safeWriteJSON(COLLECTION_PATH, col);
}

// Pointer to the buddy of the repo you most recently worked in, so the
// status line renders the right one without reading stdin or git.
function writeActivePointer(ctx) {
  safeWriteJSON(ACTIVE_PATH, {
    savePath: ctx.savePath, repo: ctx.gitRoot, scope: ctx.scope, at: Date.now(),
  });
}

function readActiveSavePath() {
  const a = safeReadJSON(ACTIVE_PATH);
  if (a && a.savePath && fs.existsSync(a.savePath)) return a.savePath;
  if (fs.existsSync(GLOBAL_PATH)) return GLOBAL_PATH;
  return null;
}

// Ensure a buddy exists for this context. Performs one-time migration
// of the legacy global buddy, then lazy auto-hatch (only when asked —
// callers pass autoHatch on real activity, not on a mere `cd`).
// Returns the save object, or null when there is intentionally no buddy.
function ensureBuddySave(ctx, opts) {
  opts = opts || {};
  const now = opts.now || Date.now();

  const existing = safeReadJSON(ctx.savePath);
  if (existing) return existing;

  if (ctx.scope === 'global') {
    if (!opts.autoHatch) return null;
    const save = { seed: username(), soul: null, hatchedAt: now, totalPets: 0, totalTalks: 0 };
    safeWriteJSON(ctx.savePath, save);
    return save;
  }

  // repo scope, no companion yet — migrate the legacy global buddy once.
  const global = safeReadJSON(GLOBAL_PATH);
  if (global && !global.migratedTo) {
    const migrated = Object.assign({}, global);
    migrated.repo = ctx.gitRoot;
    migrated.migratedFromGlobal = true;
    safeWriteJSON(ctx.savePath, migrated);
    ensureGitignore(ctx.gitRoot);
    global.migratedTo = ctx.gitRoot; // she only finds one home
    safeWriteJSON(GLOBAL_PATH, global);
    updateCollection(ctx, migrated);
    return migrated;
  }

  if (!opts.autoHatch) return null;
  const save = { seed: ctx.seed, soul: null, hatchedAt: now, totalPets: 0, totalTalks: 0, repo: ctx.gitRoot };
  safeWriteJSON(ctx.savePath, save);
  ensureGitignore(ctx.gitRoot);
  updateCollection(ctx, save);
  return save;
}

module.exports = {
  GLOBAL_PATH, COLLECTION_PATH, ACTIVE_PATH,
  safeReadJSON, safeWriteJSON,
  findGitRoot, readRemoteUrl, repoSeed, username,
  resolveContext, ensureBuddySave, ensureGitignore,
  updateCollection, writeActivePointer, readActiveSavePath,
};
