// Présence, fiches membres et messages privés (avec demande de contact)
export async function prepSocial(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS profils (user_id INTEGER PRIMARY KEY, region TEXT, depuis TEXT, jeux TEXT, bio TEXT, maj TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS contacts (a INTEGER NOT NULL, b INTEGER NOT NULL, demandeur INTEGER NOT NULL, statut TEXT NOT NULL, cree TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (a, b))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mp (id INTEGER PRIMARY KEY AUTOINCREMENT, de INTEGER NOT NULL, a INTEGER NOT NULL, texte TEXT NOT NULL, lu INTEGER NOT NULL DEFAULT 0, cree TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare('CREATE INDEX IF NOT EXISTS mp_a ON mp (a, lu)'),
  ]);
}
export const EN_LIGNE_MS = 5 * 60000;
export const paire = (x, y) => (x < y ? [x, y] : [y, x]);
export async function membreParPseudo(db, pseudo) {
  return db.prepare("SELECT id, pseudo, role, moderateur, created_at FROM users WHERE pseudo_lc = ? AND role != 'robot' AND banni = 0").bind(String(pseudo || '').trim().toLowerCase()).first();
}
export async function contact(db, x, y) {
  const [a, b] = paire(x, y);
  return db.prepare('SELECT demandeur, statut FROM contacts WHERE a = ? AND b = ?').bind(a, b).first();
}
