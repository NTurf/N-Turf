import { json, initDb, currentUser, lireContenu, noDb } from '../../_auth.js';
import { preparer } from '../../_pmu.js';
import { resultatsFanny } from '../../_fanny.js';

// Les repérés de Fanny du jour (ou d'une date), avec les arrivées du PMU
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await preparer(env.DB);
  if (!(await currentUser(env.DB, request))) return json({ erreur: 'Réservé aux membres.' }, 401);
  const q = new URL(request.url).searchParams.get('date');
  const f = await lireContenu(env.DB, /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? 'fanny-' + q : 'fanny');
  let out = f;
  try { out = await resultatsFanny(env.DB, f); } catch (e) {}
  return json({ fanny: out || null });
}
