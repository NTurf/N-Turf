import { json, noDb } from '../../_auth.js';
import { verifier } from './_compte.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const v = await verifier(env, request, b.actuel); if (v.err) return v.err;
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return json({ erreur: 'Adresse e-mail invalide.' }, 400);
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').bind(email, v.u.id).first()) return json({ erreur: 'Cette adresse est déjà utilisée par un autre compte.' }, 400);
  await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, v.u.id).run();
  return json({ ok: true, email });
}
