import { entrer, json } from './_commun.js';

// Historique complet et statistiques de chaque joueur
export async function onRequestGet({ request, env }) {
  const x = await entrer(request, env); if (x.refus) return x.refus;
  const { db } = x;
  const joueurs = (await db.prepare('SELECT id, nom, actif FROM bal_joueurs ORDER BY nom').all()).results || [];
  const etats = (await db.prepare('SELECT date, joueur_id, cagnotte, palier, mise, retour, lendemain, note FROM bal_etat ORDER BY date').all()).results || [];
  const jours = (await db.prepare('SELECT date, statut, texte FROM bal_jours ORDER BY date DESC').all()).results || [];
  const jeux = (await db.prepare(`SELECT joueur_id, type, COUNT(*) AS n, SUM(mise) AS mise, SUM(COALESCE(retour, 0)) AS retour,
    SUM(CASE WHEN retour > mise THEN 1 ELSE 0 END) AS gagnants, MAX(COALESCE(retour, 0)) AS meilleur FROM bal_jeux WHERE retour IS NOT NULL GROUP BY joueur_id, type`).all()).results || [];
  const trace = x.a.admin ? ((await db.prepare('SELECT t.quand, u.pseudo, t.action, t.detail FROM bal_trace t LEFT JOIN users u ON u.id = t.par ORDER BY t.id DESC LIMIT 50').all()).results || []) : [];
  // pour l'administrateur : la liste des pseudos du site, pour relier un joueur à son compte (sans e-mail)
  const pseudos = x.a.admin ? ((await db.prepare("SELECT pseudo FROM users WHERE role != 'robot' AND banni = 0 ORDER BY pseudo_lc").all()).results || []).map((r) => r.pseudo) : [];
  return json({ joueurs, etats, jours, jeux, trace, pseudos });
}
