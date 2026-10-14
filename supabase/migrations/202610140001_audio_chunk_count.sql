-- Session polling decides whether a chapter is fully synthesized by comparing
-- its chunk count with its synthesized chunks. Reading `chunks` for that pulled
-- the whole chapter text out of the database on every poll.
alter table public.audio_assets
  add column chunk_count integer generated always as (jsonb_array_length(chunks)) stored;
