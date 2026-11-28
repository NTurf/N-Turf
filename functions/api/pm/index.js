import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { preparer } from '../../_pmu.js';
import { initConcours, miseDu } from '../../_concours.js';
import { prepPm, coursePm, construire, choixDepuisParis, resume, verifierEnAttente, ORDRE_TYPES } from '../../_pm.js';

// Pronos des membres
// GET ?jour=AAAA-MM-JJ                 : nombre de pronos par course
// GET ?jour=…&r=1&c=3                  : la course (partants, arrivée) et tous ses pronos, avec réactions
// GET ?classement=mois|tout            : bilan des membres, chacun détaillé jeu par jeu (+ mon bilan)
// GET ?fiche=pseudo&jour=…         : fiche du jour d'un membre (tous ses jeux du jour, résultat et bilan)
// GET ?bilan=pseudo                    : bilan d'un membre jeu par jeu (ce mois-ci et depuis le début), pour sa fiche
// POST {jour, r, c, chevaux:[n…], choix:{s,c,t,m}, mot} : publier / modifier mon prono (jusqu'au départ)
// POST {action:'supprimer', id} · {action:'reagir', id, texte} · {action:'retirerReaction', id}
const isoOk = (j) => /^\d{4}-\d{2}-\d{2}$/.test(j || '');
// Synthèse des pronos des membres sur une course : chaque membre donne 4 points à son 1er cheval, 3 au 2e, 2 au 3e, 1 au 4e
function synthese(rows) {
  const T = new Map();
  for (const p of rows) {
    let L = []; try { L = JSON.parse(p.chevaux || '[]').map((x) => (typeof x === 'object' ? +x.n : +x)); } catch (e) { L = []; }
    L.slice(0, 4).forEach((n, i) => { if (!n) return; const x = T.get(n) || { n, nb: 0, pts: 0, premier: 0 }; x.nb++; x.pts += 4 - i; if (!i) x.premier++; T.set(n, x); });
  }
  return { membres: rows.length, chevaux: [...T.values()].sort((a, b) => b.pts - a.pts || b.nb - a.nb || b.premier - a.premier || a.n - b.n) };
}

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
  const moisCourant = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }).slice(0, 7);
  const R2 = (v) => Math.round(v * 100) / 100;
  // bilan d'un membre, pari par pari, regroupé par type de jeu
  // période : null (tout), 'AAAA-MM' (un mois) ou { du, au } (dates AAAA-MM-JJ incluses)
  const filtre = (per) => !per ? ['', []] : typeof per === 'string' ? ['AND substr(jour, 1, 7) = ?', [per]] : ['AND jour BETWEEN ? AND ?', [per.du, per.au]];
  async function bilan(uid, mois) {
    const [fw, fb] = filtre(mois);
    const m = await db.prepare(`SELECT detail FROM pm_pronos WHERE user_id = ? AND statut = 'calcule' ${fw}`).bind(uid, ...fb).all();
    const T = {};
    for (const x of m.results || []) {
      let d = []; try { d = JSON.parse(x.detail || '[]'); } catch (e) { d = []; }
      for (const p of Array.isArray(d) ? d : []) {
        if (!p || !p.t || p.np) continue;
        const k = T[p.t] || (T[p.t] = { t: p.t, paris: 0, gagnes: 0, mise: 0, gains: 0 });
        k.paris++; k.mise += 1; k.gains += Number(p.r) || 0; if (p.r > 0) k.gagnes++;
      }
    }
    return { pronos: (m.results || []).length, types: ORDRE_TYPES.filter((t) => T[t]).map((t) => ({ ...T[t], gains: R2(T[t].gains), net: R2(T[t].gains - T[t].mise) })) };
  }
  // Stats des autres membres : réservées à ceux qui ont donné au moins 3 pronos aujourd'hui (admin et modérateurs toujours)
  const MIN_JOUR = 3;
  async function acces() {
    const auj = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM pm_pronos WHERE user_id = ? AND jour = ?').bind(u.id, auj).first()).n || 0;
    return { ok: u.role === 'admin' || !!u.moderateur || n >= MIN_JOUR, n, min: MIN_JOUR };
  }
  if (q.get('bilan')) {
    await verifierEnAttente(db);
    const ac = await acces();
    const m = await db.prepare('SELECT id, pseudo FROM users WHERE pseudo = ? COLLATE NOCASE AND banni = 0').bind(q.get('bilan')).first();
    if (!m) return json({ erreur: 'Membre introuvable.' }, 404);
    if (m.id !== u.id && !ac.ok) return json({ pseudo: m.pseudo, verrou: ac });
    return json({ pseudo: m.pseudo, mois: await bilan(m.id, moisCourant()), tout: await bilan(m.id, null) });
  }
  // Fiche du jour d'un membre : tous ses jeux de la journée, course par course, et le bilan du jour
  // (la sienne toujours ; celle des autres réservée à ceux qui participent : 3 pronos par jour)
  if (q.get('fiche')) {
    const jour = isoOk(q.get('jour')) ? q.get('jour') : new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const m = await db.prepare('SELECT id, pseudo, role, moderateur FROM users WHERE pseudo = ? COLLATE NOCASE AND banni = 0').bind(q.get('fiche')).first();
    if (!m) return json({ erreur: 'Membre introuvable.' }, 404);
    const ac = await acces(), soi = m.id === u.id, chef = u.role === 'admin' || !!u.moderateur;
    // les onglets : tous les membres qui ont joué ce jour-là (course par course si on participe, concours si on l'a joué)
    let joueurs = [u.pseudo];
    try {
      const L = [];
      if (ac.ok) L.push(...((await db.prepare("SELECT DISTINCT u.pseudo FROM pm_pronos p JOIN users u ON u.id = p.user_id WHERE p.jour = ? AND u.banni = 0").bind(jour).all()).results || []).map((x) => x.pseudo));
      await initConcours(db);
      const jc = u.role === 'admin' || !!(await db.prepare('SELECT 1 FROM concours_pronos WHERE date = ? AND user_id = ?').bind(jour, u.id).first());
      if (jc) L.push(...((await db.prepare("SELECT u.pseudo FROM concours_pronos p JOIN users u ON u.id = p.user_id WHERE p.date = ? AND u.banni = 0 AND u.role != 'robot'").bind(jour).all()).results || []).map((x) => x.pseudo));
      joueurs = [...new Set([u.pseudo, ...L])].sort((x, y) => (x === u.pseudo ? -1 : y === u.pseudo ? 1 : x.localeCompare(y, 'fr', { sensitivity: 'base' })));
    } catch (e) {}
    // le prono du concours Quinté+ de ce jour : visible par lui, et par ceux qui ont aussi joué le concours ce jour-là
    let concours = null;
    try {
      await initConcours(db);
      const cp = await db.prepare('SELECT chevaux, retenu, gains, detail FROM concours_pronos WHERE date = ? AND user_id = ?').bind(jour, m.id).first();
      if (cp) {
        const joue = soi || u.role === 'admin' || !!(await db.prepare('SELECT 1 FROM concours_pronos WHERE date = ? AND user_id = ?').bind(jour, u.id).first());
        if (!joue) concours = { verrou: true };
        else {
          const j = await db.prepare('SELECT reunion, course, hippodrome, libelle, heure, partants, arrivee, statut FROM concours_jours WHERE date = ?').bind(jour).first();
          const calc = j && j.statut === 'calcule', P = j ? JSON.parse(j.partants || '[]') : [], ch = JSON.parse(cp.chevaux || '[]');
          const noms = {}; for (const h of P) if (ch.includes(+h.n)) noms[h.n] = h.nom;
          concours = { r: j && j.reunion, c: j && j.course, hippo: j && j.hippodrome, libelle: j && j.libelle, heure: j && j.heure, arrivee: j ? JSON.parse(j.arrivee || '[]').slice(0, 5) : [],
            chevaux: ch, noms, calcule: !!calc, mise: miseDu(jour), gains: calc ? cp.gains || 0 : null, detail: calc && cp.detail ? JSON.parse(cp.detail) : [] };
        }
      }
    } catch (e) { concours = null; }
    // les jeux du course par course : réservés à ceux qui participent (3 pronos par jour)
    if (!soi && !ac.ok) return json({ pseudo: m.pseudo, jour, verrou: ac, concours, jeux: [], joueurs, moiPseudo: u.pseudo });
    const rows = (await db.prepare('SELECT id, reunion, course, hippo, chevaux, jeu, paris, mot, statut, mise, gains, detail FROM pm_pronos WHERE user_id = ? AND jour = ?').bind(m.id, jour).all()).results || [];
    const infos = await Promise.all(rows.map((p) => coursePm(db, jour, p.reunion, p.course).catch(() => null)));
    // un nouveau passage, une fois les courses calculées entre-temps
    const rows2 = (await db.prepare('SELECT id, statut, mise, gains, detail FROM pm_pronos WHERE user_id = ? AND jour = ?').bind(m.id, jour).all()).results || [];
    const maj = new Map(rows2.map((x) => [x.id, x]));
    const jeux = rows.map((p, i) => {
      const x = maj.get(p.id) || p, c = infos[i] || {};
      const chevaux = JSON.parse(p.chevaux || '[]').map((y) => (typeof y === 'object' ? +y.n : +y));
      const paris = p.paris ? JSON.parse(p.paris) : [];
      let detail = []; try { detail = x.detail ? JSON.parse(x.detail) : []; } catch (e) { detail = []; }
      const noms = {}; for (const h of c.partants || []) if (chevaux.includes(h.n)) noms[h.n] = h.nom;
      return { r: p.reunion, c: p.course, hippo: c.hippo || p.hippo || '', libelle: c.libelle || '', heure: c.heure || null, arrivee: (c.arrivee || []).slice(0, 5), definitive: !!c.definitive,
        chevaux, noms, paris, jeuNom: resume(paris, p.jeu), mot: p.mot || '', statut: x.statut, mise: x.mise, gains: x.gains,
        detail: Array.isArray(detail) ? detail.filter((y) => y && typeof y === 'object') : [] };
    }).sort((a, b) => (a.heure || 0) - (b.heure || 0) || a.r - b.r || a.c - b.c);
    return json({ pseudo: m.pseudo, modo: m.role === 'admin' || !!m.moderateur, moi: soi, jour, jeux, concours, joueurs, moiPseudo: u.pseudo });
  }
  if (q.get('classement')) {
    await verifierEnAttente(db);
    // Classements du jour, de la semaine (lundi-dimanche) et du mois, chacun repartant de zéro, plus « depuis le début ».
    // On classe selon ce que rapporte chaque euro misé (gains ÷ mises), à partir d'un nombre minimum de pronos sur la période :
    // en dessous, le membre est affiché à part, « pas encore classé » (sinon celui qui joue un seul prono et le gagne passerait premier).
    const auj = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const k = ['jour', 'semaine', 'mois', 'tout'].includes(q.get('classement')) ? q.get('classement') : 'mois';
    const lundi = (() => { const t = new Date(auj + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); })();
    const dimanche = (() => { const t = new Date(lundi + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 6); return t.toISOString().slice(0, 10); })();
    const per = k === 'jour' ? { du: auj, au: auj } : k === 'semaine' ? { du: lundi, au: dimanche } : k === 'mois' ? moisCourant() : null;
    const MIN = { jour: 3, semaine: 10, mois: 20, tout: 20 }[k];
    const ac = await acces();
    const info = { periode: k, du: per && per.du ? per.du : null, au: per && per.au ? per.au : null, min: MIN };
    if (!ac.ok) return json({ moiPseudo: u.pseudo, moi: (await bilan(u.id, per)).types, verrou: ac, classement: [], nonClasses: [], ...info });
    const [fw, fb] = filtre(per);
    const r = await db.prepare(`SELECT u.id, u.pseudo, COUNT(*) AS n, SUM(CASE WHEN p.gains > 0 THEN 1 ELSE 0 END) AS gagnes, SUM(p.mise) AS mise, SUM(p.gains) AS gains
      FROM pm_pronos p JOIN users u ON u.id = p.user_id WHERE p.statut = 'calcule' AND u.banni = 0 ${fw.replace(/jour/g, 'p.jour')}
      GROUP BY p.user_id`).bind(...fb).all();
    const L = r.results || [];
    const det = await Promise.all(L.map((x) => bilan(x.id, per)));
    const moi = (await bilan(u.id, per)).types;
    const tous = L.map((x, i) => ({ pseudo: x.pseudo, n: x.n, gagnes: x.gagnes, mise: R2(x.mise), gains: R2(x.gains), net: R2(x.gains - x.mise), rendu: x.mise > 0 ? R2(x.gains / x.mise) : 0, types: det[i].types }));
    const tri = (a, b) => b.rendu - a.rendu || b.mise - a.mise || b.net - a.net;
    return json({ moiPseudo: u.pseudo, moi, ...info,
      classement: tous.filter((x) => x.n >= MIN).sort(tri),
      nonClasses: tous.filter((x) => x.n < MIN).sort((a, b) => b.n - a.n || tri(a, b)) });
  }
  const jour = q.get('jour');
  if (!isoOk(jour)) return json({ erreur: 'Jour invalide.' }, 400);
  const R = +q.get('r'), C = +q.get('c');
  if (!R || !C) {
    await verifierEnAttente(db);
    const r = await db.prepare('SELECT reunion, course, COUNT(*) AS n FROM pm_pronos WHERE jour = ? GROUP BY reunion, course').bind(jour).all();
    const ac = await acces();
    const out = { comptes: (r.results || []).map((x) => ({ r: x.reunion, c: x.course, n: x.n })), acces: ac.ok };
    // la synthèse des membres, course par course : seulement pour ceux qui participent (3 pronos par jour)
    if (ac.ok) {
      const t = (await db.prepare('SELECT p.reunion, p.course, p.chevaux FROM pm_pronos p JOIN users u ON u.id = p.user_id WHERE p.jour = ? AND u.banni = 0').bind(jour).all()).results || [];
      const G = {}; for (const x of t) (G[x.reunion + '-' + x.course] = G[x.reunion + '-' + x.course] || []).push(x);
      out.syntheses = Object.fromEntries(Object.entries(G).map(([k, L]) => { const S = synthese(L); return [k, { membres: S.membres, top: S.chevaux.slice(0, 6).map((x) => x.n) }]; }));
    }
    return json(out);
  }
  let info = null;
  try { info = await coursePm(db, jour, R, C); } catch (e) { info = null; }
  const pr = await db.prepare(`SELECT p.id, p.user_id, u.pseudo, u.role, u.moderateur, p.chevaux, p.jeu, p.paris, p.mot, p.statut, p.mise, p.gains, p.detail, p.cree
    FROM pm_pronos p JOIN users u ON u.id = p.user_id WHERE p.jour = ? AND p.reunion = ? AND p.course = ? AND u.banni = 0 ORDER BY p.cree`).bind(jour, R, C).all();
  const ac = await acces();
  // pas 3 pronos aujourd'hui : il ne voit que le sien
  const L = (pr.results || []).filter((p) => ac.ok || p.user_id === u.id);
  const caches = (pr.results || []).length - L.length;
  const reac = L.length ? await db.prepare(`SELECT r.id, r.prono_id, r.user_id, u.pseudo, r.texte, r.cree FROM pm_reactions r JOIN users u ON u.id = r.user_id
    WHERE r.prono_id IN (${L.map(() => '?').join(',')}) AND u.banni = 0 ORDER BY r.id`).bind(...L.map((x) => x.id)).all() : { results: [] };
  const modo = u.role === 'admin' || u.moderateur;
  // synthèse de tous les pronos de la course (réservée à ceux qui participent), et les membres gagnants une fois la course calculée
  let synth = null;
  if (ac.ok && (pr.results || []).length) {
    synth = synthese(pr.results);
    synth.gagnants = (pr.results || []).filter((p) => p.statut === 'calcule' && (p.gains || 0) > (p.mise || 0))
      .map((p) => ({ pseudo: p.pseudo, mise: R2(p.mise || 0), gains: R2(p.gains || 0), net: R2((p.gains || 0) - (p.mise || 0)) })).sort((a, b) => b.net - a.net);
  }
  return json({
    course: info, moi: u.pseudo, modo, verrou: ac.ok ? null : { n: ac.n, min: ac.min, caches }, synthese: synth,
    ouvert: !!(info && info.heure && Date.now() < info.heure && !(info.arrivee || []).length),
    pronos: L.map((p) => {
      const chevaux = JSON.parse(p.chevaux).map((x) => (typeof x === 'object' ? +x.n : +x));
      const paris = p.paris ? JSON.parse(p.paris) : [];
      let detail = []; try { detail = p.detail ? JSON.parse(p.detail) : []; } catch (e) { detail = []; }
      return {
      id: p.id, pseudo: p.pseudo, moi: p.user_id === u.id, modoAuteur: p.role === 'admin' || !!p.moderateur,
      chevaux, paris, choix: choixDepuisParis(paris, chevaux), jeuNom: resume(paris, p.jeu), mot: p.mot || '', statut: p.statut,
      mise: p.mise, gains: p.gains, detail: Array.isArray(detail) ? detail.filter((x) => x && typeof x === 'object') : [],
      reactions: (reac.results || []).filter((r) => r.prono_id === p.id).map((r) => ({ id: r.id, pseudo: r.pseudo, texte: r.texte, cree: r.cree, moi: r.user_id === u.id })),
      };
    }),
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
  const jour = String(b.jour || ''), R = +b.r, C = +b.c;
  if (!isoOk(jour) || !R || !C) return json({ erreur: 'Course invalide.' }, 400);
  const info = await coursePm(db, jour, R, C);
  if (!info) return json({ erreur: 'Course introuvable au programme.' }, 404);
  if (!info.heure || Date.now() >= info.heure || (info.arrivee || []).length) return json({ erreur: 'Trop tard : la course est partie.' }, 403);
  const ok = new Set(info.partants.filter((p) => !p.np).map((p) => p.n));
  const ch = []; const vus = new Set();
  for (const x of Array.isArray(b.chevaux) ? b.chevaux : []) { const n = +(typeof x === 'object' && x ? x.n : x); if (ok.has(n) && !vus.has(n)) { vus.add(n); ch.push(n); } }
  if (!ch.length) return json({ erreur: 'Choisis au moins un cheval.' }, 400);
  if (ch.length > 4) return json({ erreur: '4 chevaux au maximum.' }, 400);
  const res = construire(b.choix || {}, ch, ok.size <= 7);
  if (res.erreur) return json({ erreur: res.erreur }, 400);
  const mot = String(b.mot || '').trim().slice(0, 500);
  await db.prepare(`INSERT INTO pm_pronos (jour, reunion, course, hippo, user_id, chevaux, jeu, paris, mot) VALUES (?, ?, ?, ?, ?, ?, 'perso', ?, ?)
    ON CONFLICT(jour, reunion, course, user_id) DO UPDATE SET chevaux = excluded.chevaux, jeu = excluded.jeu, paris = excluded.paris, mot = excluded.mot, statut = 'attente', essai = NULL, cree = datetime('now')`)
    .bind(jour, R, C, info.hippo, u.id, JSON.stringify(ch.map((n) => ({ n }))), JSON.stringify(res.paris), mot).run();
  return json({ ok: true, paris: res.paris.length });
}
