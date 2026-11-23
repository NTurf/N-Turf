import { json, hashPassword, noDb } from '../../_auth.js';
import { verifier } from './_compte.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  const v = await verifier(env, request, b.actuel); if (v.err) return v.err;
  const n = String(b.nouveau || '');
  if (n.length < 8 || n.length > 200) return json({ erreur: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }, 400);
  const { hash, salt } = await hashPassword(n);
  await env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(hash, salt, v.u.id).run();
  return json({ ok: true });
}
