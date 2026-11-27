import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initMail } from '../../_mail.js';
// Préférences du membre : recevoir ou non les messages d'information (les messages indispensables au compte partent toujours)
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await initMail(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connecte-toi d\'abord.' }, 401);
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  await env.DB.prepare('UPDATE users SET info_ok = ? WHERE id = ?').bind(b.info ? 1 : 0, u.id).run();
  return json({ ok: true });
}
