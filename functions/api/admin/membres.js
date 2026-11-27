import { json, initDb, currentUser, noDb, hashPassword } from '../../_auth.js';
import { prepAnalyses, AUTEURS, rubriqueChoisie } from '../../_analyses.js';
import { initBal, activer } from '../../_balancoire.js';
import { initMdp } from '../../_mdp.js';

// Gestion des membres : réservée à l'administrateur (Bruno) seul
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  await prepAnalyses(env.DB); await initBal(env.DB);
  const r = await env.DB.prepare(`SELECT (SELECT 1 FROM bal_joueurs b WHERE b.user_id = u.id AND b.actif = 1) AS balancoire, u.id, u.pseudo, u.email, u.role, u.moderateur, u.publier, u.banni, u.hippo, u.redacteur, u.equipe, u.created_at, u.last_login, a.auteur AS analyste FROM users u LEFT JOIN analystes a ON a.user_id = u.id WHERE u.role != 'robot' ORDER BY u.created_at DESC`).all();
  await initMdp(env.DB);
  const dem = (await env.DB.prepare('SELECT d.id, d.quand, d.login, d.contact, d.user_id, u.pseudo, u.email FROM mdp_demandes d LEFT JOIN users u ON u.id = d.user_id WHERE d.traite = 0 ORDER BY d.id').all()).results || [];
  return json({ membres: r.results || [], auteurs: AUTEURS, demandes: dem });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u || u.role !== 'admin') return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ erreur: 'Demande invalide.' }, 400); }
  // Demande « mot de passe oublié » classée (traitée ou sans suite)
  if (b.demandeTraitee) { await initMdp(env.DB); await env.DB.prepare('UPDATE mdp_demandes SET traite = 1 WHERE id = ?').bind(parseInt(b.demandeTraitee, 10)).run(); return json({ ok: true }); }
  const cible = await env.DB.prepare('SELECT id, role, pseudo FROM users WHERE id = ?').bind(parseInt(b.id, 10)).first();
  if (!cible) return json({ erreur: 'Membre introuvable.' }, 404);
  // La Balançoire : l'administrateur donne ou retire l'accès (lui-même compris, s'il veut jouer)
  if ('balancoire' in b) {
    const c2 = await env.DB.prepare('SELECT id, pseudo FROM users WHERE id = ?').bind(cible.id).first();
    await activer(env.DB, c2, !!b.balancoire);
    return json({ ok: true });
  }
  if (cible.role === 'admin') return json({ erreur: 'On ne modifie pas le compte administrateur.' }, 400);
  // Mot de passe oublié : l'administrateur donne un mot de passe provisoire (le membre le change ensuite dans Mon compte)
  if (b.nouveauMdp) {
    const A = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint8Array(8));
    const mdp = [...r].map((x) => A[x % A.length]).join('');
    const { hash, salt } = await hashPassword(mdp);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(hash, salt, cible.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(cible.id),
    ]);
    await initMdp(env.DB); await env.DB.prepare('UPDATE mdp_demandes SET traite = 1 WHERE user_id = ?').bind(cible.id).run();
    return json({ ok: true, mdp, pseudo: cible.pseudo });
  }
  const champs = ['moderateur', 'publier', 'banni', 'hippo', 'redacteur', 'equipe'].filter((k) => k in b);
  for (const k of champs) {
    await env.DB.prepare(`UPDATE users SET ${k} = ? WHERE id = ?`).bind(b[k] ? 1 : 0, cible.id).run();
  }
  if ('analyste' in b) {
    await prepAnalyses(env.DB);
    if (!b.analyste) await env.DB.prepare('DELETE FROM analystes WHERE user_id = ?').bind(cible.id).run();
    else {
      const rub = rubriqueChoisie(b.analyste, cible.pseudo);
      if (!rub) return json({ erreur: 'Rubrique inconnue.' }, 400);
      await env.DB.prepare('INSERT INTO analystes (user_id, auteur) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET auteur = excluded.auteur').bind(cible.id, rub).run();
      return json({ ok: true, rubrique: rub });
    }
  }
  if (b.banni) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(cible.id).run();
  return json({ ok: true });
}
