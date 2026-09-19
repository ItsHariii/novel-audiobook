import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("database migration enforces ownership, revisions, imports and job leases", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon, service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/202609190001_library_audio.sql", import.meta.url), "utf8"));
    await db.exec("set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'");
    const p = { chapterUrl: "https://example.com/book/1", bookKey: "book", title: "Book", source: "example.com", mode: "audio", voice: "Ava", audioTime: 12, readerChunk: 0, readerOffset: 0, wordIndex: 0 };
    const save = async (expected: number, importing = false) => (await db.query<{ result: { accepted: boolean; record: { revision: number } } }>("select public.save_progress($1::jsonb,$2,$3) as result", [JSON.stringify(p), expected, importing])).rows[0].result;
    assert.equal((await save(0)).record.revision, 1);
    assert.equal((await save(1)).record.revision, 2);
    assert.equal((await save(1)).accepted, false);
    assert.equal((await save(2, true)).accepted, false);
    assert.equal((await db.query("select * from public.chapter_progress")).rows.length, 1);
    await assert.rejects(db.exec("update public.chapter_progress set revision = 100"), /permission denied/);
    await assert.rejects(db.exec("select * from public.audio_assets"), /permission denied/);
    await assert.rejects(db.exec("select public.claim_audio_job()"), /permission denied/);
    await db.exec("set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'");
    assert.equal((await db.query("select * from public.chapter_progress")).rows.length, 0);
    assert.equal((await db.query("select * from public.books")).rows.length, 0);
    await db.exec("set role anon");
    await assert.rejects(db.exec("select * from public.chapter_progress"), /permission denied/);
    await assert.rejects(save(0), /permission denied/);
    await db.exec("reset role");
    await db.exec(`insert into public.playback_sessions(id,user_id,token_hash,voice) values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','hash','voice');
      insert into public.audio_jobs(id,session_id,kind,payload) select 'job-' || i,'33333333-3333-3333-3333-333333333333','prepare','{"ordinal":0}'::jsonb from generate_series(1,3) i;`);
    await db.exec("set role service_role");
    const claim = async () => (await db.query<{ job: { id: string; lease_token: string; attempts: number } | null }>("select public.claim_audio_job() as job")).rows[0].job;
    const first = await claim(); const second = await claim();
    assert.ok(first?.lease_token); assert.ok(second?.lease_token);
    assert.notEqual(first.id, second.id); assert.equal(await claim(), null);
    await db.query("update public.audio_jobs set lease_until = now() - interval '1 minute' where id=$1", [first.id]);
    const retried = await claim();
    assert.equal(retried?.id, first.id); assert.equal(retried?.attempts, 2);
    assert.notEqual(retried?.lease_token, first.lease_token);
    await db.exec(`insert into public.audio_assets(id,generation,user_id,chapter,voice,chunks)
      values ('asset','44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','{}','voice','["text"]');
      insert into public.audio_chunks(asset_id,chunk_index,parts,duration,bytes)
      values ('asset',0,'[{"path":"private/audio.mp3","duration":6}]',6,36000);
      insert into public.session_chapters(session_id,ordinal,asset_id)
      values ('33333333-3333-3333-3333-333333333333',0,'asset');`);
    const retire = async () => (await db.query<{ retired: boolean }>("select public.retire_audio_asset('asset','44444444-4444-4444-4444-444444444444') as retired")).rows[0].retired;
    assert.equal(Number((await db.query<{ bytes: number }>("select public.audio_cache_bytes() as bytes")).rows[0].bytes), 36000);
    assert.equal((await db.query("select * from public.audio_cache_candidates()")).rows.length, 0);
    assert.equal(await retire(), false, "Active sessions pin their audio");
    await db.exec("delete from public.playback_sessions where id='33333333-3333-3333-3333-333333333333'");
    assert.equal((await db.query("select * from public.audio_cache_candidates()")).rows.length, 1);
    assert.equal(await retire(), true);
    assert.deepEqual((await db.query<{ paths: string[] }>("select paths from public.audio_gc")).rows[0].paths, ["private/audio.mp3"]);
    assert.equal((await db.query("select * from public.audio_assets")).rows.length, 0);
    await db.exec(`
      insert into public.playback_sessions(id,user_id,token_hash,voice) values
      ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','hash','voice'),
      ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','hash','voice');
      insert into public.audio_assets(id,user_id,chapter,voice,chunks) values ('shared','11111111-1111-1111-1111-111111111111','{}','voice','["text"]');
      insert into public.session_chapters(session_id,ordinal,asset_id) values
      ('55555555-5555-5555-5555-555555555555',0,'shared'), ('66666666-6666-6666-6666-666666666666',0,'shared');
      insert into public.audio_jobs(id,kind,payload) values ('shared-job','synthesize','{"assetId":"shared","ordinal":0}');
      delete from public.playback_sessions where id='66666666-6666-6666-6666-666666666666';
    `);
    assert.equal((await claim())?.id, 'shared-job', "Closing one device must not cancel another device's preparation");
    // Exercise the actual scheduler SQL with local no-network extension stubs.
    await db.exec(`reset role;
      update public.audio_jobs set state = 'done';
      delete from public.audio_gc;
      create schema cron; create schema net; create schema vault;
      create table net.calls(url text);
      create table vault.decrypted_secrets(name text, decrypted_secret text);
      insert into vault.decrypted_secrets values
        ('tome_worker_url','https://example.test/api/audio-worker'), ('tome_worker_secret','test-secret');
      create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
      create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
        returns bigint language plpgsql as $$begin insert into net.calls values (url); return 1; end$$;
    `);
    const scheduler = (await readFile(new URL("../supabase/schedule.sql", import.meta.url), "utf8"))
      .replace(/^create extension[^\n]+\n/gm, "");
    await db.exec(scheduler);
    await db.exec(scheduler); // Safe upgrade: replaces the function and named jobs.
    const dispatches = async () => {
      await db.exec("truncate net.calls; select public.dispatch_audio_jobs()");
      return (await db.query("select * from net.calls")).rows.length;
    };
    assert.equal(await dispatches(), 0, "Idle active sessions need no worker calls");
    await db.exec(`insert into public.audio_assets(id,user_id,chapter,voice,chunks)
      values ('orphan','11111111-1111-1111-1111-111111111111','{}','voice','[]');`);
    assert.equal(await dispatches(), 0, "New assets get time to attach before cleanup");
    await db.exec("update public.audio_assets set last_used_at = now() - interval '3 minutes' where id='orphan'");
    assert.equal(await dispatches(), 2, "Abandoned text/audio wakes cleanup even below the storage limit");
    await db.exec("select public.retire_audio_asset(id,generation) from public.audio_assets where id='orphan'; delete from public.audio_gc");
    await db.exec("update public.playback_sessions set expires_at = now() - interval '1 minute'");
    assert.equal(await dispatches(), 2, "Expired sessions wake cleanup without queued audio jobs");
    await db.exec("delete from public.playback_sessions where expires_at <= now(); select public.retire_audio_asset(id,generation) from public.audio_assets");
    assert.equal((await db.query("select * from public.audio_assets")).rows.length, 0);
    assert.equal((await db.query("select * from public.chapter_progress")).rows.length, 1, "Audio cleanup preserves stopping points");
  } finally { await db.close(); }
});
