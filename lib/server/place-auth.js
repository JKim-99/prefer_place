import { sessionToken } from './auth.js';
export async function currentUser(request, db) {
  const token = await sessionToken(request); if (!token) return null;
  return db.prepare('SELECT users.id FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.token_hash = ? AND sessions.expires_at > ?').bind(token, Math.floor(Date.now()/1000)).first();
}
