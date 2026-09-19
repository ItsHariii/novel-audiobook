-- Personal library. All client writes go through the revision-checked RPC.
create table public.books (
  user_id uuid not null references auth.users on delete cascade,
  book_key text not null,
  title text not null,
  source text not null,
  latest_url text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_key)
);
create table public.chapter_progress (
  user_id uuid not null references auth.users on delete cascade,
  chapter_url text not null,
  book_key text not null,
  payload jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, chapter_url),
  foreign key (user_id, book_key) references public.books on delete cascade
);
alter table public.books enable row level security;
alter table public.chapter_progress enable row level security;
revoke all on public.books, public.chapter_progress from anon, authenticated;
grant select on public.books, public.chapter_progress to authenticated;
create policy own_books on public.books for select to authenticated using ((select auth.uid()) = user_id);
create policy own_progress on public.chapter_progress for select to authenticated using ((select auth.uid()) = user_id);

create function public.save_progress(p jsonb, expected_revision bigint, importing boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  existing public.chapter_progress;
  saved public.chapter_progress;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p) <> 'object' or length(p::text) > 16000
    or coalesce(p->>'chapterUrl', '') !~ '^https?://' or length(p->>'chapterUrl') > 4096
    or coalesce(p->>'bookKey', '') = '' or coalesce(p->>'title', '') = ''
    or coalesce(p->>'mode', '') not in ('reader', 'rsvp', 'audio')
    or coalesce(p->>'audioTime', '') !~ '^\d+(\.\d+)?$'
    or coalesce(p->>'readerChunk', '') !~ '^\d+$'
    or coalesce(p->>'readerOffset', '') !~ '^\d+(\.\d+)?$'
    or coalesce(p->>'wordIndex', '') !~ '^\d+$'
    or expected_revision is null or expected_revision < 0 then raise exception 'Invalid progress'; end if;
  -- Serializes inserts as well as updates; a missing row cannot be FOR UPDATE locked.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || (p->>'chapterUrl'), 0));
  select * into existing from public.chapter_progress
    where user_id = uid and chapter_url = p->>'chapterUrl';
  if found and (importing or existing.revision <> expected_revision) then
    return jsonb_build_object('accepted', false, 'record', to_jsonb(existing) - 'user_id');
  end if;
  if existing.revision is null and expected_revision <> 0 then raise exception 'Progress was removed'; end if;
  insert into public.books (user_id, book_key, title, source, latest_url)
    values (uid, p->>'bookKey', coalesce(nullif(p->>'bookTitle', ''), p->>'title'), coalesce(p->>'source', ''), p->>'chapterUrl')
    on conflict (user_id, book_key) do update set title = excluded.title,
      latest_url = excluded.latest_url, updated_at = now();
  insert into public.chapter_progress (user_id, chapter_url, book_key, payload)
    values (uid, p->>'chapterUrl', p->>'bookKey', p)
    on conflict (user_id, chapter_url) do update set book_key = excluded.book_key,
      payload = excluded.payload, revision = public.chapter_progress.revision + 1, updated_at = now()
    returning * into saved;
  return jsonb_build_object('accepted', true, 'record', to_jsonb(saved) - 'user_id');
end $$;
revoke all on function public.save_progress(jsonb, bigint, boolean) from public, anon;
grant execute on function public.save_progress(jsonb, bigint, boolean) to authenticated;

create table public.audio_assets (
  id text primary key,
  generation uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  chapter jsonb not null,
  voice text not null,
  chunks jsonb not null,
  bytes bigint not null default 0,
  last_used_at timestamptz not null default now()
);
create table public.audio_chunks (
  asset_id text not null references public.audio_assets on delete cascade,
  chunk_index integer not null,
  parts jsonb not null,
  duration double precision not null,
  bytes bigint not null,
  primary key (asset_id, chunk_index)
);
create table public.playback_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  token_hash text not null,
  voice text not null,
  requested_ordinal integer not null default 0,
  last_request_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  terminal boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
create table public.session_chapters (
  session_id uuid not null references public.playback_sessions on delete cascade,
  ordinal integer not null,
  asset_id text not null references public.audio_assets,
  primary key (session_id, ordinal)
);
create table public.audio_jobs (
  id text primary key,
  session_id uuid references public.playback_sessions on delete cascade,
  kind text not null check (kind in ('prepare', 'synthesize')),
  payload jsonb not null,
  state text not null default 'queued' check (state in ('queued','running','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  error text,
  created_at timestamptz not null default now()
);
create index audio_jobs_due on public.audio_jobs (available_at, created_at) where state in ('queued','running');
create index session_asset on public.session_chapters (asset_id);

create table public.audio_gc (
  id uuid primary key,
  paths jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.audio_gc enable row level security;
revoke all on public.audio_gc from anon, authenticated;
grant all on public.audio_gc to service_role;

-- Retire metadata and remember object deletions in the same transaction.
-- The row lock/FK prevents eviction racing a new session attachment.
create function public.retire_audio_asset(asset text, incarnation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare paths jsonb;
begin
  perform 1 from public.audio_assets where id = asset and generation = incarnation for update;
  if not found then return false; end if;
  if exists (select 1 from public.session_chapters where asset_id = asset) then return false; end if;
  select coalesce(jsonb_agg(p->>'path'), '[]'::jsonb) into paths
    from public.audio_chunks c cross join lateral jsonb_array_elements(c.parts) p where c.asset_id = asset;
  insert into public.audio_gc(id, paths) values (incarnation, paths) on conflict do nothing;
  delete from public.audio_jobs where payload->>'generation' = incarnation::text;
  delete from public.audio_assets where id = asset and generation = incarnation;
  return true;
end $$;
revoke all on function public.retire_audio_asset(text, uuid) from public, anon, authenticated;
grant execute on function public.retire_audio_asset(text, uuid) to service_role;

create function public.audio_cache_bytes() returns bigint
language sql security definer set search_path = '' as $$
  select coalesce(sum(bytes), 0)::bigint from public.audio_chunks;
$$;
create function public.audio_cache_candidates() returns table(id text, generation uuid, bytes bigint)
language sql security definer set search_path = '' as $$
  select a.id, a.generation, coalesce(sum(c.bytes),0)::bigint
    from public.audio_assets a left join public.audio_chunks c on c.asset_id = a.id
    where not exists (select 1 from public.session_chapters s where s.asset_id = a.id)
    group by a.id order by a.last_used_at limit 25;
$$;
revoke all on function public.audio_cache_bytes() from public, anon, authenticated;
revoke all on function public.audio_cache_candidates() from public, anon, authenticated;
grant execute on function public.audio_cache_bytes() to service_role;
grant execute on function public.audio_cache_candidates() to service_role;

-- Audio is accessed through authenticated server routes or a session capability.
alter table public.audio_assets enable row level security;
alter table public.audio_chunks enable row level security;
alter table public.playback_sessions enable row level security;
alter table public.session_chapters enable row level security;
alter table public.audio_jobs enable row level security;
revoke all on public.audio_assets, public.audio_chunks, public.playback_sessions, public.session_chapters, public.audio_jobs from anon, authenticated;
grant all on public.books, public.chapter_progress, public.audio_assets, public.audio_chunks,
  public.playback_sessions, public.session_chapters, public.audio_jobs to service_role;

create function public.claim_audio_job() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job public.audio_jobs;
begin
  perform pg_advisory_xact_lock(19092026);
  if (select count(*) from public.audio_jobs where state = 'running' and lease_until > now()) >= 2 then return null; end if;
  update public.audio_jobs set state = 'failed', error = 'Preparation timed out. Retry playback.'
    where state = 'running' and lease_until < now() and attempts >= 3;
  select j.* into job from public.audio_jobs j
    where ((j.state = 'queued' and j.available_at <= now()) or (j.state = 'running' and j.lease_until < now()))
      and j.attempts < 3
      and (
        (j.kind = 'prepare' and exists (select 1 from public.playback_sessions s where s.id = j.session_id and s.expires_at > now()))
        or (j.kind = 'synthesize' and exists (
          select 1 from public.session_chapters c join public.playback_sessions s on s.id = c.session_id
          where c.asset_id = j.payload->>'assetId' and s.expires_at > now()
        ))
      )
    order by (j.payload->>'ordinal')::integer nulls first, j.created_at, j.id
    limit 1 for update skip locked;
  if not found then return null; end if;
  update public.audio_jobs set state = 'running', attempts = attempts + 1,
    lease_until = now() + interval '90 seconds', lease_token = gen_random_uuid()
    where id = job.id returning * into job;
  return to_jsonb(job);
end $$;
revoke all on function public.claim_audio_job() from public, anon, authenticated;
grant execute on function public.claim_audio_job() to service_role;

create function public.audio_demand(sid uuid, ordinal integer) returns void
language sql security definer set search_path = '' as $$
  update public.playback_sessions set requested_ordinal = greatest(requested_ordinal, ordinal), last_request_at = now()
    where id = sid and expires_at > now();
$$;
revoke all on function public.audio_demand(uuid, integer) from public, anon, authenticated;
grant execute on function public.audio_demand(uuid, integer) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('chapter-audio', 'chapter-audio', false, 5242880, array['audio/mpeg'])
  on conflict (id) do nothing;
-- Intentionally no storage.objects client policy: private audio is served via signed URLs.
