import { json, initDb, currentUser, peutPublier, ecrireContenu, noDb } from '../../_auth.js';

// Enregistre une image des pages Hippodrome (administrateur seulement)
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  if (!peutPublier(u)) return json({ erreur: 'Réservé à l\'administration.' }, 403);
  let b;
  try { b = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  const g = ['quinte', 'pick5', 'etquinte', 'etr1', 'etout', 'ettrot'].includes(b.g) ? b.g : null;
  if (!g) return json({ erreur: 'Rubrique inconnue.' }, 400);
  const i = parseInt(b.i, 10);
  if (!(i >= 0 && i < 40)) return json({ erreur: 'Numéro d\'image invalide.' }, 400);
  if (typeof b.data !== 'string' || !b.data.startsWith('data:image/jpeg;base64,')) return json({ erreur: 'Image invalide.' }, 400);
  if (b.data.length > 1400000) return json({ erreur: 'Image trop lourde.' }, 400);
  const att = new URL(request.url).searchParams.get('attente') === '1';
  await ecrireContenu(env.DB, (att ? 'hippo-img-att-' : 'hippo-img-') + g + '-' + i, { data: b.data });
  return json({ ok: true });
}
