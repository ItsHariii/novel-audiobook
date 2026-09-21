"use client";

import type { ReactNode } from "react";
import { HomeIcon, LibraryIcon, PlusIcon, SearchIcon, UserIcon } from "@/components/ui/icons";

export type Tab = "home" | "library" | "search" | "you";

const ITEMS: Array<{ tab: Tab; label: string; icon: ReactNode }> = [
  { tab: "home", label: "Home", icon: <HomeIcon size={22} /> },
  { tab: "library", label: "Library", icon: <LibraryIcon size={22} /> },
  { tab: "search", label: "Search", icon: <SearchIcon size={22} /> },
  { tab: "you", label: "You", icon: <UserIcon size={22} /> },
];

function NavButton(props: { label: string; icon: ReactNode; active: boolean; onClick: () => void; rail?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.active ? "page" : undefined}
      aria-label={props.label}
      title={props.label}
      className={`grid place-items-center rounded-2xl transition ${props.rail ? "h-12 w-16 hover:bg-[var(--color-hover)]" : "h-11 w-full"} ${
        props.active ? "text-[var(--color-accent-text)]" : "text-[var(--color-dim)] hover:text-[var(--color-text)]"
      }`}
    >
      {props.icon}
    </button>
  );
}

function AddButton(props: { onClick: () => void; rail?: boolean }) {
  return (
    <button type="button" onClick={props.onClick} aria-label="Add a novel" title="Add a novel"
      className={`grid place-items-center ${props.rail ? "w-16 py-1" : ""}`}>
      <span className="grid h-[38px] w-[50px] place-items-center rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_6px_18px_-6px_color-mix(in_srgb,var(--color-accent)_70%,transparent)]">
        <PlusIcon size={21} />
      </span>
    </button>
  );
}

/** Five destinations: a bottom tab bar on phones. */
export function BottomNav(props: { tab: Tab | null; onTab: (tab: Tab) => void; onAdd: () => void }) {
  const [home, library, search, you] = ITEMS;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-nav)] pb-[calc(env(safe-area-inset-bottom,0px)+12px)] backdrop-blur-xl lg:hidden">
      <div className="grid h-[58px] grid-cols-5 items-center px-1.5">
        {[home, library].map((i) => <NavButton key={i.tab} {...i} active={props.tab === i.tab} onClick={() => props.onTab(i.tab)} />)}
        <AddButton onClick={props.onAdd} />
        {[search, you].map((i) => <NavButton key={i.tab} {...i} active={props.tab === i.tab} onClick={() => props.onTab(i.tab)} />)}
      </div>
    </nav>
  );
}

/** The same destinations as a slim rail on wide screens. */
export function NavRail(props: { tab: Tab | null; onTab: (tab: Tab) => void; onAdd: () => void; theme: "light" | "dark" }) {
  return (
    <nav aria-label="Main" className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center gap-2 border-r border-[var(--color-border)] bg-[var(--color-bg)] py-5 lg:flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.theme === "light" ? "/logo-light.png" : "/logo.png"} alt="Tome" className="mb-5 h-10 w-10" />
      <AddButton rail onClick={props.onAdd} />
      <div className="my-2 h-px w-10 bg-[var(--color-border)]" />
      {ITEMS.map((i) => <NavButton key={i.tab} rail {...i} active={props.tab === i.tab} onClick={() => props.onTab(i.tab)} />)}
    </nav>
  );
}
