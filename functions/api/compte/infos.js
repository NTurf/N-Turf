import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours, parisJour, bornesMois, classement, MISE_JOUR } from '../../_concours.js';

// Mon compte : pseudo, e-mail, date d'inscription, bilan au concours
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initConcours(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Connecte-toi d\'abord.' }, 401);
  const r = await db.prepare('SELECT pseudo, email, created_at FROM users WHERE id = ?').bind(u.id).first();
  const [m1, m2] = bornesMois(parisJour());
  const mois = await classement(db, m1, m2, true);
  const rang = mois.liste.findIndex((x) => x.id === u.id);
  const moi = rang >= 0 ? mois.liste[rang] : null;
  const tot = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(p.gains), 0) AS g FROM concours_pronos p JOIN concours_jours j ON j.date = p.date AND j.statut = 'calcule' WHERE p.user_id = ?`).bind(u.id).first();
  return json({
    pseudo: r.pseudo, email: r.email, inscrit: r.created_at,
    mois: moi ? { rang: rang + 1, sur: mois.liste.length, joues: moi.joues, jours: moi.jours, mises: moi.mises, gains: moi.gains, net: moi.net } : null,
    total: { joues: tot.n, gains: Math.round(tot.g * 100) / 100, misesJouees: Math.round(tot.n * MISE_JOUR * 100) / 100 },
  });
}
