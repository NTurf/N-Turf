// Le Journal N-TURF : billets écrits par les rédacteurs autorisés, publiés après validation de l'administrateur
export async function prepJournal(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS billets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, titre TEXT NOT NULL, texte TEXT NOT NULL,
      auteur_id INTEGER NOT NULL, statut TEXT NOT NULL DEFAULT 'attente',
      cree TEXT NOT NULL DEFAULT (datetime('now')), modifie TEXT, publie_le TEXT)`),
    db.prepare('CREATE INDEX IF NOT EXISTS billets_statut ON billets (statut, publie_le)'),
  ]);
}

export function slug(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'billet';
}
export const lienBillet = (b) => `/journal/${b.id}-${slug(b.titre)}`;

// Extrait en texte simple (pour l'accueil et Google)
export function extrait(html, n = 220) {
  const t = String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li|h3|h4)>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
}

export async function billetsPublies(db, limite = 200) {
  const r = await db.prepare(`SELECT b.id, b.titre, b.texte, b.publie_le, u.pseudo AS auteur FROM billets b JOIN users u ON u.id = b.auteur_id WHERE b.statut = 'publie' ORDER BY b.publie_le DESC, b.id DESC LIMIT ?`).bind(limite).all();
  return r.results || [];
}
