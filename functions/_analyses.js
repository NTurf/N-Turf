import { currentUser, peutPublier } from './_auth.js';

// Analyses texte des pronostiqueurs (TikTokeurs). Les auteurs possibles sont fixés ici.
export const AUTEURS = ["L'Oeil du Trot", 'Turfiste.com', 'Fanny la Dynamite'];

export async function prepAnalyses(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, jour TEXT NOT NULL, auteur TEXT NOT NULL,
      hippo TEXT NOT NULL, course TEXT NOT NULL, texte TEXT NOT NULL,
      par INTEGER, cree TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare('CREATE INDEX IF NOT EXISTS analyses_jour ON analyses (jour)'),
    db.prepare('CREATE TABLE IF NOT EXISTS analystes (user_id INTEGER PRIMARY KEY, auteur TEXT NOT NULL)'),
  ]);
  try { await db.prepare('ALTER TABLE analyses ADD COLUMN html INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* déjà là */ }
}

// Toutes les rubriques : les auteurs fixes + celles des membres à qui Bruno a donné le droit (à leur pseudo)
export async function listeAuteurs(db) {
  const r = await db.prepare('SELECT DISTINCT auteur FROM analystes').all();
  const out = AUTEURS.slice();
  (r.results || []).forEach((x) => { if (x.auteur && !out.includes(x.auteur)) out.push(x.auteur); });
  return out;
}

// Rubrique choisie dans l'administration : '__pseudo__' = rubrique au pseudo du membre, sinon un auteur fixe
export function rubriqueChoisie(valeur, pseudo) {
  if (valeur === '__pseudo__') return String(pseudo || '').trim() || null;
  return AUTEURS.includes(valeur) ? valeur : null;
}

// Qui peut écrire, et au nom de qui : l'administration pour tous, un analyste seulement pour lui-même
export async function droitsAnalyse(db, request) {
  const u = await currentUser(db, request);
  if (!u) return null;
  if (peutPublier(u)) return { u, auteurs: await listeAuteurs(db), admin: true };
  const r = await db.prepare('SELECT auteur FROM analystes WHERE user_id = ?').bind(u.id).first();
  return r ? { u, auteurs: [r.auteur], admin: false } : null;
}

// Mise en forme des analyses : on ne garde que quelques balises sûres (gras, italique, souligné, couleurs, surligné, listes, titres)
const BALISES = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'span', 'font', 'mark', 'ul', 'ol', 'li', 'h3', 'h4']);
const PROPS = new Set(['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line']);
function nettoyerStyle(st) {
  return String(st || '').split(';').map((d) => {
    const i = d.indexOf(':'); if (i < 0) return '';
    const p = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
    if (!PROPS.has(p) || !/^[#a-z0-9(),.\s%-]{1,40}$/i.test(v) || /url|expression|var\(/i.test(v)) return '';
    return p + ': ' + v;
  }).filter(Boolean).join('; ');
}
export function nettoyerHtml(html) {
  const s = String(html || '').slice(0, 60000);
  let out = '', last = 0;
  const re = /<(\/?)([a-z0-9]+)((?:\s[^<>]*)?)\/?>/gi;
  let m;
  const texte = (t) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  while ((m = re.exec(s))) {
    out += texte(s.slice(last, m.index)); last = re.lastIndex;
    let t = m[2].toLowerCase(); const fin = m[1] === '/';
    if (!BALISES.has(t)) continue;
    if (t === 'font') t = 'span';
    if (fin) { if (t !== 'br') out += '</' + t + '>'; continue; }
    let attr = '';
    const st = (m[3].match(/style\s*=\s*"([^"]*)"/i) || m[3].match(/style\s*=\s*'([^']*)'/i) || [])[1];
    let style = st ? nettoyerStyle(st) : '';
    const col = (m[3].match(/color\s*=\s*"?(#[0-9a-f]{3,6}|[a-z]+)"?/i) || [])[1];
    if (m[2].toLowerCase() === 'font' && col) style = 'color: ' + col + (style ? '; ' + style : '');
    if (style) attr = ' style="' + style.replace(/"/g, '') + '"';
    out += '<' + t + attr + '>';
  }
  out += texte(s.slice(last));
  return out;
}
