import { entrer } from './api/balancoire/_commun.js';
import PAGE from './_balancoire_page.js';
// La page de La Balançoire n'existe que pour ses joueurs (et l'administrateur) ; pour tous les autres : page introuvable
export async function onRequestGet({ request, env }) {
  const x = await entrer(request, env); if (x.refus) return x.refus;
  return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
