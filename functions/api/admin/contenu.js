import { json, initDb, currentUser, peutPublier, lireContenu, ecrireContenu, noDb } from '../../_auth.js';

// Lecture / écriture de contenus par l'administrateur (brouillon et tickets publiés)
const AUTORISES = ['tickets_brouillon', 'tickets', 'hippo', 'hippo_quinte', 'hippo_pick5', 'cpc_archive'];

async function admin(env, request) {
  if (!env.DB) return null;
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  return peutPublier(u) ? u : null;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  if (!(await admin(env, request))) return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  const cle = new URL(request.url).searchParams.get('cle');
  if (!AUTORISES.includes(cle)) return json({ erreur: 'Contenu inconnu.' }, 400);
  return json({ data: await lireContenu(env.DB, cle) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  if (!(await admin(env, request))) return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  if (!AUTORISES.includes(b.cle)) return json({ erreur: 'Contenu inconnu.' }, 400);
  if (JSON.stringify(b.data || {}).length > (b.cle === 'cpc_archive' ? 1500000 : 200000)) return json({ erreur: 'Trop volumineux.' }, 400);
  await ecrireContenu(env.DB, b.cle, b.data || {});
  // les tickets publiés sont aussi gardés par date, pour les bilans
  if (b.cle === 'tickets' && b.data && /^\d{2}\/\d{2}\/\d{4}$/.test(b.data.date || '')) {
    await ecrireContenu(env.DB, 'tickets-' + b.data.date.split('/').reverse().join('-'), b.data);
  }
  return json({ ok: true });
}
