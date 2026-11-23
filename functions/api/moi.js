import { json, initDb, currentUser, noDb } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return noDb();
  await initDb(env.DB);
  const u = await currentUser(env.DB, request);
  return u ? json({ connecte: true, ...u }) : json({ connecte: false });
}
