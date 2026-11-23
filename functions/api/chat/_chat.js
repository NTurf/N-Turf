// Tables du chat
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
  pret = true;
}
export const SALONS = { general: 'Discussion', quinte: 'Quinté+', cpc: 'Course par course' };
