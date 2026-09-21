import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { packMp3 } from "../lib/audio/mp3";
import { eventPlaylist, readyChapters } from "../lib/audio/playlist";
import type { AudioAsset, PlaybackSession } from "../lib/audio/types";
import type { ChapterProgress, ProgressRecord } from "../lib/library/types";

const voice = "en-US-AvaNeural";
const user = { id: "11111111-1111-1111-1111-111111111111", email: "reader@example.com", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };

async function mockLibrary(page: Page, options: { audio?: "ready" | "pending" | "failed"; longText?: boolean } = {}) {
  // Deterministic locally generated audio: no TTS or real Supabase credentials.
  const mp3 = execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-ar", "24000", "-ac", "1", "-b:a", "48k", "-f", "mp3", "pipe:1"]);
  const parts = packMp3(mp3);
  const duration = parts.reduce((n, p) => n + p.duration, 0);
  const rows = Array.from({ length: 5 }, (_, ordinal) => ({ ordinal, asset: {
    id: `asset-${ordinal}`, generation: "test", user_id: user.id, voice, bytes: mp3.length,
    chapter: { url: `https://example.com/novel/chapter-${ordinal + 1}`, bookTitle: "The Quiet Library", title: "The Quiet Library", chapterLabel: `Chapter ${ordinal + 1}`, source: "example.com", paragraphs: ["A quiet room, a shelf of books, and the next chapter."], nextUrl: ordinal < 4 ? `https://example.com/novel/chapter-${ordinal + 2}` : null, prevUrl: null },
    chunks: ["A quiet room, a shelf of books, and the next chapter."],
    audio_chunks: [{ chunk_index: 0, duration, bytes: mp3.length, parts: parts.map((p, i) => ({ path: `${i}.mp3`, duration: p.duration })) }],
  } satisfies AudioAsset }));
  const session: PlaybackSession = { id: "33333333-3333-3333-3333-333333333333", playlistUrl: "/api/playback-sessions/33333333-3333-3333-3333-333333333333/manifest?token=test", voice, chapters: readyChapters(rows), preparing: false, terminal: true, error: null };
  if (options.longText) {
    const text = "A quiet room, a shelf of books, and the next chapter. ".repeat(250);
    for (const row of rows) { row.asset.chapter.paragraphs = [text]; row.asset.chunks = [text]; }
    session.chapters = readyChapters(rows);
  }
  let audioState = options.audio ?? "ready";
  const p: ChapterProgress = { chapterUrl: rows[0].asset.chapter.url, bookKey: "https://example.com/novel", title: "The Quiet Library", bookTitle: "The Quiet Library", chapterLabel: "Chapter 1", source: "example.com", mode: "audio", audioTime: 2, voice, readerChunk: 0, readerOffset: 0, wordIndex: 0 };
  const records = new Map<string, ProgressRecord>([[p.chapterUrl, { chapter_url: p.chapterUrl, book_key: p.bookKey, payload: p, revision: 1, updated_at: new Date().toISOString() }]]);
  const saved: ChapterProgress[] = [];
  let sourceCreates = 0;
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    let body: unknown = {};
    if (url.pathname.endsWith("/token")) {
      const encode = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
      const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.test`;
      body = { access_token: token, refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user };
    } else if (url.pathname.endsWith("/user")) body = user;
    else if (url.pathname.endsWith("/chapter_progress")) body = [...records.values()];
    else if (url.pathname.endsWith("/save_progress")) {
      const { p: incoming } = route.request().postDataJSON() as { p: ChapterProgress };
      saved.push(incoming);
      const record: ProgressRecord = { chapter_url: incoming.chapterUrl, book_key: incoming.bookKey, payload: incoming, revision: (records.get(incoming.chapterUrl)?.revision ?? 0) + 1, updated_at: new Date().toISOString() };
      records.set(incoming.chapterUrl, record);
      body = { accepted: true, record };
    }
    await route.fulfill({ json: body, headers: { "access-control-allow-origin": "*" } });
  });
  await page.route("**/api/playback-sessions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/media")) {
      const part = parts[Number(url.searchParams.get("part"))];
      return route.fulfill({ contentType: "audio/mpeg", body: part.data });
    }
    if (url.pathname.endsWith("/manifest")) return route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: eventPlaylist(session.chapters, rows, session.id, "test", Number(url.searchParams.get("stop") || Infinity)) });
    if (route.request().method() === "POST") sourceCreates++;
    return route.fulfill({ json: route.request().method() === "PATCH" ? { ok: true } : audioState === "ready" ? session : {
      ...session, chapters: [], preparing: true, terminal: false,
      error: audioState === "failed" ? "Audio preparation failed. Use Retry audio to try again." : null,
    } });
  });
  await page.route("**/api/chapter-meta?**", async (route) => {
    const url = new URL(route.request().url()).searchParams.get("url");
    const chapter = session.chapters.find((c) => c.chapter.url === url) ?? session.chapters[0];
    return route.fulfill({ json: { ok: true, key: "test", voice, chapter: chapter.chapter, chunks: chapter.chunks.map((c) => ({ ...c, estDuration: 20 })) } });
  });
  return { session, saved, sourceCreates: () => sourceCreates, setAudio: (state: typeof audioState) => { audioState = state; } };
}

async function signIn(page: Page) {
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(user.email);
  await page.locator('input[name="password"]:visible').fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("private library resumes and crosses chapters without reloading its source", async ({ page }) => {
  await page.addInitScript(() => document.addEventListener("error", (event) => {
    if (event.target instanceof HTMLMediaElement) console.log("Media diagnostic", event.target.error?.code, event.target.error?.message, event.target.canPlayType("application/vnd.apple.mpegurl"));
  }, true));
  page.on("console", (message) => { if (message.text().startsWith("Media diagnostic")) console.log(message.text()); });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mock = await mockLibrary(page);
  await page.goto("/");
  await signIn(page);
  await expect(page.getByRole("button", { name: /Continue · Chapter 1/ })).toBeVisible();
  await expect(page.locator("main").getByText("Chapter 1", { exact: true })).toBeVisible();
  const audio = page.locator("audio");
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState)).toBeGreaterThan(0);
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeCloseTo(2, 0);
  const src = await audio.getAttribute("src");
  await page.getByRole("button", { name: "Open player" }).click();
  await page.getByRole("button", { name: "Playback speed: 1.15x" }).click();
  await page.getByRole("menuitem", { name: "2.5x", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  for (const chapter of mock.session.chapters.slice(1)) {
    await expect(page.locator("main").getByText(chapter.chapter.chapterLabel!, { exact: true })).toBeVisible({ timeout: 12_000 });
    expect(await audio.getAttribute("src")).toBe(src);
  }
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(mock.sourceCreates()).toBe(1);
  await page.getByRole("button", { name: "Minimise player" }).click();
  await page.getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue ·/ })).toHaveCount(0);
  expect(mock.saved.some((p) => p.chapterLabel === "Chapter 5" && p.audioTime < 3)).toBe(true);
  expect(errors).toEqual([]);
});

test("full-screen sign-in leads to the mobile library", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockLibrary(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good stories. Open ears." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile-welcome.png", fullPage: true });
  await signIn(page);
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Continue · / })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await page.screenshot({ path: `test-results/mobile-library-${theme}.png`, fullPage: true, animations: "disabled" });
  }
  await page.getByRole("button", { name: "You", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
});

test("welcome handles sign-in errors and password visibility", async ({ page }) => {
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    return route.fulfill({ status: 400, json: { code: "invalid_credentials", message: "Invalid login credentials" }, headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Library", exact: true })).toHaveCount(0);
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await page.screenshot({ path: `test-results/desktop-welcome-${theme}.png`, fullPage: true, animations: "disabled" });
  }
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("test-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("test-password");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await signIn(page);
  await expect(page.locator("form").getByRole("alert")).toHaveText("Invalid login credentials");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("a saved session opens the library directly", async ({ page }) => {
  await mockLibrary(page);
  await page.goto("/");
  await signIn(page);
  await page.getByRole("button", { name: "You", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "You", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toHaveCount(0);
});

test("text remains readable through audio preparation, failure and retry", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mock = await mockLibrary(page, { audio: "pending", longText: true });
  await page.goto("/");
  await signIn(page);
  await expect(page.locator("main").getByText("Chapter 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Read this chapter instead" }).click();
  await expect(page.getByText("Preparing audio · you can read while you wait.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Preparing audio/ })).toBeDisabled();
  expect(await page.locator("audio").getAttribute("src")).toBeNull();
  const reader = page.locator("main .overflow-y-auto");
  await reader.evaluate((el) => { el.scrollTop = 650; });
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBeGreaterThan(600);
  mock.setAudio("failed");
  await expect(page.getByRole("button", { name: "Retry audio" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/You can keep reading/)).toBeVisible();
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBeGreaterThan(600);
  // Saving reader progress while audio is unavailable must not reset audio time.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => mock.saved.length).toBeGreaterThan(0);
  expect(mock.saved.at(-1)?.audioTime).toBe(2);
  expect(mock.saved.at(-1)?.readerOffset).toBeGreaterThan(0);
  mock.setAudio("pending");
  await page.getByRole("button", { name: "Retry audio" }).click();
  await expect(page.getByText("Preparing audio · you can read while you wait.")).toBeVisible();
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBeGreaterThan(600);
  mock.setAudio("ready");
  await expect(page.getByText("Audio ready · press Play whenever you like.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Listen from here" })).toBeEnabled();
  await expect.poll(() => page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime)).toBeCloseTo(2, 0);
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBeGreaterThan(600);
  await page.getByRole("button", { name: "Listen from here" }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await reader.evaluate((el) => { el.scrollTop = 650; });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(() => reader.evaluate((el) => el.scrollTop)).toBeGreaterThan(600);
  for (const theme of ["dark", "light"]) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await page.screenshot({ path: `test-results/reader-${theme}.png`, animations: "disabled" });
  }
  expect(errors).toEqual([]);
});
