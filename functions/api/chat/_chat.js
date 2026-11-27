// Tables du tchat
let pret = false;
export async function initChat(db) {
  if (pret) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salon TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      pseudo TEXT NOT NULL,
      modo INTEGER NOT NULL DEFAULT 0,
      texte TEXT NOT NULL,
      cree INTEGER NOT NULL,
      supprime INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS chat_salon_id ON chat_messages (salon, id)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS chat_signalements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      cree INTEGER NOT NULL,
      traite INTEGER NOT NULL DEFAULT 0,
      UNIQUE (message_id, user_id)
    )`),
  ]);
  // « Répondre » : le message auquel on répond
  try { await db.prepare('ALTER TABLE chat_messages ADD COLUMN reponse_a INTEGER').run(); } catch (e) { /* déjà là */ }
  // Un seul tchat pour les membres : les anciens salons Quinté+ et Course par course rejoignent la discussion (rien n'est effacé)
  await db.prepare("UPDATE chat_messages SET salon = 'general' WHERE salon IN ('quinte', 'cpc')").run();
  pret = true;
}
// Le tchat des membres, et le tchat de l'équipe (invisible des membres ordinaires)
export const SALONS = { general: 'Tchat', equipe: 'Équipe' };
// Salons auxquels ce membre a accès
export function salonsDe(u) { return u && u.equipe ? SALONS : { general: SALONS.general }; }
