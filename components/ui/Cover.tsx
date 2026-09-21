"use client";

import { useState } from "react";

// Dark, saturated pairs so white type reads on them in either app theme —
// covers are artwork, not chrome.
const GRADIENTS: Array<[string, string]> = [
  ["#5c4bb0", "#2a2440"],
  ["#3c5a6e", "#1c2530"],
  ["#6b4636", "#2a1c17"],
  ["#4a4560", "#211f2e"],
  ["#3f5c4a", "#1b241e"],
  ["#6e3b52", "#27161f"],
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function coverGradient(seed: string): string {
  const [from, to] = GRADIENTS[hash(seed) % GRADIENTS.length];
  return `linear-gradient(160deg, ${from}, ${to})`;
}

const SIZES = {
  xs: { box: "h-[42px] w-[42px] rounded-[9px]", title: "hidden", byline: "hidden", pad: "p-0" },
  sm: { box: "h-[88px] w-[62px] rounded-[9px]", title: "text-[10px] leading-[1.25]", byline: "hidden", pad: "p-2" },
  md: { box: "h-[150px] w-[104px] rounded-xl", title: "text-[13px] leading-[1.25]", byline: "text-[7.5px]", pad: "p-3" },
  lg: { box: "h-[120px] w-[84px] rounded-[10px]", title: "text-xs leading-[1.25]", byline: "text-[7.5px]", pad: "p-[11px]" },
  xl: { box: "aspect-[2/3] w-full max-w-[240px] rounded-2xl", title: "text-2xl leading-[1.2]", byline: "text-[10px]", pad: "p-5" },
} as const;

/**
 * Book cover: the real image when we found one, otherwise a generated
 * gradient with the title. The gradient also sits under the image while it
 * loads and stays if the image fails.
 */
export function Cover(props: {
  title: string;
  seed?: string;
  byline?: string;
  src?: string;
  size: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const size = SIZES[props.size];
  const showImage = !!props.src && failed !== props.src;
  return (
    <div
      aria-hidden
      className={`relative flex shrink-0 flex-col justify-between overflow-hidden border border-white/10 shadow-[0_10px_24px_-10px_var(--color-shadow)] ${size.box} ${size.pad} ${props.className ?? ""}`}
      style={{ background: coverGradient(props.seed || props.title) }}
    >
      <span className={`font-serif font-medium text-white ${size.title} line-clamp-4`}>{props.title}</span>
      {props.byline && <span className={`font-semibold uppercase tracking-[0.14em] text-white/60 ${size.byline}`}>{props.byline}</span>}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(props.src ?? null)}
          onError={() => setFailed(props.src ?? null)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${loaded === props.src ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
