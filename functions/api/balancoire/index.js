import { entrer, json } from './_commun.js';
import { auj, programme, calculerJour, depart, completerJour } from '../../_balancoire.js';

// La journée de La Balançoire : cagnottes, jeux de chacun, retours. /api/balancoire?date=2026-11-27
export async function onRequestGet({ request, env }) {
  const x = await entrer(request, env); if (x.refus) return x.refus;
  const { db, u, a } = x;
  const q = new URL(request.url).searchParams.get('date');
  const today = auj();
  // On calcule d'abord ce qui peut l'être (jours encore ouverts jusqu'à aujourd'hui)
  const ouverts = ((await db.prepare("SELECT date FROM bal_jours WHERE statut = 'ouvert' AND date <= ? ORDER BY date DESC LIMIT 3").bind(today).all()).results || []).map((r) => r.date);
  const P = {};
  for (const d of ouverts) { try { P[d] = await programme(db, d); await calculerJour(db, d, P[d]); } catch (e) {} }
  try { await completerJour(db, today); } catch (e) {}
  const jours = ((await db.prepare('SELECT DISTINCT date FROM bal_etat ORDER BY date DESC').all()).results || []).map((r) => r.date);
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(q || '') ? q : today;
  if (!P[iso] && iso >= today) { try { P[iso] = await programme(db, iso); } catch (e) { P[iso] = []; } }
  const joueurs = (await db.prepare('SELECT j.id, j.nom, j.actif, u.pseudo FROM bal_joueurs j LEFT JOIN users u ON u.id = j.user_id ORDER BY j.nom').all()).results || [];
  const etat = (await db.prepare('SELECT * FROM bal_etat WHERE date = ?').bind(iso).all()).results || [];
  const jeux = (await db.prepare('SELECT id, joueur_id, type, r, c, n1, c2, n2, mise, retour, detail, auto, saisi FROM bal_jeux WHERE date = ? ORDER BY joueur_id, id').bind(iso).all()).results || [];
  const jr = await db.prepare('SELECT statut, texte FROM bal_jours WHERE date = ?').bind(iso).first();
  const prog = P[iso] || [];
  const now = Date.now();
  // heure de verrouillage de la feuille de chaque joueur : départ de sa première course
  const verrou = {};
  jeux.forEach((j) => { const h = depart(prog, j); if (h && (!verrou[j.joueur_id] || h < verrou[j.joueur_id])) verrou[j.joueur_id] = h; });
  const dernier = a.admin && !etat.length ? await db.prepare('SELECT date FROM bal_etat WHERE date < ? ORDER BY date DESC LIMIT 1').bind(iso).first() : null;
  return json({
    date: iso, aujourdhui: today, maintenant: now, admin: a.admin, moi: a.joueur ? a.joueur.id : null,
    statut: jr ? jr.statut : (etat.length ? 'ouvert' : 'vide'), texte: jr ? jr.texte : null,
    jours, joueurs, etat, jeux, verrou, programme: iso >= today ? prog : prog.map((r) => ({ r: r.r, h: r.h, courses: [] })),
    // pour l'administrateur : la dernière journée connue, pour préremplir les cagnottes d'un jour sans suite
    dernier, prevEtat: dernier ? ((await db.prepare('SELECT * FROM bal_etat WHERE date = ?').bind(dernier.date).all()).results || []) : [],
  });
}
