# Connect Tome to Supabase

The code works in local-only mode without Supabase variables. When cloud variables
are present, sign-in is required for the library and prepared-audio playback.
Existing local history is retained and imported on the first sign-in per device.

## 1. Create the private account and database

1. Create a Supabase project in a region close to your Vercel deployment.
2. In **Authentication → Providers → Email**, enable email/password login and
   disable new user signups. In **Authentication → Users**, add your own account
   with a confirmed email and password. There is no public signup screen.
3. Run `supabase/migrations/202609190001_library_audio.sql` in the SQL Editor,
   or apply it with the Supabase CLI migration workflow. This creates the library,
   revision-checked save function, audio jobs, sessions, and private
   `chapter-audio` bucket. Do not make that bucket public.
4. Copy `.env.example` to `.env.local` and fill in the project URL, publishable
   key, service-role key, and a random worker secret (at least 32 random bytes).
   Keep `.env.local` out of git. The service-role key and worker secret are
   server-only; never add the `NEXT_PUBLIC_` prefix to them.
5. Add the same variables to the Vercel project's environment settings and
   redeploy. Public variables are included at build time. Use Node.js 22 or later.

The browser uses Supabase's persisted email/password session. API routes verify
its bearer token with Supabase before using any privileged database access.
Library rows are readable only by their owner. Clients cannot write directly to
progress tables, audio tables, jobs, or Storage.

## 2. Enable preparation while the phone is locked

After deployment, add these secrets in **Supabase Vault**:

| Secret | Value |
| --- | --- |
| `tome_worker_url` | `https://YOUR_APP.vercel.app/api/audio-worker` |
| `tome_worker_secret` | Exactly the value of `AUDIO_WORKER_SECRET` on Vercel |

Run `supabase/schedule.sql` in the SQL Editor. It enables `pg_cron` and `pg_net`,
checks for pending work every ten seconds, and invokes up to two short workers.
The database enforces a maximum of two active job leases, regardless of duplicate
HTTP invocations. Completed jobs are removed after seven days.

The worker URL must be reachable from Supabase. If Vercel deployment protection
requires an interactive login, use your production domain or configure the
appropriate machine-to-machine bypass in the dispatch headers. Do not expose
the worker without its bearer secret.

For local development, the first chapter also advances through foreground status
requests. To exercise independent preparation, run the app through a development
tunnel reachable by Supabase, or repeatedly POST to `/api/audio-worker` with
`Authorization: Bearer YOUR_WORKER_SECRET`. Never replace the production Vault
URL with localhost: Supabase cannot reach your laptop's loopback interface.

## 3. Check the rollout

1. Sign in on the device that already has your reading history. Confirm the
   library imports and **Continue** restores the saved position.
2. Sign in on a second device. Confirm the latest synced position appears.
3. Start one chapter. A cold chapter shows **Preparing audio** while its chunks
   are generated, but the chapter text should already be readable. If generation
   fails, the text stays visible and **Retry audio** does not clear your reading
   position. Confirm **Audio ready** appears and upcoming chapters appear as ready
   in session status.
4. Lock an actual iPhone with Tome installed. Listen across at least five chapters
   at 1× and 2.5×; verify no repeats, skips, or chapter-boundary source reloads.
5. Test pause/resume, reader scroll restoration, RSVP, changing voice, manual
   chapter navigation, short network loss, and returning from the background.
6. Test end-of-chapter and end-of-part sleep settings while locked. Timed sleep
   uses the end of a roughly six-second media segment when JavaScript is
   suspended, so its stopping time has segment-level precision.

Do not treat desktop automation as proof of iOS background behavior. Live
Supabase/Storage/TTS and locked-screen tests are required before relying on the
new pipeline for unattended listening.

## Behavior and limits

- Text/voice/version hashes deduplicate generation. Stored MP3 is split at audio
  frame boundaries with HLS timestamp tags and measured durations.
- Each session has one growing EVENT playlist. Automatic chapter transitions
  update metadata and progress without replacing the audio source. Explicit
  navigation, voice changes, and sleep-setting changes may replace it.
- Media requests replenish two chapters beyond the requested chapter. This
  also works when iOS suspends React. Buffering requests are preparation hints,
  never evidence that a chapter was actually read or heard.
- Progress is saved locally every three seconds and on pause/navigation;
  cloud writes are flushed every ten seconds and on lifecycle events. Suspended
  or force-terminated JavaScript cannot report an exact last-second position.
- Conflicting device saves retain the local pending position and ask which
  position to keep. Initial imports always preserve an existing cloud record.
- Audio access uses a random capability valid for a maximum of 24 hours.
  Treat the playlist URL like a private link. Expired sessions are resumed by
  creating a new session at the saved chapter-relative position.
- Signing out closes this browser's active audio session. Switching chapters
  closes the previous session; closing the browser relies on session expiry.
- `AUDIO_CACHE_MAX_BYTES` defaults to 750,000,000 bytes. Cleanup removes the
  text/audio assets no active session needs after a two-minute grace period,
  even when the cache is not full. Under storage pressure, unpinned assets can
  be removed sooner. Active sessions protect their assets; a full pinned cache
  pauses preparation instead of discarding audio in use. Earlier audio within
  the same continuous session remains available until that session closes or
  expires, so native HLS can keep using its growing playlist.
- History imports and progress records contain chapter URLs, titles, and stopping
  points, never chapter bodies or audio. Importing history does not fetch or
  synthesize those earlier chapters. Only an opened chapter and its two successors
  are prepared. Library/progress records are never evicted by audio cleanup.
- Free-tier capacity is not unlimited. Monitor Supabase Storage/egress and Vercel
  function usage. There are no offline downloads or whole-book generation jobs.
- Microsoft Edge TTS remains an external dependency. Outages and network loss
  can still interrupt listening; initial uncached preparation is not instant.

If upgrading from the initial Supabase version, redeploy the app and rerun
`supabase/schedule.sql` (safe to rerun) so idle cleanup also runs after sessions
close or expire. Do not rerun the original table-creation migration.

## Diagnostics and local tests

Run `npm test`, `npm run typecheck`, and `npm run build`.
`npm run test:browser` uses a temporary Chrome profile, mocked cloud responses,
and audio generated locally with `ffmpeg`; install Chrome and FFmpeg first.
The database test applies the migration to an embedded PostgreSQL instance with
minimal Supabase auth/storage schemas; it tests ownership, revisions, and leases,
but does not replace testing the deployed Supabase services.

Inspect `audio_jobs.state`, `attempts`, `error`, and `lease_until` for preparation
failures. The worker logs job duration and failures under `[tome]` in Vercel.
Inspect Supabase Cron run history and `net._http_response` for dispatch failures.
Never paste private playback URLs, bearer tokens, or service keys into logs.

To roll back the application, remove its Supabase environment variables and
redeploy to restore local-only playback. Disable the `tome-audio-worker` Cron
job. Keep the database and bucket so your synced history and audio remain intact.
