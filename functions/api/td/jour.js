import { json, initDb, currentUser, lireContenu, noDb } from '../../_auth.js';
import { BASE, lotCache } from '../../_pmu.js';
import { initTd, contributeur, programme, resoudre, auj, CHARTE, PARIS, extrasResultats } from '../../_td.js';

// Le Ticket du jour d'une date : programme (réunions, courses), publications de chaque contributeur, résultats
export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initTd(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Réservé aux membres.' }, 401);
  const q = new URL(request.url).searchParams.get('date');
  const today = auj(), iso = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : today;
  let P = [], erreurPmu = false;
  try { P = await programme(db, iso); } catch (e) { erreurPmu = true; }
  try { await resoudre(db, iso, P); } catch (e) {}
  const admin = u.role === 'admin';
  const pubs = (await db.prepare(`SELECT id, r, c, hippodrome, course, auteur_id, signature, type, chevaux, ticket, cout, joue, commentaire, cree, supprime, motif, resultat
    FROM td_pubs WHERE date = ? ${admin ? '' : 'AND supprime = 0'} ORDER BY r, c, id`).bind(iso).all()).results || [];
  const avecPubs = new Set(pubs.map((p) => p.r));
  // le nom des chevaux de chaque course où il y a une publication (affiché à côté des numéros)
  const noms = {};
  try {
    const d = iso.split('-').reverse().join(''), cles = [...new Set(pubs.map((p) => `${p.r}-${p.c}`))];
    const L = await lotCache(db, cles.map((k) => { const [r, c] = k.split('-'); return { cle: `tdpart-${d}-R${r}C${c}`, url: `${BASE}/${d}/R${r}/C${c}/participants`, ttl: () => 3600 }; }));
    for (const k of cles) { const [r, c] = k.split('-'), x = L.get(`tdpart-${d}-R${r}C${c}`), o = {}; for (const h of (x && x.participants) || []) o[h.numPmu] = h.nom; noms[k] = o; }
  } catch (e) {}
  const jours = ((await db.prepare('SELECT DISTINCT date FROM td_pubs WHERE supprime = 0 ORDER BY date DESC LIMIT 120').all()).results || []).map((x) => x.date);
  if (!jours.includes(today)) jours.unshift(today);
  const anciens = (await lireContenu(db, 'tickets-' + iso)) || null; // tickets N-TURF du Quinté+ (fichier)
  // cheval du jour, reports et texte publiés avec les tickets (Administration > Tickets du jour)
  let extras = null; try { extras = anciens ? await extrasResultats(db, iso, anciens.extras) : null; } catch (e) { extras = null; }
  const c = await contributeur(db, u);
  return json({
    date: iso, aujourdhui: today, maintenant: Date.now(), erreurPmu, jours, charte: CHARTE, parisTous: PARIS,
    moi: { id: u.id, admin, contributeur: c ? { signature: c.signature, droits: c.droits, accepte: !!c.accepte } : null },
    reunions: P.filter((r) => r.france || avecPubs.has(r.r)),
    pubs: pubs.map((p) => ({ ...p, noms: noms[`${p.r}-${p.c}`] || {}, chevaux: p.chevaux ? JSON.parse(p.chevaux) : null, ticket: p.ticket ? JSON.parse(p.ticket) : null, resultat: p.resultat ? JSON.parse(p.resultat) : null, moi: p.auteur_id === u.id })),
    anciens: anciens && anciens.tickets && anciens.tickets.length ? anciens : null,
    extras,
  });
}
