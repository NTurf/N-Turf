import { json, initDb, currentUser, peutPublier, peutHippo, lireContenu, ecrireContenu, noDb } from '../../_auth.js';

// Lecture / écriture de contenus par l'administrateur (brouillon et tickets publiés)
// Contenus qu'on peut préparer pour le lendemain (publiés au moment de la bascule)
const EN_ATTENTE = ['quinte', 'cpc', 'tickets', 'tickets_brouillon', 'coeurs', 'fanny', 'hippo_quinte', 'hippo_pick5', 'hippo_etquinte', 'hippo_etr1', 'hippo_etout', 'hippo_ettrot'];
const AUTORISES = ['tickets_brouillon', 'tickets', 'hippo', 'hippo_quinte', 'hippo_pick5', 'hippo_etquinte', 'hippo_etr1', 'hippo_etout', 'hippo_ettrot', 'cpc_archive', 'tickets_report', 'fanny', 'coeurs'];

// cle : le contenu visé. Hippodrome (droit limité) n'a accès qu'à ses deux rubriques.
async function admin(env, request, cle) {
  if (!env.DB) return null;
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (peutPublier(u)) return u;
  return peutHippo(u) && ['hippo_quinte', 'hippo_pick5'].includes(cle) ? u : null;
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  if (!(await admin(env, request, new URL(request.url).searchParams.get('cle')))) return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  const q = new URL(request.url).searchParams, cle = q.get('cle');
  if (q.get('attente') === '1') {
    if (!EN_ATTENTE.includes(cle)) return json({ erreur: 'Contenu inconnu.' }, 400);
    return json({ data: await lireContenu(env.DB, cle + '_attente') });
  }
  if (!AUTORISES.includes(cle)) return json({ erreur: 'Contenu inconnu.' }, 400);
  return json({ data: await lireContenu(env.DB, cle) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  let b;
  try { b = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  if (!(await admin(env, request, b && b.cle))) return json({ erreur: 'Réservé à l\'administrateur.' }, 403);
  if (new URL(request.url).searchParams.get('attente') === '1') {
    if (!EN_ATTENTE.includes(b.cle) || b.cle === 'quinte' || b.cle === 'cpc') return json({ erreur: 'Contenu inconnu.' }, 400);
    if (JSON.stringify(b.data || {}).length > 200000) return json({ erreur: 'Trop volumineux.' }, 400);
    if (/^hippo_et/.test(b.cle) && b.data && !b.data.date) { const q = await lireContenu(env.DB, 'quinte_attente'); if (q && q.date) b.data.date = q.date; }
    await ecrireContenu(env.DB, b.cle + '_attente', b.data || {});
    return json({ ok: true, attente: true });
  }
  const historique = /^(tickets|quinte|cpc|fanny|coeurs)-\d{4}-\d{2}-\d{2}$/.test(b.cle || '');
  if (!AUTORISES.includes(b.cle) && !historique) return json({ erreur: 'Contenu inconnu.' }, 400);
  if (JSON.stringify(b.data || {}).length > (b.cle === 'cpc_archive' ? 1500000 : 200000)) return json({ erreur: 'Trop volumineux.' }, 400);
  // une étude publiée porte la date du Quinté+ en ligne
  if (/^hippo_et/.test(b.cle) && b.data && !b.data.date) { const q = await lireContenu(env.DB, 'quinte'); if (q && q.date) b.data.date = q.date; }
  await ecrireContenu(env.DB, b.cle, b.data || {});
  // les tickets publiés sont aussi gardés par date, pour les bilans
  if (b.cle === 'tickets' && b.data && /^\d{2}\/\d{2}\/\d{4}$/.test(b.data.date || '')) {
    await ecrireContenu(env.DB, 'tickets-' + b.data.date.split('/').reverse().join('-'), b.data);
  }
  if ((b.cle === 'fanny' || b.cle === 'coeurs') && b.data && /^\d{2}\/\d{2}\/\d{4}$/.test(b.data.date || '')) {
    await ecrireContenu(env.DB, b.cle + '-' + b.data.date.split('/').reverse().join('-'), b.data);
  }
  return json({ ok: true });
}
