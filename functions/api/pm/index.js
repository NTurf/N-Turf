import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { preparer } from '../../_pmu.js';
import { prepPm, coursePm, JEUX, MIN_CHEVAUX } from '../../_pm.js';

// Pronos des membres
// GET ?jour=AAAA-MM-JJ                 : nombre de pronos par course
// GET ?jour=…&r=1&c=3                  : la course (partants, arrivée) et tous ses pronos, avec réactions
// GET ?classement=mois|tout            : bilan des membres
// POST {jour, r, c, chevaux:[{n,b}], jeu, mot} : publier / modifier mon prono (jusqu'au départ)
// POST {action:'supprimer', id} · {action:'reagir', id, texte} · {action:'retirerReaction', id}
const isoOk = (j) => /^\d{4}-\d{2}-\d{2}$/.test(j || '');

async function base(env, request) {
  if (!env.DB) return { err: noDb() };
  const db = env.DB; await initDb(db); await preparer(db); await prepPm(db);
  const u = await currentUser(db, request);
  if (!u) return { err: json({ erreur: 'Connectez-vous pour voir les pronos des membres.' }, 401) };
  return { db, u };
}

export async function onRequestGet({ request, env }) {
  const { err, db, u } = await base(env, request); if (err) return err;
  const q = new URL(request.url).searchParams;
  if (q.get('classement')) {
    const mois = q.get('classement') === 'mois' ? new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }).slice(0, 7) : null;
    const r = await db.prepare(`SELECT u.pseudo, COUNT(*) AS n, SUM(CASE WHEN p.gains > 0 THEN 1 ELSE 0 END) AS gagnes, SUM(p.mise) AS mise, SUM(p.gains) AS gains
      FROM pm_pronos p JOIN users u ON u.id = p.user_id WHERE p.statut = 'calcule' AND u.banni = 0 ${mois ? 'AND substr(p.jour, 1, 7) = ?' : ''}
      GROUP BY p.user_id ORDER BY (SUM(p.gains) - SUM(p.mise)) DESC`).bind(...(mois ? [mois] : [])).all();
    return json({ classement: (r.results || []).map((x) => ({ pseudo: x.pseudo, n: x.n, gagnes: x.gagnes, mise: Math.round(x.mise * 100) / 100, gains: Math.round(x.gains * 100) / 100, net: Math.round((x.gains - x.mise) * 100) / 100 })) });
  }
  const jour = q.get('jour');
  if (!isoOk(jour)) return json({ erreur: 'Jour invalide.' }, 400);
  const R = +q.get('r'), C = +q.get('c');
  if (!R || !C) {
    const r = await db.prepare('SELECT reunion, course, COUNT(*) AS n FROM pm_pronos WHERE jour = ? GROUP BY reunion, course').bind(jour).all();
    return json({ comptes: (r.results || []).map((x) => ({ r: x.reunion, c: x.course, n: x.n })) });
  }
  let info = null;
  try { info = await coursePm(db, jour, R, C); } catch (e) { info = null; }
  const pr = await db.prepare(`SELECT p.id, p.user_id, u.pseudo, u.role, u.moderateur, p.chevaux, p.jeu, p.mot, p.statut, p.mise, p.gains, p.detail, p.cree
    FROM pm_pronos p JOIN users u ON u.id = p.user_id WHERE p.jour = ? AND p.reunion = ? AND p.course = ? AND u.banni = 0 ORDER BY p.cree`).bind(jour, R, C).all();
  const L = pr.results || [];
  const reac = L.length ? await db.prepare(`SELECT r.id, r.prono_id, r.user_id, u.pseudo, r.texte, r.cree FROM pm_reactions r JOIN users u ON u.id = r.user_id
    WHERE r.prono_id IN (${L.map(() => '?').join(',')}) AND u.banni = 0 ORDER BY r.id`).bind(...L.map((x) => x.id)).all() : { results: [] };
  const modo = u.role === 'admin' || u.moderateur;
  return json({
    course: info, moi: u.pseudo, modo,
    ouvert: !!(info && info.heure && Date.now() < info.heure && !(info.arrivee || []).length),
    pronos: L.map((p) => ({
      id: p.id, pseudo: p.pseudo, moi: p.user_id === u.id, modoAuteur: p.role === 'admin' || !!p.moderateur,
      chevaux: JSON.parse(p.chevaux), jeu: p.jeu, jeuNom: JEUX[p.jeu], mot: p.mot || '', statut: p.statut,
      mise: p.mise, gains: p.gains, detail: p.detail ? JSON.parse(p.detail) : [],
      reactions: (reac.results || []).filter((r) => r.prono_id === p.id).map((r) => ({ id: r.id, pseudo: r.pseudo, texte: r.texte, cree: r.cree, moi: r.user_id === u.id })),
    })),
  });
}

export async function onRequestPost({ request, env }) {
  const { err, db, u } = await base(env, request); if (err) return err;
  let b; try { b = await request.json(); } catch { return json({ erreur: 'Données illisibles.' }, 400); }
  const modo = u.role === 'admin' || u.moderateur;
  if (b.action === 'supprimer') {
    const p = await db.prepare('SELECT user_id, statut FROM pm_pronos WHERE id = ?').bind(+b.id || 0).first();
    if (!p || (p.user_id !== u.id && !modo)) return json({ erreur: 'Prono introuvable.' }, 404);
    if (p.user_id === u.id && !modo && p.statut !== 'attente') return json({ erreur: 'La course est courue : le prono reste visible.' }, 403);
    await db.batch([db.prepare('DELETE FROM pm_reactions WHERE prono_id = ?').bind(+b.id), db.prepare('DELETE FROM pm_pronos WHERE id = ?').bind(+b.id)]);
    return json({ ok: true });
  }
  if (b.action === 'reagir') {
    const t = String(b.texte || '').trim().slice(0, 500);
    if (!t) return json({ erreur: 'Message vide.' }, 400);
    const p = await db.prepare('SELECT id FROM pm_pronos WHERE id = ?').bind(+b.id || 0).first();
    if (!p) return json({ erreur: 'Prono introuvable.' }, 404);
    await db.prepare('INSERT INTO pm_reactions (prono_id, user_id, texte) VALUES (?, ?, ?)').bind(p.id, u.id, t).run();
    return json({ ok: true });
  }
  if (b.action === 'retirerReaction') {
    const r = await db.prepare('SELECT user_id FROM pm_reactions WHERE id = ?').bind(+b.id || 0).first();
    if (!r || (r.user_id !== u.id && !modo)) return json({ erreur: 'Réaction introuvable.' }, 404);
    await db.prepare('DELETE FROM pm_reactions WHERE id = ?').bind(+b.id).run();
    return json({ ok: true });
  }
  const jour = String(b.jour || ''), R = +b.r, C = +b.c, jeu = String(b.jeu || '');
  if (!isoOk(jour) || !R || !C) return json({ erreur: 'Course invalide.' }, 400);
  if (!JEUX[jeu]) return json({ erreur: 'Choisis ton jeu : Simple, Couplé, Trio ou Multi.' }, 400);
  const info = await coursePm(db, jour, R, C);
  if (!info) return json({ erreur: 'Course introuvable au programme.' }, 404);
  if (!info.heure || Date.now() >= info.heure || (info.arrivee || []).length) return json({ erreur: 'Trop tard : la course est partie.' }, 403);
  const ok = new Set(info.partants.filter((p) => !p.np).map((p) => p.n));
  const ch = []; const vus = new Set();
  for (const x of Array.isArray(b.chevaux) ? b.chevaux : []) { const n = +x.n; if (ok.has(n) && !vus.has(n)) { vus.add(n); ch.push({ n, b: x.b ? 1 : 0 }); } }
  if (ch.length > 4) return json({ erreur: '4 chevaux au maximum.' }, 400);
  if (ch.length < MIN_CHEVAUX[jeu]) return json({ erreur: `Il faut au moins ${MIN_CHEVAUX[jeu]} cheval${MIN_CHEVAUX[jeu] > 1 ? 'aux' : ''} pour le ${JEUX[jeu]}.` }, 400);
  if (jeu === 'multi' && ch.length !== 4) return json({ erreur: 'Le Multi en 4 se joue avec 4 chevaux.' }, 400);
  ch.sort((a, b2) => b2.b - a.b);
  const mot = String(b.mot || '').trim().slice(0, 500);
  await db.prepare(`INSERT INTO pm_pronos (jour, reunion, course, hippo, user_id, chevaux, jeu, mot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(jour, reunion, course, user_id) DO UPDATE SET chevaux = excluded.chevaux, jeu = excluded.jeu, mot = excluded.mot, cree = datetime('now')`)
    .bind(jour, R, C, info.hippo, u.id, JSON.stringify(ch), jeu, mot).run();
  return json({ ok: true });
}
