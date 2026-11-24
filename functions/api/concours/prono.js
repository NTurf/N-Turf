import { json, initDb, currentUser, noDb } from '../../_auth.js';
import { initConcours, courseDuJour, jourConcours } from '../../_concours.js';

// Enregistre (ou modifie) le pronostic du jour : 8 chevaux classés, jusqu'à 5 minutes avant le départ
export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  const db = env.DB;
  await initDb(db); await initConcours(db);
  const u = await currentUser(db, request);
  if (!u) return json({ erreur: 'Réservé aux membres.' }, 401);
  let b; try { b = await request.json(); } catch (e) { return json({ erreur: 'Demande illisible.' }, 400); }
  const iso = await jourConcours(db);
  let j; try { j = await courseDuJour(db, iso); } catch (e) { return json({ erreur: 'Le programme du PMU ne répond pas, réessaie dans un instant.' }, 502); }
  if (!j) return json({ erreur: "Pas de Quinté+ trouvé aujourd'hui." }, 400);
  if (j.statut === 'calcule' || !j.heure || Date.now() > j.heure - 5 * 60000) return json({ erreur: 'Les pronostics sont fermés : ils se ferment 5 minutes avant le départ.' }, 400);
  const ch = (b.chevaux || []).map((x) => parseInt(x, 10));
  const partants = JSON.parse(j.partants || '[]').filter((p) => !p.np).map((p) => p.n);
  if (ch.length !== 8 || ch.some((x) => !partants.includes(x)) || new Set(ch).size !== 8) return json({ erreur: 'Il faut classer 8 chevaux différents, tous partants (pas de non-partant).' }, 400);
  await db.prepare(`INSERT INTO concours_pronos (date, user_id, chevaux, saisi) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(date, user_id) DO UPDATE SET chevaux = excluded.chevaux, saisi = excluded.saisi`).bind(iso, u.id, JSON.stringify(ch)).run();
  return json({ ok: true, chevaux: ch });
}
