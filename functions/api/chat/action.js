import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initChat } from './_chat.js';

// Actions sur un message : signaler (tout membre), supprimer (son propre message ou modérateur),
// bannir l'auteur (modérateur), classer un signalement (modérateur)
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initChat(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Connectez-vous.' }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const m = await db.prepare('SELECT id, user_id, pseudo FROM chat_messages WHERE id = ?').bind(parseInt(b.id, 10)).first();
  if (!m) return json({ erreur: 'Message introuvable.' }, 404);

  if (b.action === 'signaler') {
    if (m.user_id === u.id) return json({ erreur: 'Tu ne peux pas signaler ton propre message.' }, 400);
    await db.prepare('INSERT OR IGNORE INTO chat_signalements (message_id, user_id, cree) VALUES (?, ?, ?)').bind(m.id, u.id, Date.now()).run();
    return json({ ok: true, texte: 'Merci, le message a été signalé aux modérateurs.' });
  }
  if (b.action === 'supprimer') {
    if (m.user_id !== u.id && !u.moderateur) return json({ erreur: 'Action réservée aux modérateurs.' }, 403);
    await db.prepare('UPDATE chat_messages SET supprime = 1 WHERE id = ?').bind(m.id).run();
    await db.prepare('UPDATE chat_signalements SET traite = 1 WHERE message_id = ?').bind(m.id).run();
    return json({ ok: true });
  }
  if (!u.moderateur) return json({ erreur: 'Action réservée aux modérateurs.' }, 403);
  if (b.action === 'classer') {
    await db.prepare('UPDATE chat_signalements SET traite = 1 WHERE message_id = ?').bind(m.id).run();
    return json({ ok: true });
  }
  if (b.action === 'bannir') {
    const cible = await db.prepare('SELECT id, role, moderateur FROM users WHERE id = ?').bind(m.user_id).first();
    if (!cible) return json({ erreur: 'Membre introuvable.' }, 404);
    if (cible.role === 'admin' || cible.moderateur) return json({ erreur: 'On ne peut pas bannir un modérateur.' }, 400);
    await db.batch([
      db.prepare('UPDATE users SET banni = 1 WHERE id = ?').bind(cible.id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(cible.id),
      db.prepare('UPDATE chat_messages SET supprime = 1 WHERE user_id = ?').bind(cible.id),
      db.prepare('UPDATE chat_signalements SET traite = 1 WHERE message_id IN (SELECT id FROM chat_messages WHERE user_id = ?)').bind(cible.id),
    ]);
    return json({ ok: true, texte: m.pseudo + ' est banni : ses messages sont retirés et il ne peut plus se connecter.' });
  }
  return json({ erreur: 'Action inconnue.' }, 400);
}
