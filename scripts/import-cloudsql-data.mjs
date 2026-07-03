import { readFileSync } from 'node:fs';
import pgPkg from 'pg';

const { Pool } = pgPkg;

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error('Usage: npm run db:import-cloudsql -- <path-to-export.json>');
}

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const databaseUrl = readEnv('DATABASE_URL');
const dbUser = readEnv('PGUSER', 'DB_USER');
const dbPassword = readEnv('PGPASSWORD', 'DB_PASSWORD');
const dbName = readEnv('PGDATABASE', 'DB_NAME');
const dbHost = readEnv('PGHOST', 'DB_HOST');
const dbPort = Number.parseInt(readEnv('PGPORT', 'DB_PORT') || '5432', 10);

if (!databaseUrl && !(dbUser && dbPassword && dbName && dbHost)) {
  throw new Error('Provide DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE before importing data into Cloud SQL.');
}

const payload = JSON.parse(readFileSync(inputPath, 'utf8'));
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    })
  : new Pool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    });

const insertProfiles = async (client, rows) => {
  for (const row of rows || []) {
    await client.query(
      `
        INSERT INTO profiles (
          id,
          legacy_user_id,
          email,
          credits,
          is_premium,
          last_daily_reset,
          shadow_notes,
          streak_count,
          last_streak_claim,
          total_time_spent_ms,
          premium_source,
          premium_platform,
          premium_product_id,
          premium_base_plan_id,
          premium_transaction_id,
          premium_expires_at,
          premium_verified_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, NULL, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          COALESCE($17, NOW()), COALESCE($18, NOW())
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          credits = EXCLUDED.credits,
          is_premium = EXCLUDED.is_premium,
          last_daily_reset = EXCLUDED.last_daily_reset,
          shadow_notes = EXCLUDED.shadow_notes,
          streak_count = EXCLUDED.streak_count,
          last_streak_claim = EXCLUDED.last_streak_claim,
          total_time_spent_ms = EXCLUDED.total_time_spent_ms,
          premium_source = EXCLUDED.premium_source,
          premium_platform = EXCLUDED.premium_platform,
          premium_product_id = EXCLUDED.premium_product_id,
          premium_base_plan_id = EXCLUDED.premium_base_plan_id,
          premium_transaction_id = EXCLUDED.premium_transaction_id,
          premium_expires_at = EXCLUDED.premium_expires_at,
          premium_verified_at = EXCLUDED.premium_verified_at,
          updated_at = COALESCE(EXCLUDED.updated_at, NOW())
      `,
      [
        String(row.id),
        row.email,
        row.credits ?? 0,
        Boolean(row.is_premium),
        row.last_daily_reset,
        row.shadow_notes ?? '',
        row.streak_count ?? 1,
        row.last_streak_claim,
        row.total_time_spent_ms ?? 0,
        row.premium_source,
        row.premium_platform,
        row.premium_product_id,
        row.premium_base_plan_id,
        row.premium_transaction_id,
        row.premium_expires_at,
        row.premium_verified_at,
        row.created_at,
        row.updated_at,
      ]
    );
  }
};

const insertSavedItems = async (client, rows) => {
  for (const row of rows || []) {
    await client.query(
      `
        INSERT INTO saved_items (id, user_id, content, type, created_at, updated_at)
        VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), COALESCE($6, NOW()))
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          content = EXCLUDED.content,
          type = EXCLUDED.type,
          updated_at = COALESCE(EXCLUDED.updated_at, NOW())
      `,
      [row.id, String(row.user_id), row.content, row.type, row.created_at, row.updated_at]
    );
  }
};

const insertPremiumSubscriptions = async (client, rows) => {
  for (const row of rows || []) {
    await client.query(
      `
        INSERT INTO premium_subscriptions (
          id,
          user_id,
          platform,
          product_id,
          base_plan_id,
          transaction_id,
          purchase_token_identifier,
          is_active,
          purchase_date,
          expires_at,
          raw_payload,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          COALESCE($9, NOW()), $10, COALESCE($11::jsonb, '{}'::jsonb),
          COALESCE($12, NOW()), COALESCE($13, NOW())
        )
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          platform = EXCLUDED.platform,
          product_id = EXCLUDED.product_id,
          base_plan_id = EXCLUDED.base_plan_id,
          transaction_id = EXCLUDED.transaction_id,
          purchase_token_identifier = EXCLUDED.purchase_token_identifier,
          is_active = EXCLUDED.is_active,
          expires_at = EXCLUDED.expires_at,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = COALESCE(EXCLUDED.updated_at, NOW())
      `,
      [
        row.id,
        String(row.user_id),
        row.platform,
        row.product_id,
        row.base_plan_id,
        row.transaction_id,
        row.purchase_token_identifier ?? row.purchase_token ?? null,
        row.is_active ?? true,
        row.purchase_date,
        row.expires_at,
        row.raw_payload ? JSON.stringify(row.raw_payload) : null,
        row.created_at,
        row.updated_at,
      ]
    );
  }
};

const insertReports = async (client, rows) => {
  for (const row of rows || []) {
    await client.query(
      `
        INSERT INTO reports (id, user_id, content, type, created_at)
        VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          content = EXCLUDED.content,
          type = EXCLUDED.type
      `,
      [row.id, row.user_id ? String(row.user_id) : null, row.content, row.type, row.created_at]
    );
  }
};

const insertUserActivity = async (client, rows) => {
  for (const row of rows || []) {
    await client.query(
      `
        INSERT INTO user_activity_log (user_id, active_date, created_at)
        VALUES ($1, $2, COALESCE($3, NOW()))
        ON CONFLICT (user_id, active_date) DO NOTHING
      `,
      [String(row.user_id), row.active_date, row.created_at]
    );
  }
};

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await insertProfiles(client, payload.profiles);
  await insertSavedItems(client, payload.saved_items);
  await insertPremiumSubscriptions(client, payload.premium_subscriptions);
  await insertReports(client, payload.reports);
  await insertUserActivity(client, payload.user_activity_log);
  await client.query('COMMIT');
  console.log('[import-cloudsql-data] Import completed successfully.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
