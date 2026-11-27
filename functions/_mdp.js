// Mot de passe oublié sans service d'e-mails : le membre laisse une demande sur le site,
// l'administrateur la voit (bandeau rouge + page Membres) et lui donne un mot de passe provisoire.
let pret = false;
export async function initMdp(db) {
  if (pret) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS mdp_demandes (id INTEGER PRIMARY KEY AUTOINCREMENT, quand TEXT DEFAULT (datetime('now')),
    user_id INTEGER, login TEXT, contact TEXT, traite INTEGER DEFAULT 0)`).run();
  pret = true;
}
export async function nbOuvertes(db) {
  try { await initMdp(db); const r = await db.prepare('SELECT COUNT(*) AS n FROM mdp_demandes WHERE traite = 0').first(); return r ? r.n : 0; } catch (e) { return 0; }
}
