import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApiServer } from './server/api/_http-server.js';

const loadEnvFile = (fileName) => {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
};

loadEnvFile('.env');
loadEnvFile('.env.local');
loadEnvFile('.env.development');
loadEnvFile('.env.development.local');

const port = Number(process.env.API_PORT || 3000);
createApiServer().listen(port, () => {
  console.log(`[dev-api] listening on http://localhost:${port}`);
});
