// Outils communs : base de données, mots de passe, sessions
const enc = new TextEncoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

let ready = false;
export async function initDb(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pseudo TEXT NOT NULL,
      pseudo_lc TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      pass_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'membre',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS contenu (
      cle TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      maj TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
  ]);
  // colonnes ajoutées après coup : droits donnés par l'administrateur
  for (const col of ['moderateur INTEGER NOT NULL DEFAULT 0', 'publier INTEGER NOT NULL DEFAULT 0', 'banni INTEGER NOT NULL DEFAULT 0', 'hippo INTEGER NOT NULL DEFAULT 0', 'vu INTEGER']) {
    try { await db.prepare('ALTER TABLE users ADD COLUMN ' + col).run(); } catch (e) { /* déjà là */ }
  }
  ready = true;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { hash: hex(bits), salt: hex(salt) };
}

export function sameText(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const DAYS = 30;

export async function createSession(db, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expires = Date.now() + DAYS * 86400000;
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, expires).run();
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}

function readToken(request) {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)session=([0-9a-f]{64})/);
  return m ? m[1] : null;
}

export async function currentUser(db, request) {
  const token = readToken(request);
  if (!token) return null;
  const row = await db.prepare(
    `SELECT u.id, u.pseudo, u.role, u.moderateur, u.publier, u.banni, u.hippo, u.vu, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
  ).bind(await sha256(token)).first();
  if (!row || row.expires_at < Date.now() || row.banni) return null;
  // présence : « vu » mis à jour au plus une fois par minute
  if (!row.vu || Date.now() - row.vu > 60000) { try { await db.prepare('UPDATE users SET vu = ? WHERE id = ?').bind(Date.now(), row.id).run(); } catch (e) {} }
  const admin = row.role === 'admin';
  return { id: row.id, pseudo: row.pseudo, role: row.role, moderateur: admin || !!row.moderateur, publier: admin || !!row.publier, hippo: admin || !!row.publier || !!row.hippo };
}

export async function endSession(db, request) {
  const token = readToken(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export function noDb() {
  return json({ erreur: "Le service d'inscription n'est pas encore branché." }, 503);
}

export async function lireContenu(db, cle) {
  const r = await db.prepare('SELECT data, maj FROM contenu WHERE cle = ?').bind(cle).first();
  return r ? { ...JSON.parse(r.data), maj: r.maj } : null;
}

export async function ecrireContenu(db, cle, data) {
  await db.prepare(`INSERT INTO contenu (cle, data, maj) VALUES (?, ?, datetime('now'))
    ON CONFLICT(cle) DO UPDATE SET data = excluded.data, maj = excluded.maj`).bind(cle, JSON.stringify(data)).run();
  // Le bandeau défilant se recalcule tout de suite après une publication
  try { await db.prepare("DELETE FROM pmu_cache WHERE cle = 'bandeau'").run(); } catch (e) {}
}

// Peut publier dans l'Administration : l'administrateur, ou un membre qu'il a autorisé
export function peutPublier(u) { return !!(u && (u.role === 'admin' || u.publier)); }

// Peut publier les pages de Pronos Hippodrome (droit limité donné à Hippodrome)
export function peutHippo(u) { return !!(u && (peutPublier(u) || u.hippo)); }
