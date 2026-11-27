import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initTd, PARIS } from '../../_td.js';

// Les contributeurs du Ticket du jour et leurs droits (réservé à l'administrateur).
// Les droits ne sont pas figés : pronostics oui/non, et la liste des paris permis, modifiables à tout moment.
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initTd(db);
  const u = await currentUser(db, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  const L = (await db.prepare('SELECT c.*, u.pseudo FROM td_contributeurs c JOIN users u ON u.id = c.user_id ORDER BY c.cree').all()).results || [];
  const pseudos = ((await db.prepare("SELECT id, pseudo FROM users WHERE role != 'robot' AND banni = 0 ORDER BY pseudo_lc").all()).results || []);
  const sup = (await db.prepare(`SELECT p.date, p.r, p.c, p.hippodrome, p.signature, p.type, p.motif, p.supprime_quand, x.pseudo AS par FROM td_pubs p LEFT JOIN users x ON x.id = p.supprime_par WHERE p.supprime = 1 ORDER BY p.supprime_quand DESC LIMIT 30`).all()).results || [];
  return json({ paris: PARIS, contributeurs: L.map((c) => ({ ...c, droits: JSON.parse(c.droits || '{}') })), pseudos, supprimees: sup });
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initTd(db);
  const u = await currentUser(db, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  let b; try { b = await request.json(); } catch (e) { return json({ erreur: 'Demande illisible.' }, 400); }
  const id = parseInt(b.user, 10);
  const cible = await db.prepare('SELECT id, pseudo FROM users WHERE id = ?').bind(id || 0).first();
  if (!cible) return json({ erreur: 'Membre introuvable.' }, 404);
  const signature = String(b.signature || '').trim().slice(0, 40) || ('Choix ' + cible.pseudo);
  const droits = { pronos: !!b.pronos, paris: (Array.isArray(b.paris) ? b.paris : []).filter((p) => PARIS.includes(p)) };
  await db.prepare(`INSERT INTO td_contributeurs (user_id, signature, droits, actif) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET signature = excluded.signature, droits = excluded.droits, actif = excluded.actif`)
    .bind(id, signature, JSON.stringify(droits), b.actif === false ? 0 : 1).run();
  return json({ ok: true });
}
