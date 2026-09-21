import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Stroke({ size = 20, strokeWidth = 1.7, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

function Fill({ size = 20, children, ...rest }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>{children}</svg>;
}

export const PlayIcon = (p: IconProps) => <Fill {...p}><path d="M7 4.5v15a1 1 0 0 0 1.55.83l11.2-7.5a1 1 0 0 0 0-1.66L8.55 3.67A1 1 0 0 0 7 4.5Z" /></Fill>;
export const PauseIcon = (p: IconProps) => <Fill {...p}><rect x="6.5" y="4.5" width="4" height="15" rx="1.2" /><rect x="13.5" y="4.5" width="4" height="15" rx="1.2" /></Fill>;
export const PrevChapterIcon = (p: IconProps) => <Fill {...p}><path d="M6 5.5a1 1 0 0 1 2 0v13a1 1 0 0 1-2 0zM19 5.8v12.4a1 1 0 0 1-1.52.85L9.6 13.9a1 1 0 0 1 0-1.7l7.88-5.25A1 1 0 0 1 19 5.8Z" /></Fill>;
export const NextChapterIcon = (p: IconProps) => <Fill {...p}><path d="M18 5.5a1 1 0 0 0-2 0v13a1 1 0 0 0 2 0zM5 5.8v12.4a1 1 0 0 0 1.52.85l7.88-5.15a1 1 0 0 0 0-1.7L6.52 6.95A1 1 0 0 0 5 5.8Z" /></Fill>;

export function Back15Icon(p: IconProps) {
  return (
    <Stroke {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <text x="12.5" y="15.6" textAnchor="middle" fontFamily="inherit" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">15</text>
    </Stroke>
  );
}
export function Fwd15Icon(p: IconProps) {
  return (
    <Stroke {...p}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v4h-4" />
      <text x="11.5" y="15.6" textAnchor="middle" fontFamily="inherit" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">15</text>
    </Stroke>
  );
}

export const HomeIcon = (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1Z" /></Stroke>;
export const LibraryIcon = (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><path d="M4 4h4v16H4zM10 4h4v16h-4z" /><path d="m17 5 3.2.8-3.5 14.4-3.2-.8z" /></Stroke>;
export const PlusIcon = (p: IconProps) => <Stroke strokeWidth={2.3} {...p}><path d="M12 5v14M5 12h14" /></Stroke>;
export const SearchIcon = (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></Stroke>;
export const UserIcon = (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></Stroke>;
export const BookIcon = (p: IconProps) => <Stroke strokeWidth={1.6} {...p}><path d="M12 6c-2.5-1.4-5-1.4-8-.6v12c3-.8 5.5-.8 8 .6 2.5-1.4 5-1.4 8-.6V5.4c-3-.8-5.5-.8-8 .6Zm0 0v13" /></Stroke>;
export const HeadphonesIcon = (p: IconProps) => <Stroke {...p}><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="3" y="12.5" width="4" height="7" rx="2" /><rect x="17" y="12.5" width="4" height="7" rx="2" /></Stroke>;
export const ChevronDownIcon = (p: IconProps) => <Stroke strokeWidth={1.9} {...p}><path d="m6 9 6 6 6-6" /></Stroke>;
export const ChevronLeftIcon = (p: IconProps) => <Stroke strokeWidth={1.9} {...p}><path d="m15 6-6 6 6 6" /></Stroke>;
export const ChevronRightIcon = (p: IconProps) => <Stroke strokeWidth={1.9} {...p}><path d="m9 6 6 6-6 6" /></Stroke>;
export const ListIcon = (p: IconProps) => <Stroke {...p}><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r=".6" fill="currentColor" /><circle cx="4" cy="12" r=".6" fill="currentColor" /><circle cx="4" cy="18" r=".6" fill="currentColor" /></Stroke>;
export const MoonIcon = (p: IconProps) => <Stroke strokeWidth={1.6} {...p}><path d="M21 12.3A9 9 0 1 1 11.7 3a7 7 0 0 0 9.3 9.3z" /></Stroke>;
export const LinkIcon = (p: IconProps) => <Stroke {...p}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></Stroke>;
export const CheckIcon = (p: IconProps) => <Stroke strokeWidth={2.6} {...p}><path d="M20 6 9 17l-5-5" /></Stroke>;
export const CloseIcon = (p: IconProps) => <Stroke strokeWidth={1.9} {...p}><path d="M6 6l12 12M18 6 6 18" /></Stroke>;
export const AlertIcon = (p: IconProps) => <Stroke {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Stroke>;
export const RetryIcon = (p: IconProps) => <Stroke {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Stroke>;
export const TypeIcon = (p: IconProps) => <Stroke {...p}><path d="M4 18 9 6l5 12M5.8 14h6.4" /><path d="M15 18l3-7 3 7M15.9 16h4.2" /></Stroke>;
export const ArrowRightIcon = (p: IconProps) => <Stroke strokeWidth={1.8} {...p}><path d="M4 12h15M13 5l7 7-7 7" /></Stroke>;
export const SunIcon = (p: IconProps) => <Stroke strokeWidth={1.6} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></Stroke>;
export const SystemIcon = (p: IconProps) => <Stroke strokeWidth={1.6} {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Stroke>;

export function EqBars({ playing = true }: { playing?: boolean }) {
  return (
    <span aria-hidden className="flex h-4 shrink-0 items-end gap-[2px]">
      {[8, 14, 6].map((h, i) => (
        <i key={i} className="block w-[2px] rounded-[2px] bg-[var(--color-accent)]"
          style={{ height: h, animation: playing ? `tome-eq 900ms ease-in-out ${i * 150}ms infinite` : undefined }} />
      ))}
    </span>
  );
}
