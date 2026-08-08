import { applyCors } from './_cors.js';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const readBoolean = (...keys) => {
  const raw = readEnv(...keys);
  if (!raw) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  return json(res, 200, {
    force_update_enabled: readBoolean('FORCE_UPDATE_ENABLED'),
    min_supported_version: readEnv('MIN_SUPPORTED_VERSION') || '0.0.0',
    latest_version: readEnv('LATEST_APP_VERSION') || null,
    update_url: readEnv('UPDATE_URL') || null,
    update_message: readEnv('UPDATE_MESSAGE') || 'A newer Rizz Master build is required to continue.',
  });
}
