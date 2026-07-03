import pg from 'pg';

const { Pool } = pg;

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const normalizeInt = (value, fallback) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const databaseUrl = readEnv('DATABASE_URL');
const dbUser = readEnv('PGUSER', 'DB_USER');
const dbPassword = readEnv('PGPASSWORD', 'DB_PASSWORD');
const dbName = readEnv('PGDATABASE', 'DB_NAME');
const connectionName = readEnv('INSTANCE_CONNECTION_NAME', 'CLOUDSQL_CONNECTION_NAME');
const dbHost = readEnv('PGHOST', 'DB_HOST') || (connectionName ? `/cloudsql/${connectionName}` : null);
const dbPort = normalizeInt(readEnv('PGPORT', 'DB_PORT'), 5432);
const sslMode = readEnv('PGSSLMODE');

const ssl =
  databaseUrl && sslMode === 'require'
    ? { rejectUnauthorized: false }
    : null;

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl: ssl || undefined,
      max: normalizeInt(readEnv('PGPOOL_MAX', 'DB_POOL_MAX'), 10),
      idleTimeoutMillis: normalizeInt(readEnv('PG_IDLE_TIMEOUT_MS'), 30000),
    }
  : {
      user: dbUser || undefined,
      password: dbPassword || undefined,
      database: dbName || undefined,
      host: dbHost || undefined,
      port: dbPort,
      max: normalizeInt(readEnv('PGPOOL_MAX', 'DB_POOL_MAX'), 10),
      idleTimeoutMillis: normalizeInt(readEnv('PG_IDLE_TIMEOUT_MS'), 30000),
      ssl: ssl || undefined,
    };

export const isDatabaseConfigured = Boolean(
  databaseUrl || (dbUser && dbPassword && dbName && dbHost)
);

export const pool = isDatabaseConfigured
  ? new Pool(poolConfig)
  : null;

export const withTransaction = async (work) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
