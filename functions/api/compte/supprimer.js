import { json, noDb } from '../../_auth.js';
import { verifier } from './_compte.js';

// Suppression du compte : le membre disparaît du site, du concours et des classements
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const v = await verifier(env, request, b.actuel); if (v.err) return v.err;
  if (v.u.role === 'admin') return json({ erreur: 'Le compte administrateur ne peut pas être supprimé.' }, 400);
  const db = env.DB, id = v.u.id;
  const q = [
    'DELETE FROM sessions WHERE user_id = ?',
    'DELETE FROM concours_pronos WHERE user_id = ?',
    'DELETE FROM chat_signalements WHERE user_id = ?',
    'DELETE FROM chat_signalements WHERE message_id IN (SELECT id FROM chat_messages WHERE user_id = ?)',
    'DELETE FROM chat_messages WHERE user_id = ?',
    'DELETE FROM users WHERE id = ?',
  ];
  for (const s of q) { try { await db.prepare(s).bind(id).run(); } catch (e) { /* table absente */ } }
  try { await db.prepare("DELETE FROM pmu_cache WHERE cle = 'bandeau'").run(); } catch (e) {}
  return json({ ok: true }, 200, { 'set-cookie': 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
}
