import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('web credits cap guests and accounts, preserve the shared balance, and refund across midnight', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.profiles (id uuid primary key, credits integer);
      grant select, update on public.profiles to service_role;
      insert into public.profiles values ('00000000-0000-0000-0000-000000000001', 5);
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261125090000_web_daily_credits.sql', import.meta.url), 'utf8'));
    const id = '00000000-0000-0000-0000-000000000001';
    const day = '2026-11-25';
    const nextDay = '2026-11-26';
    const quota = async (account, guest, date, change) => {
      const result = await db.query('select public.web_daily_credits($1, $2, $3, $4) as remaining', [account, guest, date, change]);
      return result.rows[0].remaining;
    };
    await db.exec('set role authenticated');
    await assert.rejects(quota(id, null, day, 1), /permission denied/);
    await db.exec('set role service_role');
    const attempts = await Promise.allSettled([quota(null, id, day, 2), quota(null, id, day, 2)]);
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(await quota(null, id, day, 1), 0);
    assert.equal(await quota(null, id, nextDay, 0), 3);
    assert.equal(await quota(null, id, day, -2), 2);
    assert.equal(await quota(null, id, nextDay, 0), 3);

    assert.equal(await quota(id, null, day, 2), 1);
    assert.equal(await quota(id, null, day, 1), 0);
    await assert.rejects(quota(id, null, day, 1), /insufficient credits/i);
    assert.equal((await db.query('select credits from profiles')).rows[0].credits, 2);
    await db.exec('update profiles set credits = credits - 1');
    assert.equal(await quota(id, null, day, -2), 2);
    assert.equal((await db.query('select credits from profiles')).rows[0].credits, 3);
  } finally {
    await db.close();
  }
});
