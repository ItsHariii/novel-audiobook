# Tome

A tiny web app that turns any web novel chapter URL into a continuously-playing audiobook with natural-sounding voices, using free Microsoft Edge Read-Aloud TTS under the hood.

Designed for mobile: background playback with the screen locked, lock-screen media controls, and speed adjustment up to 2.5x.

## Features

- Paste a chapter URL and press play
- Natural-sounding voices via Microsoft Edge TTS (free, no API key)
- Playback speed 0.75x – 2.5x with pitch preservation
- Skip 15s forward / back, previous / next chapter
- **Auto-advances** to the next chapter seamlessly (next chapter is prefetched and pre-synthesized in the background)
- Lock-screen / notification controls on iOS and Android via the Media Session API
- Resumes from where you left off (per-chapter position saved in `localStorage`)
- Jump to any paragraph in the chapter by tapping it
- Site-specific adapters for accurate content extraction (skydemonorder.com included; generic fallback works on many other sites)

## Tech

- Next.js 15 App Router + TypeScript + Tailwind v4
- `msedge-tts` for streaming MP3 from Microsoft Edge's Read-Aloud service
- `cheerio` for server-side HTML parsing (bypasses CORS)

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

To use it from your phone on the same Wi-Fi network, run `npm run dev -- -H 0.0.0.0` and visit `http://<your-mac-lan-ip>:3000` from the phone.

## Deploy to Vercel (free)

```bash
npx vercel
```

The `/api/tts` route must run on Node.js runtime (not Edge) because `msedge-tts` uses a Node WebSocket client — the route file already declares this via `export const runtime = "nodejs"`.

## Adding a new site

Create `lib/adapters/yoursite.ts` exporting a `(html, url) => Chapter` function, then register its hostname in `lib/adapters/index.ts`. The generic fallback uses heuristics (largest `<p>`-dense container, rel=next/prev, text-matching nav links) and works on many sites without any adapter at all.
