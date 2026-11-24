import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { prepSocial, membreParPseudo, contact, EN_LIGNE_MS } from '../../_social.js';

const champ = (v, n) => String(v || '').trim().slice(0, n);

// GET ?pseudo=X : la fiche d'un membre (pour les membres connectés) ; GET sans pseudo : ma propre fiche
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await prepSocial(db);
  const moi = await currentUser(db, request);
  if (!moi) return json({ erreur: 'Connectez-vous pour voir les fiches des membres.' }, 401);
  const p = new URL(request.url).searchParams.get('pseudo');
  const m = p ? await membreParPseudo(db, p) : await db.prepare('SELECT id, pseudo, role, moderateur, created_at FROM users WHERE id = ?').bind(moi.id).first();
  if (!m) return json({ erreur: 'Membre introuvable.' }, 404);
  const f = (await db.prepare('SELECT region, depuis, jeux, bio FROM profils WHERE user_id = ?').bind(m.id).first()) || {};
  const vu = await db.prepare('SELECT vu FROM users WHERE id = ?').bind(m.id).first();
  const c = m.id === moi.id ? null : await contact(db, moi.id, m.id);
  return json({
    pseudo: m.pseudo, moi: m.id === moi.id, modo: m.role === 'admin' || !!m.moderateur, inscrit: m.created_at,
    enLigne: !!(vu && vu.vu && Date.now() - vu.vu < EN_LIGNE_MS),
    region: f.region || '', depuis: f.depuis || '', jeux: f.jeux || '', bio: f.bio || '',
    contact: c ? { statut: c.statut, parMoi: c.demandeur === moi.id } : null,
  });
}

// POST : enregistrer ma fiche
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB; await initDb(db); await prepSocial(db);
  const moi = await currentUser(db, request);
  if (!moi) return json({ erreur: 'Connecte-toi d\'abord.' }, 401);
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  await db.prepare(`INSERT INTO profils (user_id, region, depuis, jeux, bio, maj) VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET region = excluded.region, depuis = excluded.depuis, jeux = excluded.jeux, bio = excluded.bio, maj = excluded.maj`)
    .bind(moi.id, champ(b.region, 60), champ(b.depuis, 40), champ(b.jeux, 120), champ(b.bio, 1000)).run();
  return json({ ok: true });
}
