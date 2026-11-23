import { currentUser, peutPublier } from './_auth.js';

// Analyses texte des pronostiqueurs (TikTokeurs). Les auteurs possibles sont fixés ici.
export const AUTEURS = ["L'Oeil du Trot", 'Turfiste.com', 'Fanny la Dynamite'];

export async function prepAnalyses(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, jour TEXT NOT NULL, auteur TEXT NOT NULL,
      hippo TEXT NOT NULL, course TEXT NOT NULL, texte TEXT NOT NULL,
      par INTEGER, cree TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare('CREATE INDEX IF NOT EXISTS analyses_jour ON analyses (jour)'),
    db.prepare('CREATE TABLE IF NOT EXISTS analystes (user_id INTEGER PRIMARY KEY, auteur TEXT NOT NULL)'),
  ]);
}

// Qui peut écrire, et au nom de qui : l'administration pour tous, un analyste seulement pour lui-même
export async function droitsAnalyse(db, request) {
  const u = await currentUser(db, request);
  if (!u) return null;
  if (peutPublier(u)) return { u, auteurs: AUTEURS, admin: true };
  const r = await db.prepare('SELECT auteur FROM analystes WHERE user_id = ?').bind(u.id).first();
  return r ? { u, auteurs: [r.auteur], admin: false } : null;
}
