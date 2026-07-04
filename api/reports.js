import { applyCors } from './_cors.js';
import { getAuthenticatedUser, getBearerToken, supabase, supabaseAdmin } from './_supabase.js';

const LOGIN_REQUIRED_CODE = 'LOGIN_REQUIRED';
const SUPABASE_BACKEND_UNAVAILABLE_CODE = 'SUPABASE_BACKEND_UNAVAILABLE';
const REPORT_INVALID_CODE = 'INVALID_REPORT';
const REPORT_RATE_LIMITED_CODE = 'REPORT_RATE_LIMITED';
const REPORT_CONTENT_MAX_LENGTH = 4000;
const REPORT_TYPE_MAX_LENGTH = 64;
const REPORT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const REPORT_RATE_LIMIT_MAX_REQUESTS = 5;
const reportRateLimit = new Map();

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

const readString = (value, fallback = '') => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return fallback;
};

const parseJsonBody = (body) => {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error('Invalid JSON body.');
    }
  }

  if (!body || typeof body !== 'object') {
    return {};
  }

  return body;
};

const getRequestIp = (req) => {
  const forwardedFor = readString(req.headers['x-forwarded-for']);
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  const realIp = readString(req.headers['x-real-ip']);
  if (realIp) {
    return realIp;
  }

  return readString(req.socket?.remoteAddress || req.connection?.remoteAddress, 'unknown');
};

const consumeRateLimit = (key) => {
  const now = Date.now();
  const existing = reportRateLimit.get(key);
  const recentHits = Array.isArray(existing)
    ? existing.filter((timestamp) => now - timestamp < REPORT_RATE_LIMIT_WINDOW_MS)
    : [];

  if (recentHits.length >= REPORT_RATE_LIMIT_MAX_REQUESTS) {
    reportRateLimit.set(key, recentHits);
    return false;
  }

  recentHits.push(now);
  reportRateLimit.set(key, recentHits);
  return true;
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  if (!supabase || !supabaseAdmin) {
    return json(res, 503, {
      error: 'Supabase integration not configured on the server.',
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  let body;
  try {
    body = parseJsonBody(req.body);
  } catch (error) {
    return json(res, 400, {
      error: error instanceof Error ? error.message : 'Invalid request body.',
      code: REPORT_INVALID_CODE,
    });
  }

  const requestedUserId = body.user_id === null ? null : readString(body.user_id, null);
  const content = readString(body.content);
  const type = readString(body.type, 'content_report');

  let authUserId = null;
  if (requestedUserId !== null) {
    const token = getBearerToken(req);
    if (!token) {
      return json(res, 401, {
        error: 'Missing or invalid authorization header.',
        code: LOGIN_REQUIRED_CODE,
      });
    }

    const { user, error } = await getAuthenticatedUser(token);
    if (error || !user) {
      return json(res, 401, {
        error: 'Unauthorized. Invalid or expired session.',
        code: LOGIN_REQUIRED_CODE,
      });
    }

    authUserId = user.id;
  }

  if (!content) {
    return json(res, 400, {
      error: 'Report content is required.',
      code: REPORT_INVALID_CODE,
    });
  }

  if (content.length > REPORT_CONTENT_MAX_LENGTH) {
    return json(res, 400, {
      error: `Report content must be ${REPORT_CONTENT_MAX_LENGTH} characters or fewer.`,
      code: REPORT_INVALID_CODE,
    });
  }

  if (type.length > REPORT_TYPE_MAX_LENGTH) {
    return json(res, 400, {
      error: `Report type must be ${REPORT_TYPE_MAX_LENGTH} characters or fewer.`,
      code: REPORT_INVALID_CODE,
    });
  }

  const rateLimitKey = authUserId ? `user:${authUserId}` : `anon:${getRequestIp(req)}`;
  if (!consumeRateLimit(rateLimitKey)) {
    return json(res, 429, {
      error: 'Too many reports submitted. Please try again later.',
      code: REPORT_RATE_LIMITED_CODE,
    });
  }

  const { error: insertError } = await supabaseAdmin
    .from('reports')
    .insert({
      user_id: authUserId,
      content,
      type: type || 'content_report',
    });

  if (insertError) {
    console.error('[Reports API] Request failed:', insertError);
    return json(res, 500, { error: 'Report request failed.' });
  }

  return json(res, 200, { success: true });
}
