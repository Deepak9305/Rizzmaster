import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const account = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const migration = readFileSync(new URL('../supabase/migrations/20261028071111_add_client_reward_claims.sql', import.meta.url), 'utf8');
async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS 'SELECT current_setting(''request.jwt.claims'', true)::jsonb';
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users, credits integer, is_premium boolean);
    INSERT INTO auth.users VALUES ('${account}'), ('${other}');
    INSERT INTO public.profiles VALUES ('${account}',0,false), ('${other}',0,false);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA auth TO service_role;
    GRANT EXECUTE ON FUNCTION auth.jwt() TO service_role;
    GRANT SELECT, UPDATE ON public.profiles TO service_role;
    CREATE FUNCTION public.protect_credits() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('app.bypass_profile_trigger',true) IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Credit changes require backend'; END IF;
      RETURN NEW; END; $$;
    CREATE TRIGGER protect_credits BEFORE UPDATE OF credits ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_credits();
  `);
  await db.exec(migration);
  await db.exec(`SET ROLE service_role; SET request.jwt.claims = '{"role":"service_role"}';`);
  return db;
}
const claim = async (db, id, user = account, cost = 1) => (await db.query(
  'SELECT public.admin_claim_client_reward($1::uuid,$2::uuid,$3::integer) AS result', [user, id, cost])).rows[0].result;

test('SQL applies exactly five credits once for concurrently submitted duplicate claims', async () => {
  const db = await database();
  try {
    const results = await Promise.all(Array.from({ length: 20 }, () => claim(db, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')));
    assert.equal(results.filter(r => r.idempotent === false).length, 1);
    assert.ok(results.every(r => r.status === 'granted' && r.credits === 5));
    assert.equal((await db.query('SELECT credits FROM public.profiles WHERE id=$1', [account])).rows[0].credits, 5);
  } finally { await db.close(); }
});
test('distinct simultaneous claims are eligibility-checked after the account lock', async () => {
  const db = await database();
  try {
    const results = await Promise.all([
      claim(db, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), claim(db, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ]);
    assert.equal(results.filter(r => r.status === 'granted').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason, 'CREDITS_AVAILABLE');
  } finally { await db.close(); }
});
test('claims are account-scoped; premium and invalid generation costs are rejected', async () => {
  const db = await database();
  try {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    assert.equal((await claim(db, id)).status, 'granted');
    assert.equal((await claim(db, id, other)).status, 'granted');
    await assert.rejects(claim(db, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', account, 3), /Invalid reward claim/);
    await db.exec(`UPDATE public.profiles SET is_premium=true WHERE id='${other}';`);
    assert.equal((await claim(db, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', other)).reason, 'PREMIUM_USER');
    assert.equal((await claim(db, id, other)).status, 'granted'); // Acknowledgement survives later profile changes.
  } finally { await db.close(); }
});
test('anonymous and authenticated clients cannot call grant function or access claim ledger', async () => {
  const db = await database();
  try {
    for (const role of ['anon','authenticated']) {
      await db.exec(`RESET ROLE; SET ROLE ${role}; SET request.jwt.claims='{"role":"${role}"}';`);
      await assert.rejects(claim(db,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), /permission denied/);
      await assert.rejects(db.query('SELECT * FROM public.client_reward_claims'), /permission denied/);
    }
  } finally { await db.close(); }
});
