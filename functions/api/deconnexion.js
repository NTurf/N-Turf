import { json, initDb, endSession, noDb } from '../_auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const cookie = await endSession(env.DB, request);
  return json({ ok: true }, 200, { 'set-cookie': cookie });
}
