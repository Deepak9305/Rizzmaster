import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin, supabaseServiceKey } from './_supabase.js';

const cookieName = 'rizz_web_guest';

export function getWebGuest(req, res, canCreate) {
  if (!supabaseServiceKey) return null;
  const sign = id => createHmac('sha256', supabaseServiceKey)
    .update(`${cookieName}:${id}`).digest('hex');
  const cookie = String(req.headers.cookie || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(`${cookieName}=`));
  const [id, signature] = (cookie?.slice(cookieName.length + 1) || '').split('.');
  if (/^[0-9a-f-]{36}$/.test(id) && /^[0-9a-f]{64}$/.test(signature || '') &&
      timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(id), 'hex'))) return id;
  if (!canCreate) return null;
  const guest = randomUUID();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=${guest}.${sign(guest)}; Path=/api/ai; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
  return guest;
}

export function webCredits(account, guest, day, delta) {
  return supabaseAdmin.rpc('web_daily_credits', {
    p_account: account, p_guest: guest, p_day: day, p_delta: delta,
  });
}
