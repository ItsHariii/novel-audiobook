-- Run AFTER the migration and AFTER setting these Vault secrets in the dashboard:
-- tome_worker_url = https://YOUR_APP.vercel.app/api/audio-worker
-- tome_worker_secret = the same random value as AUDIO_WORKER_SECRET on Vercel
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_audio_jobs() returns void
language plpgsql security definer set search_path = '' as $$
declare endpoint text; secret text; slot integer;
begin
  if not exists (
    select 1 from public.audio_jobs j where
      ((j.state = 'queued' and j.available_at <= now()) or (j.state = 'running' and j.lease_until < now()))
      and (
        (j.kind = 'prepare' and exists (select 1 from public.playback_sessions s where s.id = j.session_id and s.expires_at > now()))
        or (j.kind = 'synthesize' and exists (
          select 1 from public.session_chapters c join public.playback_sessions s on s.id = c.session_id
          where c.asset_id = j.payload->>'assetId' and s.expires_at > now()
        ))
      )
  ) and not exists (select 1 from public.audio_gc) then return; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'tome_worker_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'tome_worker_secret';
  if endpoint is null or secret is null then raise exception 'Configure the Tome worker Vault secrets first'; end if;
  for slot in 1..2 loop
    perform net.http_post(url := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  end loop;
end $$;
revoke all on function public.dispatch_audio_jobs() from public, anon, authenticated;
select cron.schedule('tome-audio-worker', '10 seconds', 'select public.dispatch_audio_jobs()');
-- Keep completed queue entries briefly for diagnostics. Missing completed jobs
-- may safely be recreated: generation checks for already-published audio first.
select cron.schedule('tome-audio-job-retention', '17 3 * * *',
  $$delete from public.audio_jobs where state = 'done' and created_at < now() - interval '7 days'$$);
