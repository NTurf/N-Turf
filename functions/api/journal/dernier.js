import { json, initDb, noDb } from '../../_auth.js';
import { prepJournal, billetsPublies, lienBillet, extrait } from '../../_journal.js';

// Le dernier billet publié, pour l'accueil (public)
export async function onRequestGet({ env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await prepJournal(env.DB);
  const [b] = await billetsPublies(env.DB, 1);
  return json({ billet: b ? { titre: b.titre, auteur: b.auteur, publie_le: b.publie_le, extrait: extrait(b.texte), lien: lienBillet(b) } : null });
}
