"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Speed choices, as multiples of the 1× reading pace. */
export const AUTO_SCROLL_SPEEDS = [0.5, 0.75, 1, 1.5, 2] as const;
export type AutoScrollSpeed = (typeof AUTO_SCROLL_SPEEDS)[number];
export const DEFAULT_AUTO_SCROLL_SPEED: AutoScrollSpeed = 1;

// 1× moves 90px a second on a phone-width strip (390px): a screen of art
// passes in about eight seconds, room to read a bubble or two. Pages scale with
// the strip's width (capped at 800px), so the pace does too, keeping the same
// feel on a tablet or desktop.
const BASE_PX_PER_S = 90;
const REFERENCE_WIDTH = 390;
const MIN_WIDTH = 280;
const MAX_WIDTH = 800;

/** Pixels per second for a speed on a strip this wide. */
export function autoScrollRate(speed: number, stripWidth: number): number {
  const w = Math.min(Math.max(stripWidth, MIN_WIDTH), MAX_WIDTH);
  return BASE_PX_PER_S * speed * (w / REFERENCE_WIDTH);
}

export function speedLabel(speed: number): string {
  return `${speed}×`;
}

const LS_SPEED = "nab:comic-autoscroll-speed";

export function readAutoScrollSpeed(): AutoScrollSpeed {
  try {
    const n = Number(localStorage.getItem(LS_SPEED));
    return (AUTO_SCROLL_SPEEDS as readonly number[]).includes(n) ? (n as AutoScrollSpeed) : DEFAULT_AUTO_SCROLL_SPEED;
  } catch {
    return DEFAULT_AUTO_SCROLL_SPEED;
  }
}

export function writeAutoScrollSpeed(speed: AutoScrollSpeed) {
  try { localStorage.setItem(LS_SPEED, String(speed)); } catch { /* storage full or blocked */ }
}

// After a finger lifts, wait for any fling to settle before taking over again.
const RESUME_AFTER_TOUCH_MS = 600;

/**
 * Scrolls `ref` down at `speed` while `running`. A finger on the screen holds
 * it in place; scrolling by hand or wheel just moves where it carries on from.
 * `held()` is checked every frame (e.g. a sheet is open). When the bottom is
 * reached `onBottom()` is called each frame until more content arrives. Keeps
 * the screen awake while running.
 */
export function useAutoScroll(ref: RefObject<HTMLElement | null>, opts: {
  running: boolean;
  speed: number;
  held: () => boolean;
  onBottom: () => void;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const el = ref.current;
    if (!opts.running || !el) return;
    // Track position as a float: browsers round scrollTop, and slow speeds
    // move less than a pixel a frame.
    let y = el.scrollTop;
    let last = performance.now();
    let touching = false;
    let holdUntil = 0;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // A backgrounded tab pauses frames; don't jump when it comes back.
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      if (touching || now < holdUntil || optsRef.current.held()) { y = el.scrollTop; return; }
      // Moved by hand (wheel, scrollbar, chapter jump): carry on from there.
      if (Math.abs(el.scrollTop - y) > 2) y = el.scrollTop;
      const max = el.scrollHeight - el.clientHeight;
      if (y >= max - 1) {
        y = max;
        optsRef.current.onBottom();
        return;
      }
      y = Math.min(max, y + autoScrollRate(optsRef.current.speed, el.clientWidth) * dt);
      el.scrollTop = y;
    };
    raf = requestAnimationFrame(tick);

    const down = () => { touching = true; };
    const up = () => { touching = false; holdUntil = performance.now() + RESUME_AFTER_TOUCH_MS; };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchend", up, { passive: true });
    el.addEventListener("touchcancel", up, { passive: true });

    // Hands-free reading shouldn't let the screen dim and lock.
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const wake = () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      navigator.wakeLock.request("screen").then((l) => {
        if (alive) lock = l; else void l.release().catch(() => {});
      }).catch(() => {});
    };
    wake();
    document.addEventListener("visibilitychange", wake);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
      document.removeEventListener("visibilitychange", wake);
      void lock?.release().catch(() => {});
    };
  }, [ref, opts.running]);
}
