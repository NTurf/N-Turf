import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { cache, preparer } from '../../_pmu.js';

// Nos lives : la liste (lives.json) et, pour chacun, s'il est en direct sur TikTok (vérifié toutes les 3 minutes au plus).
// TikTok ne donne pas d'accès officiel : on lit sa page « live ». Si TikTok bloque, le voyant reste simplement éteint.
async function enDirect(pseudo) {
  try {
    const r = await fetch(`https://www.tiktok.com/@${encodeURIComponent(pseudo)}/live`, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'accept-language': 'fr-FR,fr;q=0.9' },
      redirect: 'follow',
    });
    if (!r.ok) return { live: false, sur: false };
    const t = await r.text();
    const m = t.match(/"liveRoom"\s*:\s*\{[\s\S]{0,4000}?"status"\s*:\s*(\d+)/) || t.match(/"roomInfo"[\s\S]{0,4000}?"status"\s*:\s*(\d+)/);
    if (m) return { live: m[1] === '2', sur: true };
    return { live: false, sur: false };
  } catch { return { live: false, sur: false }; }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB); await preparer(env.DB);
  const u = await currentUser(env.DB, request);
  if (!u) return json({ erreur: 'Connectez-vous pour voir cette page.' }, 401);
  let liste = [];
  try { const r = await env.ASSETS.fetch(new URL('/lives.json', request.url)); liste = await r.json(); } catch { liste = []; }
  const out = [];
  for (const p of liste) {
    const st = await cache(env.DB, 'tiktok-' + p.tiktok, 180, () => enDirect(p.tiktok));
    out.push({ ...p, live: !!(st && st.live) });
  }
  return json({ lives: out });
}
