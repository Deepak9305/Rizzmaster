import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set before exporting data.');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  'profiles',
  'saved_items',
  'premium_subscriptions',
  'reports',
  'user_activity_log',
];

const pageSize = 1000;

const fetchAllRows = async (table) => {
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to export ${table}: ${error.message}`);
    }

    rows.push(...(data || []));
    if (!data || data.length < pageSize) {
      break;
    }
  }

  return rows;
};

const exportPayload = {};
for (const table of tables) {
  console.log(`[export-supabase-data] Exporting ${table}...`);
  exportPayload[table] = await fetchAllRows(table);
}

mkdirSync('migration', { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = join('migration', `supabase-export-${timestamp}.json`);
writeFileSync(outputPath, JSON.stringify(exportPayload, null, 2), 'utf8');
console.log(`[export-supabase-data] Wrote ${outputPath}`);
